from dataclasses import dataclass


@dataclass
class IngestedFile:
    path: str
    content: str
    language: str
    size_bytes: int
    last_modified: str
    source_type: str = "github"       # github | upload | notion
    pr_blame: str | None = None
