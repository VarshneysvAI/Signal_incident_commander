from sqlalchemy.orm import Session
from typing import Dict, Any
from ..models import Incident, GraphNode, GraphEdge, ActionItem, Utterance, QueryRecord, NodeType, NodeStatus, EdgeType
from datetime import datetime


class ExportService:
    """Export service for Markdown and JSON formats."""
    
    def generate_markdown(self, db: Session, incident_id: str) -> str:
        """Generate Markdown export of incident."""
        from .document_service import document_service
        
        data = document_service.get_document_data(db, incident_id)
        if not data:
            return "# Incident Not Found"
        
        incident = data.get("incident", {})
        lines = []
        
        # Header
        lines.append(f"# Incident Summary: {incident.get('title', 'Unknown')}")
        lines.append("")
        lines.append(f"- **ID**: {incident.get('id')}")
        lines.append(f"- **Status**: {incident.get('status')}")
        lines.append(f"- **Started**: {incident.get('started_at', 'N/A')}")
        if incident.get('closed_at'):
            lines.append(f"- **Closed**: {incident.get('closed_at')}")
        lines.append("")
        
        # Facts
        lines.append("## Confirmed Facts")
        if data.get("facts"):
            for f in data["facts"]:
                status_badge = "✓" if f["status"] == "confirmed" else "?"
                lines.append(f"- [{status_badge}] {f['label']} (Speaker: {f.get('speaker', 'Unknown')}, Topic: {f.get('topic', 'general')})")
        else:
            lines.append("- No confirmed facts.")
        lines.append("")
        
        # Hypotheses
        lines.append("## Working Hypotheses")
        if data.get("hypotheses_active"):
            for h in data["hypotheses_active"]:
                lines.append(f"- {h['label']} (Speaker: {h.get('speaker', 'Unknown')})")
        else:
            lines.append("- No active hypotheses.")
        lines.append("")
        
        lines.append("## Ruled-Out Hypotheses")
        if data.get("hypotheses_ruled_out"):
            for h in data["hypotheses_ruled_out"]:
                lines.append(f"- ~~{h['label']}~~ (Speaker: {h.get('speaker', 'Unknown')})")
        else:
            lines.append("- None.")
        lines.append("")
        
        # Decisions
        lines.append("## Decisions")
        if data.get("decisions"):
            for d in data["decisions"]:
                lines.append(f"- {d['label']} (Speaker: {d.get('speaker', 'Unknown')})")
        else:
            lines.append("- No decisions recorded.")
        lines.append("")
        
        # Actions
        lines.append("## Action Items")
        if data.get("actions"):
            for a in data["actions"]:
                owner = a.get('confirmed_owner') or a.get('proposed_owner') or 'Unassigned'
                lines.append(f"- [ ] {a['label']} — Owner: {owner}, Status: {a['status']}")
        else:
            lines.append("- No action items.")
        lines.append("")
        
        # Questions
        lines.append("## Unresolved Questions")
        if data.get("questions"):
            for q in data["questions"]:
                lines.append(f"- ❓ {q['label']}")
        else:
            lines.append("- All questions resolved.")
        lines.append("")
        
        # Contradictions
        lines.append("## Contradictions")
        if data.get("contradictions"):
            for c in data["contradictions"]:
                lines.append(f"- ⚠️ {c['from']} ↔ {c['to']}")
        else:
            lines.append("- No contradictions detected.")
        lines.append("")
        
        # Timeline
        lines.append("## Timeline")
        if data.get("timeline"):
            for u in data["timeline"]:
                badge = u.get('parsed_type', 'unknown')
                lines.append(f"- [{u.get('timestamp', 'N/A')}] **{u.get('speaker', 'Unknown')}** ({badge}): {u['text']}")
        else:
            lines.append("- No events recorded.")
        lines.append("")
        
        # Unresolved Risks
        lines.append("## Unresolved Risks")
        risks = []
        if data.get("hypotheses_active"):
            risks.extend([h['label'] for h in data["hypotheses_active"]])
        if data.get("questions"):
            risks.extend([f"Question: {q['label']}" for q in data["questions"]])
        pending_actions = [a for a in data.get("actions", []) if a['status'] in ['unassigned', 'pending_owner_confirmation']]
        if pending_actions:
            risks.extend([f"Action: {a['label']}" for a in pending_actions])
        
        if risks:
            for r in risks:
                lines.append(f"- ⚠️ {r}")
        else:
            lines.append("- No unresolved risks identified.")
        
        return "\n".join(lines)
    
    def generate_json(self, db: Session, incident_id: str) -> Dict[str, Any]:
        """Generate JSON export of incident."""
        from .document_service import document_service
        
        data = document_service.get_document_data(db, incident_id)
        
        # Add graph structure
        nodes = db.query(GraphNode).filter(GraphNode.incident_id == incident_id).all()
        edges = db.query(GraphEdge).filter(GraphEdge.incident_id == incident_id).all()
        
        data["graph"] = {
            "nodes": [
                {
                    "id": n.id,
                    "type": n.type.value,
                    "label": n.label,
                    "status": n.status.value,
                    "topic": n.topic,
                }
                for n in nodes
            ],
            "edges": [
                {
                    "from": e.from_node_id,
                    "to": e.to_node_id,
                    "type": e.type.value,
                }
                for e in edges
            ]
        }
        
        return data


export_service = ExportService()
