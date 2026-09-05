export interface Incident {
  id: string;
  title: string;
  status: 'active' | 'closed';
  channel_name?: string;
  started_at: string;
  closed_at?: string;
}

export interface Utterance {
  id: number;
  incident_id: string;
  event_id?: string;
  speaker_name: string;
  text: string;
  normalized_text?: string;
  timestamp: string;
  parser_type?: string;
  parser_method: 'deterministic' | 'llm' | 'manual';
  confidence: 'high' | 'medium' | 'low' | 'uncertain';
  negated: boolean;
  topic: string;
  polarity?: 'positive' | 'negative' | null;
  raw_parser_json: Record<string, any>;
}

export interface GraphNode {
  id: number;
  incident_id: string;
  type: 'incident' | 'fact' | 'hypothesis' | 'decision' | 'action' | 'question' | 'off_topic' | 'uncertain';
  label: string;
  speaker?: string;
  status: 'active' | 'confirmed' | 'unverified' | 'challenged' | 'faded' | 'rejected' | 'pending' | 'committed' | 'resolved' | 'needs_review';
  topic: string;
  confidence: 'high' | 'medium' | 'low' | 'uncertain';
  source_utterance_id?: number;
  created_at: string;
  metadata_json: Record<string, any>;
}

export interface GraphEdge {
  id: number;
  incident_id: string;
  from_node_id: number;
  to_node_id: number;
  type: 'investigated' | 'supports' | 'contradicts' | 'led_to' | 'assigned' | 'resolved_by';
  created_at: string;
  source_utterance_id?: number;
}

export interface ActionItem {
  id: number;
  incident_id: string;
  label: string;
  proposed_owner?: string;
  confirmed_owner?: string;
  status: 'unassigned' | 'pending_owner_confirmation' | 'committed' | 'in_progress' | 'completed' | 'rejected';
  source_utterance_id?: number;
  created_at: string;
  updated_at?: string;
}

export interface QueryRecord {
  id: number;
  incident_id: string;
  speaker?: string;
  text: string;
  intent?: string;
  answer: string;
  answer_method: 'template' | 'grounded_llm';
  grounded_node_ids_json: number[];
  created_at: string;
}

export interface EventLog {
  id: number;
  incident_id: string;
  event_type: string;
  payload_json: Record<string, any>;
  created_at: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DocumentSection {
  title: string;
  items: Array<{
    content: string;
    speaker?: string;
    timestamp?: string;
    type?: string;
    status?: string;
  }>;
}

export interface IncidentDocument {
  summary: {
    title: string;
    id: string;
    started_at: string;
    duration_minutes: number;
    status: string;
  };
  sections: DocumentSection[];
  gaps: Gap[];
}

export interface Gap {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  count?: number;
}

export interface QueryResult {
  intent: string;
  answer: string;
  answer_method: 'template' | 'grounded_llm';
  grounded_node_ids: number[];
}

export interface HealthStatus {
  status: string;
  database: string;
  llm: string;
  agora: string;
  slack: string;
}
