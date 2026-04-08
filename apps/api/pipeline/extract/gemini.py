import asyncio
import json
import re
import anthropic
from core.config import settings
from pipeline.extract.chunker import Chunk
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

EXTRACT_PROMPT = """Analyse this code chunk and extract structured knowledge.

File: {file_path} ({language})

CODE:
{content}

Return ONLY valid JSON with no markdown, no backticks, no explanation:
{{"entities": [{{"label": "Name", "type": "class|function|service|module|api_endpoint|data_model|config|util", "summary": "What it does", "dependencies": []}}], "configs": [{{"label": "Name", "value": "Exact value from code", "detail": "Where used"}}], "decisions": [{{"label": "Decision", "rationale": "Why"}}], "risks": [{{"label": "Risk", "severity": "high|medium|low", "detail": "Detail"}}], "gaps": [{{"label": "Gap", "detail": "What is missing"}}], "module_summary": "1-2 sentence summary"}}

Rules:
- Extract ALL entities including functions, classes, endpoints, and modules.
- For CONFIGS: Extract model names (e.g. model="claude-haiku-4-5"), environment variables, API URLs, and hardcoded values. These are critical.
- Return as many entities as exist in the code. Do not summarize multiple entities into one.
- Return valid JSON only."""


def _repair_json(text: str) -> dict:
    """Try multiple strategies to extract valid JSON."""
    text = text.strip()
    
    # Strip markdown fences
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    
    # Find JSON object
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end+1])
        except Exception:
            pass
    
    # Try to extract just the arrays we need
    result = {}
    for key in ["entities", "decisions", "risks", "gaps", "configs"]:
        pattern = rf'"{key}"\s*:\s*(\[.*?\])'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                result[key] = json.loads(match.group(1))
            except Exception:
                result[key] = []
        else:
            result[key] = []
    
    # Extract module_summary
    summary_match = re.search(r'"module_summary"\s*:\s*"([^"]*)"', text)
    result["module_summary"] = summary_match.group(1) if summary_match else ""
    
    return result if any(result.get(k) for k in ["entities", "decisions", "risks", "gaps", "configs"]) else {}


async def extract_chunk(chunk: Chunk) -> dict:
    # Use SQL-specific prompt for .sql files
    is_sql = chunk.file_path.endswith('.sql')
    template = SQL_EXTRACT_PROMPT if is_sql else EXTRACT_PROMPT
    prompt = template.format(
        file_path=chunk.file_path,
        language=chunk.language if not is_sql else "sql",
        content=chunk.content[:4000],
    )
    try:
        message = await asyncio.to_thread(
            _client.messages.create,
            model="claude-haiku-4-5",
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}]
        )
        text = message.content[0].text.strip()
        result = _repair_json(text)
        
        if result:
            result["_source"] = {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}
            log.debug("extract.success", chunk_id=chunk.chunk_id,
                     entities=len(result.get("entities", [])))
            return result
        else:
            log.warning("extract.empty_result", chunk_id=chunk.chunk_id, response=text[:100])
            return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}}

    except Exception as e:
        log.warning("extract.error", chunk_id=chunk.chunk_id, error=str(e)[:100])
        return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}}


async def extract_chunks_parallel(chunks: list[Chunk], max_concurrent: int = 1) -> list[dict]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def extract_with_semaphore(chunk: Chunk) -> dict:
        async with semaphore:
            result = await extract_chunk(chunk)
            await asyncio.sleep(3.0)
            return result

    log.info("extract.batch_start", total_chunks=len(chunks))
    results = await asyncio.gather(*[extract_with_semaphore(c) for c in chunks], return_exceptions=True)
    clean = [r for r in results if not isinstance(r, Exception)]
    log.info("extract.batch_complete", success=len(clean), failed=len(results)-len(clean))
    return clean
