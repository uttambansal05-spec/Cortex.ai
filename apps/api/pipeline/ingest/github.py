import os
import base64
import fnmatch
from dataclasses import dataclass
from typing import Iterator
from github import Github, GithubException
from core.config import settings
import structlog

log = structlog.get_logger()

# File types to ingest by category
INGEST_EXTENSIONS = {
    "code": {
        ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".kt", ".swift",
        ".go", ".rs", ".rb", ".php", ".cs", ".cpp", ".c", ".h",
        ".scala", ".dart", ".r", ".m",
    },
    "config": {
        ".json", ".yaml", ".yml", ".toml", ".env.example",
        ".dockerfile", "dockerfile",
    },
    "docs": {
        ".md", ".mdx", ".txt", ".rst",
    },
    "web": {
        ".html", ".css", ".scss", ".sass", ".vue", ".svelte",
    },
    "android": {
        ".java", ".kt", ".xml", ".gradle",
    },
}

ALL_EXTENSIONS = set().union(*INGEST_EXTENSIONS.values())

# Always skip
DEFAULT_IGNORE = [
    "node_modules/**", ".git/**", "dist/**", "build/**", ".next/**",
    "*.min.js", "*.min.css", "*.map", "*.lock", "*.log",
    "__pycache__/**", "*.pyc", ".venv/**", "venv/**",
    "*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.ico",
    "*.pdf", "*.zip", "*.tar", "*.gz",
    "coverage/**", ".nyc_output/**",
]

MAX_FILE_SIZE_BYTES = settings.MAX_FILE_SIZE_KB * 1024


@dataclass
class IngestedFile:
    path: str
    content: str
    language: str
    size_bytes: int
    last_modified: str
    pr_blame: str | None = None


def get_language(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    lang_map = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".jsx": "javascript", ".tsx": "typescript", ".java": "java",
        ".kt": "kotlin", ".swift": "swift", ".go": "go", ".rs": "rust",
        ".rb": "ruby", ".php": "php", ".cs": "csharp", ".cpp": "cpp",
        ".md": "markdown", ".mdx": "markdown", ".yaml": "yaml", ".yml": "yaml",
        ".json": "json", ".html": "html", ".css": "css", ".xml": "xml",
    }
    return lang_map.get(ext, "text")


def load_cortexignore(repo, branch: str) -> list[str]:
    """Load .cortexignore patterns from repo root."""
    try:
        content = repo.get_contents(".cortexignore", ref=branch)
        patterns = content.decoded_content.decode("utf-8").splitlines()
        return [p.strip() for p in patterns if p.strip() and not p.startswith("#")]
    except GithubException:
        return []


def should_ignore(path: str, ignore_patterns: list[str]) -> bool:
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        # Also match against filename only
        if fnmatch.fnmatch(os.path.basename(path), pattern):
            return True
    return False


def ingest_github_repo(
    repo_url: str,
    github_token: str,
    branch: str = "main",
    changed_files: list[str] | None = None,
) -> Iterator[IngestedFile]:
    """
    Ingest files from a GitHub repo.
    If changed_files is provided, only ingest those (incremental mode).
    """
    g = Github(github_token)
    repo_name = repo_url.rstrip("/").replace("https://github.com/", "")
    repo = g.get_repo(repo_name)

    log.info("github.ingest.start", repo=repo_name, branch=branch)

    # Build ignore list
    ignore_patterns = DEFAULT_IGNORE + load_cortexignore(repo, branch)

    def walk_tree(tree_sha: str, prefix: str = "") -> Iterator[IngestedFile]:
        tree = repo.get_git_tree(tree_sha)
        for item in tree.tree:
            full_path = f"{prefix}{item.path}" if prefix else item.path

            if should_ignore(full_path, ignore_patterns):
                continue

            if item.type == "tree":
                yield from walk_tree(item.sha, f"{full_path}/")

            elif item.type == "blob":
                ext = os.path.splitext(full_path)[1].lower()
                filename = os.path.basename(full_path).lower()

                if ext not in ALL_EXTENSIONS and filename not in ["dockerfile", "makefile", "procfile"]:
                    continue

                if item.size and item.size > MAX_FILE_SIZE_BYTES:
                    log.debug("github.ingest.skip_large", path=full_path, size=item.size)
                    continue

                # If incremental, only process changed files
                if changed_files and full_path not in changed_files:
                    continue

                try:
                    blob = repo.get_git_blob(item.sha)
                    content_bytes = base64.b64decode(blob.content)
                    content = content_bytes.decode("utf-8", errors="replace")

                    yield IngestedFile(
                        path=full_path,
                        content=content,
                        language=get_language(full_path),
                        size_bytes=len(content_bytes),
                        last_modified="",  # set from commits if needed
                    )
                except Exception as e:
                    log.warning("github.ingest.file_error", path=full_path, error=str(e))
                    continue

    # Get default branch tree
    try:
        commit = repo.get_branch(branch).commit
        yield from walk_tree(commit.commit.tree.sha)
    except GithubException:
        # Try main → master fallback
        try:
            commit = repo.get_branch("master").commit
            yield from walk_tree(commit.commit.tree.sha)
        except GithubException as e:
            log.error("github.ingest.branch_error", error=str(e))
            raise

    log.info("github.ingest.complete", repo=repo_name)
