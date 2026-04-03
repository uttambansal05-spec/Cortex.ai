import os
import base64
import fnmatch
from dataclasses import dataclass
from typing import Iterator
from github import Github, GithubException
from core.config import settings
import structlog

log = structlog.get_logger()

INGEST_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".kt", ".swift",
    ".go", ".rs", ".rb", ".php", ".cs", ".cpp", ".c", ".h",
    ".json", ".yaml", ".yml", ".toml",
    ".md", ".mdx", ".txt",
    ".html", ".css", ".scss", ".vue", ".svelte",
}

DEFAULT_IGNORE = [
    "node_modules/**", ".git/**", "dist/**", "build/**", ".next/**",
    "*.min.js", "*.min.css", "*.map", "*.lock", "*.log",
    "__pycache__/**", "*.pyc", ".venv/**", "venv/**",
    "*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.ico",
    "*.pdf", "*.zip", "*.tar", "*.gz",
    "coverage/**", ".nyc_output/**",
]

MAX_FILE_SIZE_BYTES = settings.MAX_FILE_SIZE_KB * 1024
MAX_FILES = 150  # hard cap to prevent runaway ingestion


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
        ".kt": "kotlin", ".go": "go", ".rs": "rust", ".rb": "ruby",
        ".md": "markdown", ".yaml": "yaml", ".yml": "yaml",
        ".json": "json", ".html": "html", ".css": "css",
    }
    return lang_map.get(ext, "text")


def should_ignore(path: str, ignore_patterns: list[str]) -> bool:
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        if fnmatch.fnmatch(os.path.basename(path), pattern):
            return True
    return False


def load_cortexignore(repo, branch: str) -> list[str]:
    try:
        content = repo.get_contents(".cortexignore", ref=branch)
        patterns = content.decoded_content.decode("utf-8").splitlines()
        return [p.strip() for p in patterns if p.strip() and not p.startswith("#")]
    except GithubException:
        return []


def ingest_github_repo(
    repo_url: str,
    github_token: str,
    branch: str = "main",
    changed_files: list[str] | None = None,
) -> Iterator[IngestedFile]:
    g = Github(github_token, timeout=30)
    repo_name = repo_url.rstrip("/").replace("https://github.com/", "")
    repo = g.get_repo(repo_name)

    log.info("github.ingest.start", repo=repo_name, branch=branch)

    ignore_patterns = DEFAULT_IGNORE + load_cortexignore(repo, branch)
    file_count = 0

    try:
        # Use get_git_tree with recursive=True — single API call instead of tree walking
        try:
            commit = repo.get_branch(branch).commit
        except GithubException:
            commit = repo.get_branch("master").commit

        tree = repo.get_git_tree(commit.commit.tree.sha, recursive=True)

        for item in tree.tree:
            if file_count >= MAX_FILES:
                log.warning("github.ingest.max_files_reached", limit=MAX_FILES)
                break

            if item.type != "blob":
                continue

            full_path = item.path

            if should_ignore(full_path, ignore_patterns):
                continue

            ext = os.path.splitext(full_path)[1].lower()
            if ext not in INGEST_EXTENSIONS:
                continue

            if item.size and item.size > MAX_FILE_SIZE_BYTES:
                log.debug("github.ingest.skip_large", path=full_path, size=item.size)
                continue

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
                    last_modified="",
                )
                file_count += 1
            except Exception as e:
                log.warning("github.ingest.file_error", path=full_path, error=str(e)[:100])
                continue

    except GithubException as e:
        log.error("github.ingest.error", error=str(e))
        raise

    log.info("github.ingest.complete", repo=repo_name, file_count=file_count)
