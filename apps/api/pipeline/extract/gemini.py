import asyncio
import json
import anthropic
from core.config import settings
from pipeline.extract.chunker import Chunk
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

EXTRACT_PROMPT = """You are a code intelligence engine. Analyse this code chunk and extract structured knowledge.

File: {file_path} (language: {language}, chunk {chunk_index}/{total_chunks})
```{language}
{content}
```

Return ONLY valid JSON with this exact structure:
{{
  "entities": [{{"label": "EntityName", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "dependencies": [], "exports": true}}],
  "decisions": [{{"label": "Decision title", "rationale": "Why"}}],
  "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail"}}],
  "gaps": [{{"label": "Gap", "detail": "What is missing"}}],
  "apis": [{{"label": "Endpoint", "method": "GET|POST|PUT|DELETE", "path": "/path", "summary": "What it does"}}],
  "data_models": [{{"label": "ModelName", "fields": []}}],
  "module_summary": "2-3 sentence summary"
}}

Only extract what is explicitly present. Empty arrays are fine."""


async def extract_chunk(chunk: Chunk) -> dict:
    prompt = EXTRACT_PROMPT.format(
        file_path=chunk.file_path,
        language=chunk.language,
        chunk_index=chunk.chunk_index + 1,
        total_chunks=chunk.total_chunks,
        content=chunk.content,
    )

    try:
        message = await asyncio.to_thread(
            _client.messages.create,
            model="claude-haiku-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(text)
        result["_source"] = {
            "file_path": chunk.file_path,
            "language": chunk.language,
            "chunk_index": chunk.chunk_index,
            "chunk_id": chunk.chunk_id,
        }
        return result
    except json.JSONDecodeError as e:
        log.warning("extract.json_error", chunk_id=chunk.chunk_id, error=str(e))
        return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}, "_error": "parse_failed"}
    except Exception as e:
        log.error("extract.error", chunk_id=chunk.chunk_id, error=str(e))
        return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}, "_error": str(e)}


async def extract_chunks_parallel(
    chunks: list[Chunk],
    max_concurrent: int = 3,
) -> list[dict]:
    results = []
    semaphore = asyncio.Semaphore(max_concurrent)

    async def extract_with_semaphore(chunk: Chunk) -> dict:
        async with semaphore:
            result = await extract_chunk(chunk)
            await asyncio.sleep(0.3)
            return result

    tasks = [extract_with_semaphore(chunk) for chunk in chunks]
    log.info("extract.batch_start", total_chunks=len(chunks))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    clean = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            log.error("extract.chunk_failed", chunk_index=i, error=str(r))
        else:
            clean.append(r)

    log.info("extract.batch_complete", success=len(clean), failed=len(results) - len(clean))
    return clean
