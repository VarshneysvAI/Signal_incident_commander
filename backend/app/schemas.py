from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum


class IncidentStatus(str, Enum):
    active = "active"
    closed = "closed"


class IncidentCreate(BaseModel):
    title: str
    channel_name: Optional[str] = None


class IncidentResponse(BaseModel):
    id: str
    title: str
    status: IncidentStatus
    channel_name: Optional[str]
    started_at: datetime
    closed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UtteranceCreate(BaseModel):
    speaker_name: str
    text: str


class UtteranceResponse(BaseModel):
    id: int
    incident_id: str
    speaker_name: str
    text: str
    normalized_text: Optional[str]
    timestamp: datetime
    parser_type: Optional[str]
    parser_method: str
    confidence: str
    negated: bool
    topic: str
    
    class Config:
        from_attributes = True


class NodeType(str, Enum):
    incident = "incident"
    fact = "fact"
    hypothesis = "hypothesis"
    decision = "decision"
    action = "action"
    question = "question"
    off_topic = "off_topic"
    uncertain = "uncertain"


class NodeStatus(str, Enum):
    active = "active"
    confirmed = "confirmed"
    unverified = "unverified"
    challenged = "challenged"
    faded = "faded"
    rejected = "rejected"
    pending = "pending"
    committed = "committed"
    resolved = "resolved"
    needs_review = "needs_review"


class GraphNodeSchema(BaseModel):
    id: int
    incident_id: str
    type: NodeType
    label: str
    speaker: Optional[str]
    status: NodeStatus
    topic: str
    confidence: str
    source_utterance_id: Optional[int]
    created_at: datetime
    metadata_json: Dict[str, Any] = {}
    
    class Config:
        from_attributes = True


class EdgeType(str, Enum):
    investigated = "investigated"
    supports = "supports"
    contradicts = "contradicts"
    led_to = "led_to"
    assigned = "assigned"
    resolved_by = "resolved_by"


class GraphEdgeSchema(BaseModel):
    id: int
    incident_id: str
    from_node_id: int
    to_node_id: int
    type: EdgeType
    created_at: datetime
    source_utterance_id: Optional[int] = None
    
    class Config:
        from_attributes = True


class GraphResponse(BaseModel):
    nodes: List[GraphNodeSchema]
    edges: List[GraphEdgeSchema]


class ActionStatus(str, Enum):
    unassigned = "unassigned"
    pending_owner_confirmation = "pending_owner_confirmation"
    committed = "committed"
    in_progress = "in_progress"
    completed = "completed"
    rejected = "rejected"


class ActionItemSchema(BaseModel):
    id: int
    incident_id: str
    label: str
    proposed_owner: Optional[str]
    confirmed_owner: Optional[str]
    status: ActionStatus
    source_utterance_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ActionConfirmRequest(BaseModel):
    owner_name: str


class QueryRequest(BaseModel):
    speaker_name: Optional[str] = None
    text: str


class QueryResponse(BaseModel):
    intent: str
    answer: str
    answer_method: str
    grounded_node_ids: List[int] = []


class QueryRecordResponse(BaseModel):
    id: int
    incident_id: str
    speaker: Optional[str] = None
    text: str
    intent: Optional[str] = None
    answer: str
    answer_method: str = "template"
    grounded_node_ids: List[int] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExportFormat(str, Enum):
    markdown = "markdown"
    json = "json"


class AgoraTokenRequest(BaseModel):
    channel_name: str
    uid: Union[int, str] = 0


class AgoraTokenResponse(BaseModel):
    token: str
    channel_name: str
    uid: Union[int, str]
    app_id: Optional[str] = None


class StartAgentRequest(BaseModel):
    channel_name: str
    agent_uid: Union[int, str] = 999999
    language: str = "en-US"


class StartAgentResponse(BaseModel):
    status: str
    channel_name: str
    agent_uid: Union[int, str]
    mode: str
    message: str


class HealthResponse(BaseModel):
    status: str
    database: str
    llm: str
    agora: str
    slack: str
