import asyncio
import json
import anthropic
from core.config import settings
from pipeline.extract.chunker import Chunk
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

EXTRACT_PROMPT = """Analyse this code chunk and extract structured knowledge.

File: {file_path} ({language})
```{language}
{content}
```

Return ONLY valid JSON:
{{
  "entities": [{{"label": "Name", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "dependencies": []}}],
  "decisions": [{{"label": "Decision", "rationale": "Why"}}],
  "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail"}}],
  "gaps": [{{"label": "Gap", "detail": "What is missing"}}],
  "module_summary": "1-2 sentence summary"
}}
Only extract what is explicitly present. Be concise."""


async def extract_chunk(chunk: Chunk) -> dict:
    prompt = EXTRACT_PROMPT.format(
        file_path=chunk.file_path,
        language=chunk.language,
        content=chunk.content[:3000],
    )
    try:
        message = await asyncio.to_thread(
            _client.messages.create,
            model="claude-haiku-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}]
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        result["_source"] = {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}
        return result
    except Exception as e:
        log.warning("extract.error", chunk_id=chunk.chunk_id, error=str(e)[:100])
        return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}}


async def extract_chunks_parallel(chunks: list[Chunk], max_concurrent: int = 2) -> list[dict]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def extract_with_semaphore(chunk: Chunk) -> dict:
        async with semaphore:
            result = await extract_chunk(chunk)
            await asyncio.sleep(2.0)
            return result

    log.info("extract.batch_start", total_chunks=len(chunks))
    results = await asyncio.gather(*[extract_with_semaphore(c) for c in chunks], return_exceptions=True)
    clean = [r for r in results if not isinstance(r, Exception)]
    log.info("extract.batch_complete", success=len(clean), failed=len(results)-len(clean))
    return clean
