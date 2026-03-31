from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from core.config import settings
from core.database import init_db
from routers import projects, brain, agents, webhooks

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("cortex_api.startup", env=settings.ENV)
    await init_db()
    yield
    log.info("cortex_api.shutdown")


app = FastAPI(
    title="Cortex API",
    version="0.1.0",
    docs_url="/api/docs" if settings.ENV != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(brain.router, prefix="/api/v1/brain", tags=["brain"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["agents"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
