import asyncio
import json
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from core.config import settings
from pipeline.extract.chunker import Chunk
import structlog

log = structlog.get_logger()

genai.configure(api_key=settings.GEMINI_API_KEY)
_model = genai.GenerativeModel("gemini-2.0-flash-exp")

EXTRACT_PROMPT = """You are a code intelligence engine. Analyse this code chunk and extract structured knowledge.

File: {file_path} (language: {language}, chunk {chunk_index}/{total_chunks})

```{language}
{content}
```

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{{
  "entities": [
    {{
      "label": "EntityName",
      "type": "class|function|service|module|api_endpoint|data_model|config|util",
      "summary": "One sentence: what it does",
      "dependencies": ["OtherEntity", "ExternalLib"],
      "exports": true,
      "line_range": [start, end]
    }}
  ],
  "decisions": [
    {{
      "label": "Decision title",
      "rationale": "Why this was built this way",
      "source_evidence": "Quote or pattern from code that reveals the decision"
    }}
  ],
  "risks": [
    {{
      "label": "Risk description",
      "severity": "high|medium|low",
      "detail": "What could go wrong and why"
    }}
  ],
  "gaps": [
    {{
      "label": "Missing or incomplete thing",
      "detail": "What's absent or undocumented"
    }}
  ],
  "apis": [
    {{
      "label": "Endpoint or method signature",
      "method": "GET|POST|PUT|DELETE|PATCH|RPC",
      "path": "/path/if/applicable",
      "summary": "What it does",
      "inputs": ["param1: type"],
      "outputs": "return type"
    }}
  ],
  "data_models": [
    {{
      "label": "ModelName",
      "fields": [{{"name": "field", "type": "string", "required": true}}],
      "relations": ["RelatedModel"]
    }}
  ],
  "module_summary": "2-3 sentence summary of what this chunk does in context of the overall product"
}}

Rules:
- Only extract what is EXPLICITLY present in the code
- Empty arrays are fine if nothing found
- Never invent or infer beyond what the code shows
- For summary fields, be concise and specific"""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=30),
    retry=retry_if_exception_type(Exception),
)
async def extract_chunk(chunk: Chunk) -> dict:
    """Extract structured knowledge from a single chunk via Gemini."""
    prompt = EXTRACT_PROMPT.format(
        file_path=chunk.file_path,
        language=chunk.language,
        chunk_index=chunk.chunk_index + 1,
        total_chunks=chunk.total_chunks,
        content=chunk.content,
    )

    try:
        response = await asyncio.to_thread(
            _model.generate_content,
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=4096,
            ),
        )
        text = response.text.strip()

        # Strip markdown fences if present
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
        log.warning("gemini.extract.json_error", chunk_id=chunk.chunk_id, error=str(e))
        return {"_source": {"file_path": chunk.file_path, "chunk_id": chunk.chunk_id}, "_error": "parse_failed"}
    except Exception as e:
        log.error("gemini.extract.error", chunk_id=chunk.chunk_id, error=str(e))
        raise


async def extract_chunks_parallel(
    chunks: list[Chunk],
    max_concurrent: int = 5,  # respect free tier rate limits
) -> list[dict]:
    """Process chunks in parallel with rate limiting."""
    results = []
    semaphore = asyncio.Semaphore(max_concurrent)

    async def extract_with_semaphore(chunk: Chunk) -> dict:
        async with semaphore:
            result = await extract_chunk(chunk)
            # Small delay between requests for rate limiting
            await asyncio.sleep(0.5)
            return result

    tasks = [extract_with_semaphore(chunk) for chunk in chunks]
    log.info("gemini.extract.batch_start", total_chunks=len(chunks))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions, log them
    clean = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            log.error("gemini.extract.chunk_failed", chunk_index=i, error=str(r))
        else:
            clean.append(r)

    log.info("gemini.extract.batch_complete", success=len(clean), failed=len(results) - len(clean))
    return clean
