from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..db import get_db
from ..models import GraphNode, GraphEdge, NodeType
from ..schemas import GraphResponse, GraphNodeSchema, GraphEdgeSchema

router = APIRouter()


@router.get("/incidents/{incident_id}/graph", response_model=GraphResponse)
def get_graph(incident_id: str, db: Session = Depends(get_db)):
    """Get knowledge graph for an incident."""
    nodes = db.query(GraphNode).filter(GraphNode.incident_id == incident_id).all()
    edges = db.query(GraphEdge).filter(GraphEdge.incident_id == incident_id).all()
    
    return GraphResponse(
        nodes=[GraphNodeSchema.model_validate(n) for n in nodes],
        edges=[GraphEdgeSchema.model_validate(e) for e in edges]
    )
