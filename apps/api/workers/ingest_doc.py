"""Celery task for ingesting uploaded documents into an existing Brain.

Architecture (Approach B):
  1. Parse document -> IngestedFile
  2. Chunk -> extract with DOC_EXTRACT_PROMPT
  3. Synthesize doc extractions SEPARATELY (doc-only graph)
  4. Write doc nodes/edges to existing snapshot
  5. Fetch existing code nodes from snapshot
  6. Run cross-source linker (code nodes + doc nodes -> linking edges)
  7. Write cross-source edges

This preserves code synthesis quality while creating the cross-source
links that are Cortex's core differentiator.
"""

import asyncio
import sys
sys.path.insert(0, '/app')

from workers.build_brain import celery_app
from core.database import get_supabase
import structlog

log = structlog.get_logger()


@celery_app.task(bind=True, max_retries=1, name="ingest_doc")
def ingest_doc_task(self, project_id: str, snapshot_id: str,
                    filename: str, file_b64: str):
    """Ingest a single uploaded document into the Brain.

    file_b64: base64-encoded file content (Celery JSON serialization)
    """
    log.info("ingest_doc.start", project_id=project_id, filename=filename)

    try:
        asyncio.run(_run_doc_pipeline(
            project_id=project_id,
            snapshot_id=snapshot_id,
            filename=filename,
            file_b64=file_b64,
        ))
    except Exception as exc:
        log.error("ingest_doc.failed", project_id=project_id, error=str(exc)[:500])
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)


async def _run_doc_pipeline(project_id: str, snapshot_id: str,
                            filename: str, file_b64: str):
    import base64
    from pipeline.ingest.upload import ingest_uploaded_doc
    from pipeline.extract.chunker import chunk_file
    from pipeline.extract.gemini import extract_chunks_parallel
    from pipeline.synthesise.claude import synthesise_extractions
    from pipeline.synthesise.linker import link_cross_source
    from pipeline.store.brain_writer import (
        write_doc_nodes, write_cross_edges, get_existing_nodes,
    )

    # -- Step 1: Parse document -----------------------------------
    file_bytes = base64.b64decode(file_b64)
    ingested = ingest_uploaded_doc(filename, file_bytes)
    if not ingested:
        log.warning("ingest_doc.parse_failed", filename=filename)
        return

    # -- Step 2: Chunk --------------------------------------------
    chunks = chunk_file(ingested)
    log.info("ingest_doc.chunked", filename=filename, chunks=len(chunks))
    if not chunks:
        return

    # -- Step 3: Extract with doc-aware prompt --------------------
    extractions = await extract_chunks_parallel(chunks)
    log.info("ingest_doc.extracted", filename=filename,
             extractions=len(extractions))
    if not extractions:
        return

    # -- Step 4: Synthesize doc extractions SEPARATELY ------------
    doc_graph = await synthesise_extractions(extractions)
    doc_entity_count = len(doc_graph.get("entities", []))
    log.info("ingest_doc.synthesised", filename=filename,
             entities=doc_entity_count)
    if doc_entity_count == 0:
        log.warning("ingest_doc.empty_synthesis", filename=filename)
        return

    # -- Step 5: Write doc nodes/edges to snapshot ----------------
    write_result = await write_doc_nodes(doc_graph, project_id, snapshot_id)
    doc_label_to_id = write_result["label_to_id"]
    log.info("ingest_doc.nodes_written",
             nodes=write_result["doc_nodes"],
             edges=write_result["doc_edges"])

    # -- Step 6: Fetch existing code nodes for linking ------------
    code_nodes, code_label_to_id = await get_existing_nodes(
        project_id, snapshot_id, domain="code"
    )
    log.info("ingest_doc.code_nodes_found", count=len(code_nodes))

    if not code_nodes:
        log.info("ingest_doc.skip_linker", reason="no_code_nodes")
        return

    # Build doc nodes list from what we just wrote
    doc_nodes_for_linker = []
    for item in doc_graph.get("entities", []):
        if isinstance(item, dict) and item.get("label"):
            doc_nodes_for_linker.append({
                "label": item["label"],
                "node_type": item.get("type", "entity"),
                "summary": item.get("summary", ""),
                "domain": "product",
            })
    for key in ["decisions", "risks", "gaps"]:
        for item in doc_graph.get(key, []):
            if isinstance(item, dict) and item.get("label"):
                doc_nodes_for_linker.append({
                    "label": item["label"],
                    "node_type": key.rstrip("s"),
                    "summary": item.get("detail") or item.get("rationale", ""),
                    "domain": "product",
                })

    # Merge label maps for edge resolution
    full_label_to_id = {**code_label_to_id, **doc_label_to_id}

    # -- Step 7: Cross-source linker ------------------------------
    cross_edges = await link_cross_source(
        code_nodes=code_nodes,
        doc_nodes=doc_nodes_for_linker,
        label_to_id=full_label_to_id,
        snapshot_id=snapshot_id,
        project_id=project_id,
    )

    # -- Step 8: Write cross-source edges -------------------------
    cross_written = await write_cross_edges(cross_edges)

    log.info("ingest_doc.complete",
             filename=filename,
             doc_nodes=write_result["doc_nodes"],
             doc_edges=write_result["doc_edges"],
             cross_edges=cross_written)
