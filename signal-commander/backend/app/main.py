from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine, Base
from .api import health, incidents, utterances, graph, query, actions, export, agora, webhooks, events

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SIGNAL Commander", version="1.0.0")

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


@app.get("/")
def root():
    return {"message": "SIGNAL Commander API", "docs": "/docs"}
