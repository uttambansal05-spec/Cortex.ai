import asyncio
import sys
sys.path.insert(0, '/app')

from celery import Celery
from core.config import settings
from core.database import get_supabase
import structlog

log = structlog.get_logger()

redis_url = settings.REDIS_URL
if redis_url.startswith('rediss://') and 'ssl_cert_reqs' not in redis_url:
    redis_url = redis_url + '?ssl_cert_reqs=CERT_NONE'

celery_app = Celery("cortex", broker=redis_url, backend=redis_url)
celery_app.conf.update(
    task_serializer="json", result_serializer="json",
    accept_content=["json"], timezone="UTC", enable_utc=True,
    task_track_started=True, task_acks_late=True, worker_prefetch_multiplier=1,
    broker_use_ssl={"ssl_cert_reqs": None},
    redis_backend_use_ssl={"ssl_cert_reqs": None},
    task_max_retries=1,
)


@celery_app.task(bind=True, max_retries=1, name="build_brain")
def build_brain_task(self, project_id: str, snapshot_id: str,
                     incremental: bool = False, changed_files: list[str] | None = None):
    log.info("build_brain.start", project_id=project_id, snapshot_id=snapshot_id)
    db = get_supabase()

    # Check snapshot is still valid (not manually cancelled)
    snap = db.table("brain_snapshots").select("status").eq("id", snapshot_id).single().execute()
    if snap.data and snap.data.get("status") == "failed":
        log.info("build_brain.skipped_cancelled", snapshot_id=snapshot_id)
        return

    try:
        db.table("brain_snapshots").update({"status": "building"}).eq("id", snapshot_id).execute()
        project = db.table("projects").select("*").eq("id", project_id).single().execute()
        if not project.data:
            raise ValueError(f"Project {project_id} not found")

        repo_url = project.data.get("github_repo_url")
        config = project.data.get("config", {})
        if not repo_url:
            raise ValueError("No GitHub repo URL")

        asyncio.run(_run_pipeline(
            project_id=project_id, snapshot_id=snapshot_id,
            repo_url=repo_url, github_token=settings.GITHUB_TOKEN,
            branch=config.get("default_branch", "main"),
            incremental=incremental, changed_files=changed_files or [],
        ))

    except Exception as exc:
        log.error("build_brain.failed", project_id=project_id, error=str(exc))
        db.table("brain_snapshots").update({
            "status": "failed", "metadata": {"error": str(exc)[:500]},
        }).eq("id", snapshot_id).execute()
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=120)


async def _run_pipeline(project_id, snapshot_id, repo_url, github_token, branch, incremental, changed_files):
    from pipeline.ingest.github import ingest_github_repo
    from pipeline.extract.chunker import chunk_file
    from pipeline.extract.gemini import extract_chunks_parallel
    from pipeline.synthesise.claude import synthesise_extractions
    from pipeline.store.brain_writer import write_brain

    files = list(ingest_github_repo(repo_url=repo_url, github_token=github_token,
                                     branch=branch, changed_files=changed_files if incremental else None))
    log.info("pipeline.ingest.complete", file_count=len(files))
    if not files:
        return

    all_chunks = []
    for f in files:
        all_chunks.extend(chunk_file(f))
    log.info("pipeline.chunk.complete", chunk_count=len(all_chunks))

    extractions = await extract_chunks_parallel(all_chunks)
    log.info("pipeline.extract.complete", count=len(extractions))

    graph = await synthesise_extractions(extractions)
    log.info("pipeline.synthesise.complete",
             entities=len(graph.get("entities", [])),
             risks=len(graph.get("risks", [])))

    await write_brain(graph, project_id, snapshot_id)
    log.info("pipeline.store.complete")
