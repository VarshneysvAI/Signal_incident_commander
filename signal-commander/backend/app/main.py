from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine, Base, get_db, SessionLocal
from .api import health, incidents, utterances, graph, query, actions, export, agora, webhooks, events, followups
from app.services.followup_service import start_followup_worker, stop_followup_worker

# Create database tables
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background workers
    db_factory = lambda: SessionLocal()
    await start_followup_worker(db_factory)
    yield
    # Shutdown: Stop background workers
    await stop_followup_worker()


app = FastAPI(title="SIGNAL Commander", version="1.0.0", lifespan=lifespan)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(incidents.router, prefix="/api")
app.include_router(utterances.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(actions.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(agora.router, prefix="/api")
app.include_router(webhooks.router)
app.include_router(events.router, prefix="/api")
app.include_router(followups.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "SIGNAL Commander API", "docs": "/docs"}
