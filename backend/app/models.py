from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .db import Base


class IncidentStatus(str, enum.Enum):
    active = "active"
    closed = "closed"


class NodeType(str, enum.Enum):
    incident = "incident"
    fact = "fact"
    hypothesis = "hypothesis"
    decision = "decision"
    action = "action"
    question = "question"
    off_topic = "off_topic"
    uncertain = "uncertain"


class NodeStatus(str, enum.Enum):
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


class EdgeType(str, enum.Enum):
    investigated = "investigated"
    supports = "supports"
    contradicts = "contradicts"
    led_to = "led_to"
    assigned = "assigned"
    resolved_by = "resolved_by"


class Confidence(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"
    uncertain = "uncertain"


class ActionStatus(str, enum.Enum):
    unassigned = "unassigned"
    pending_owner_confirmation = "pending_owner_confirmation"
    committed = "committed"
    in_progress = "in_progress"
    completed = "completed"
    rejected = "rejected"


class ParserMethod(str, enum.Enum):
    deterministic = "deterministic"
    llm = "llm"
    manual = "manual"


class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    status = Column(SQLEnum(IncidentStatus), default=IncidentStatus.active)
    channel_name = Column(String, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    settings_json = Column(JSON, default=dict)
    
    utterances = relationship("Utterance", back_populates="incident", cascade="all, delete-orphan")
    nodes = relationship("GraphNode", back_populates="incident", cascade="all, delete-orphan")
    edges = relationship("GraphEdge", back_populates="incident", cascade="all, delete-orphan")
    actions = relationship("ActionItem", back_populates="incident", cascade="all, delete-orphan")
    queries = relationship("QueryRecord", back_populates="incident", cascade="all, delete-orphan")
    events = relationship("EventLog", back_populates="incident", cascade="all, delete-orphan")


class Utterance(Base):
    __tablename__ = "utterances"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    event_id = Column(String, unique=True, nullable=True)  # For dedup from Agora
    speaker_name = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    normalized_text = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    parser_type = Column(String, nullable=True)
    parser_method = Column(SQLEnum(ParserMethod), default=ParserMethod.deterministic)
    confidence = Column(SQLEnum(Confidence), default=Confidence.medium)
    negated = Column(Boolean, default=False)
    topic = Column(String, default="general")
    raw_parser_json = Column(JSON, default=dict)
    
    incident = relationship("Incident", back_populates="utterances")


class GraphNode(Base):
    __tablename__ = "graph_nodes"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    type = Column(SQLEnum(NodeType), nullable=False)
    label = Column(Text, nullable=False)
    speaker = Column(String, nullable=True)
    status = Column(SQLEnum(NodeStatus), default=NodeStatus.active)
    topic = Column(String, default="general")
    confidence = Column(SQLEnum(Confidence), default=Confidence.medium)
    source_utterance_id = Column(Integer, ForeignKey("utterances.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    metadata_json = Column(JSON, default=dict)
    
    incident = relationship("Incident", back_populates="nodes")
    source_utterance = relationship("Utterance")
    outgoing_edges = relationship("GraphEdge", foreign_keys="GraphEdge.from_node_id", back_populates="from_node")
    incoming_edges = relationship("GraphEdge", foreign_keys="GraphEdge.to_node_id", back_populates="to_node")


class GraphEdge(Base):
    __tablename__ = "graph_edges"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    from_node_id = Column(Integer, ForeignKey("graph_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("graph_nodes.id"), nullable=False)
    type = Column(SQLEnum(EdgeType), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    source_utterance_id = Column(Integer, ForeignKey("utterances.id"), nullable=True)
    
    incident = relationship("Incident", back_populates="edges")
    from_node = relationship("GraphNode", foreign_keys=[from_node_id], back_populates="outgoing_edges")
    to_node = relationship("GraphNode", foreign_keys=[to_node_id], back_populates="incoming_edges")


class ActionItem(Base):
    __tablename__ = "action_items"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    label = Column(Text, nullable=False)
    proposed_owner = Column(String, nullable=True)
    confirmed_owner = Column(String, nullable=True)
    status = Column(SQLEnum(ActionStatus), default=ActionStatus.unassigned)
    source_utterance_id = Column(Integer, ForeignKey("utterances.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    incident = relationship("Incident", back_populates="actions")
    source_utterance = relationship("Utterance")


class QueryRecord(Base):
    __tablename__ = "query_records"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    speaker = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    intent = Column(String, nullable=True)
    answer = Column(Text, nullable=False)
    answer_method = Column(String, default="template")  # template or grounded_llm
    grounded_node_ids_json = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    incident = relationship("Incident", back_populates="queries")


class EventLog(Base):
    __tablename__ = "event_logs"
    
    id = Column(Integer, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    event_type = Column(String, nullable=False)
    payload_json = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    incident = relationship("Incident", back_populates="events")
