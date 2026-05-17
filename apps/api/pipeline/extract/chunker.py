import tiktoken
from dataclasses import dataclass
from pipeline.ingest.models import IngestedFile
import structlog

log = structlog.get_logger()
_enc = tiktoken.get_encoding("cl100k_base")

MAX_CHUNK_TOKENS = 6000
OVERLAP_CHARS = 500


@dataclass
class Chunk:
    file_path: str
    language: str
    content: str
    chunk_id: str
    token_count: int


def _count_tokens(text: str) -> int:
    return len(_enc.encode(text, disallowed_special=()))


def _split_text(text: str, max_tokens: int, overlap: int) -> list[str]:
    """Split text into overlapping chunks by token count."""
    if _count_tokens(text) <= max_tokens:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        # Binary search for the right end position
        end = min(start + max_tokens * 4, len(text))  # rough char estimate
        snippet = text[start:end]

        # Trim down to max_tokens
        while _count_tokens(snippet) > max_tokens and len(snippet) > 100:
            snippet = snippet[:int(len(snippet) * 0.9)]

        chunks.append(snippet)
        # Move start forward, minus overlap
        start += max(len(snippet) - overlap, 100)

    return chunks


def chunk_file(file: IngestedFile) -> list[Chunk]:
    """Split an ingested file into token-bounded chunks."""
    if not file.content or not file.content.strip():
        return []

    parts = _split_text(file.content, MAX_CHUNK_TOKENS, OVERLAP_CHARS)
    chunks = []
    for i, part in enumerate(parts):
        tc = _count_tokens(part)
        chunks.append(Chunk(
            file_path=file.path,
            language=file.language,
            content=part,
            chunk_id=f"{file.path}::chunk_{i}",
            token_count=tc,
        ))

    log.debug("chunker.split", file=file.path, chunks=len(chunks),
              total_tokens=sum(c.token_count for c in chunks))
    return chunks
