import re
from dataclasses import dataclass
from pipeline.ingest.github import IngestedFile

MAX_CHUNK_TOKENS = 6000   # safe for Gemini Flash context
CHARS_PER_TOKEN  = 4      # rough estimate
OVERLAP_CHARS    = 500    # overlap between chunks to prevent false truncation


@dataclass
class Chunk:
    chunk_id: str
    file_path: str
    language: str
    content: str
    chunk_index: int
    total_chunks: int
    start_line: int
    end_line: int
    tokens_estimate: int


def _estimate_tokens(text: str) -> int:
    return len(text) // CHARS_PER_TOKEN


def _split_by_semantic_boundary(content: str, language: str) -> list[str]:
    """Split code at function/class boundaries where possible."""
    if language in ("python",):
        # Split on top-level def/class
        pattern = r'\n(?=(?:def |class |async def ))'
    elif language in ("javascript", "typescript"):
        # Split on function declarations and class definitions
        pattern = r'\n(?=(?:function |class |const \w+ = |export ))'
    elif language in ("java", "kotlin", "csharp"):
        pattern = r'\n(?=(?:public |private |protected |class |interface ))'
    else:
        pattern = r'\n\n+'  # Split on blank lines for others

    parts = re.split(pattern, content)
    return [p for p in parts if p.strip()]


def chunk_file(file: IngestedFile) -> list[Chunk]:
    """Split a file into context-window-safe chunks."""
    content = file.content
    total_tokens = _estimate_tokens(content)

    # If small enough, return as single chunk
    if total_tokens <= MAX_CHUNK_TOKENS:
        return [Chunk(
            chunk_id=f"{file.path}::0",
            file_path=file.path,
            language=file.language,
            content=content,
            chunk_index=0,
            total_chunks=1,
            start_line=1,
            end_line=content.count('\n') + 1,
            tokens_estimate=total_tokens,
        )]

    # Split semantically first, then by size
    semantic_parts = _split_by_semantic_boundary(content, file.language)
    chunks: list[Chunk] = []
    current_chunk = ""
    current_line = 1
    chunk_start_line = 1

    for part in semantic_parts:
        part_tokens = _estimate_tokens(part)

        if _estimate_tokens(current_chunk + part) > MAX_CHUNK_TOKENS and current_chunk:
            # Flush current chunk
            chunks.append(Chunk(
                chunk_id=f"{file.path}::{len(chunks)}",
                file_path=file.path,
                language=file.language,
                content=current_chunk,
                chunk_index=len(chunks),
                total_chunks=0,  # filled after
                start_line=chunk_start_line,
                end_line=current_line,
                tokens_estimate=_estimate_tokens(current_chunk),
            ))
            # Carry overlap from end of previous chunk to prevent
            # functions split at boundaries appearing "truncated"
            overlap = current_chunk[-OVERLAP_CHARS:] if len(current_chunk) > OVERLAP_CHARS else ""
            chunk_start_line = current_line
            current_chunk = (overlap + "
" + part) if overlap else part
        else:
            current_chunk += ("\n" if current_chunk else "") + part

        current_line += part.count('\n') + 1

    # Flush remaining
    if current_chunk:
        chunks.append(Chunk(
            chunk_id=f"{file.path}::{len(chunks)}",
            file_path=file.path,
            language=file.language,
            content=current_chunk,
            chunk_index=len(chunks),
            total_chunks=0,
            start_line=chunk_start_line,
            end_line=current_line,
            tokens_estimate=_estimate_tokens(current_chunk),
        ))

    # Fill total_chunks
    total = len(chunks)
    for chunk in chunks:
        chunk.total_chunks = total

    return chunks
