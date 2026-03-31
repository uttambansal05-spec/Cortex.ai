from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    ENV: str = "development"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str  # service role key — never expose to frontend

    # AI
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # GitHub App
    GITHUB_APP_ID: str = ""
    GITHUB_APP_PRIVATE_KEY: str = ""
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""

    # Notion
    NOTION_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://cortex-omega-one.vercel.app",
    ]

    # Limits
    MAX_REPO_SIZE_MB: int = 500
    MAX_FILE_SIZE_KB: int = 500
    GEMINI_REQUESTS_PER_MIN: int = 15   # free tier
    CLAUDE_REQUESTS_PER_MIN: int = 50

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
