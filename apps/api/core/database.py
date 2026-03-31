from supabase import create_client, Client
from core.config import settings
import structlog

log = structlog.get_logger()

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,
        )
    return _supabase


async def init_db():
    """Verify DB connection on startup."""
    try:
        db = get_supabase()
        db.table("projects").select("id").limit(1).execute()
        log.info("database.connected")
    except Exception as e:
        log.error("database.connection_failed", error=str(e))
        raise
