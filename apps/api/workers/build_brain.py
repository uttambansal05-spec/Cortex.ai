import asyncio
from celery import Celery
from core.config import settings
from core.database import get_supabase
import structlog

log = structlog.get_logger()

celery_app = Celery(
    "cortex",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True, max_retries=2, name="build_brain")
def build_brain_task(
    self,
    project_id: str,
    snapshot_id: str,
    incremental: bool = False,
    changed_files: list[str] | None = None,
):
    """
    Full Brain build pipeline:
    ingest → chunk → extract → synthesise → store
    """
    log.info("build_brain.start",
             project_id=project_id,
             snapshot_id=snapshot_id,
             incremental=incremental)

    db = get_supabase()

    try:
        # Mark as building
        db.table("brain_snapshots").update(
            {"status": "building"}
        ).eq("id", snapshot_id).execute()

        # Get project config
        project = (
            db.table("projects")
            .select("*")
            .eq("id", project_id)
            .single()
            .execute()
        )
        if not project.data:
            raise ValueError(f"Project {project_id} not found")

        config = project.data.get("config", {})
        repo_url = project.data.get("github_repo_url")
        if not repo_url:
            raise ValueError("No GitHub repo URL configured")

        github_token = settings.GITHUB_TOKEN

        # Run async pipeline in sync context
        asyncio.run(_run_pipeline(
            project_id=project_id,
            snapshot_id=snapshot_id,
            repo_url=repo_url,
            github_token=github_token,
            branch=config.get("default_branch", "main"),
            incremental=incremental,
            changed_files=changed_files or [],
        ))

    except Exception as exc:
        log.error("build_brain.failed",
                  project_id=project_id,
                  snapshot_id=snapshot_id,
                  error=str(exc))

        db.table("brain_snapshots").update({
            "status": "failed",
            "metadata": {"error": str(exc)},
        }).eq("id", snapshot_id).execute()

        raise self.retry(exc=exc, countdown=60)


async def _run_pipeline(
    project_id: str,
    snapshot_id: str,
    repo_url: str,
    github_token: str,
    branch: str,
    incremental: bool,
    changed_files: list[str],
):
    from pipeline.ingest.github import ingest_github_repo
    from pipeline.extract.chunker import chunk_file
    from pipeline.extract.gemini import extract_chunks_parallel
    from pipeline.synthesise.claude import synthesise_extractions
    from pipeline.store.brain_writer import write_brain

    log.info("pipeline.ingest.start", repo_url=repo_url, incremental=incremental)

    # Stage 1: Ingest
    files = list(ingest_github_repo(
        repo_url=repo_url,
        github_token=github_token,
        branch=branch,
        changed_files=changed_files if incremental else None,
    ))
    log.info("pipeline.ingest.complete", file_count=len(files))

    if not files:
        log.warning("pipeline.no_files", project_id=project_id)
        return

    # Stage 2: Chunk
    all_chunks = []
    for f in files:
        chunks = chunk_file(f)
        all_chunks.extend(chunks)
    log.info("pipeline.chunk.complete", chunk_count=len(all_chunks))

    # Stage 3: Extract (Gemini, parallel)
    extractions = await extract_chunks_parallel(all_chunks)
    log.info("pipeline.extract.complete", extraction_count=len(extractions))

    # Stage 4: Synthesise (Claude)
    graph = await synthesise_extractions(extractions)
    log.info("pipeline.synthesise.complete",
             entities=len(graph.get("entities", [])),
             risks=len(graph.get("risks", [])))

    # Stage 5: Store
    metadata = await write_brain(graph, project_id, snapshot_id)
    log.info("pipeline.store.complete", metadata=metadata)
