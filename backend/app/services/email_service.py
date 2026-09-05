import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from ..config import settings
from ..models import Incident, EventLog


class EmailService:
    """Service for sending incident summaries and work reports via Email/SMTP."""

    def __init__(self):
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.user = settings.smtp_user
        self.password = settings.smtp_password
        self.from_addr = settings.smtp_from
        self.default_to = settings.notification_email
        self.use_tls = settings.smtp_use_tls

    def send_incident_report(
        self,
        db: Session,
        incident_id: str,
        recipient: Optional[str] = None,
        subject: Optional[str] = None,
        note: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send formatted incident post-mortem or work update to email."""
        from .document_service import document_service
        from .export_service import export_service

        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return {"status": "error", "message": "Incident not found"}

        target_recipient = recipient or self.default_to or "incident-team@company.internal"
        target_subject = subject or f"[SIGNAL War Room] Incident Report: {incident.title} ({incident.status.upper()})"

        data = document_service.get_document_data(db, incident_id)
        md_content = export_service.generate_markdown(db, incident_id)
        html_content = self._build_html_email(incident, data, note)

        # 1. Real SMTP delivery if configured
        if settings.email_enabled:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = target_subject
                msg["From"] = self.from_addr
                msg["To"] = target_recipient

                msg.attach(MIMEText(md_content, "plain"))
                msg.attach(MIMEText(html_content, "html"))

                with smtplib.SMTP(self.host, self.port, timeout=10.0) as server:
                    if self.use_tls:
                        server.starttls()
                    server.login(self.user, self.password)
                    server.sendmail(self.from_addr, [target_recipient], msg.as_string())

                db.add(EventLog(
                    incident_id=incident_id,
                    event_type="email_report_sent",
                    payload_json={"recipient": target_recipient, "subject": target_subject, "mode": "live_smtp"}
                ))
                db.commit()

                return {
                    "status": "sent",
                    "recipient": target_recipient,
                    "subject": target_subject,
                    "mode": "live_smtp",
                    "message": f"Incident report successfully emailed to {target_recipient}"
                }
            except Exception as e:
                return {
                    "status": "error",
                    "recipient": target_recipient,
                    "subject": target_subject,
                    "mode": "live_smtp_failed",
                    "message": f"SMTP transmission failed: {str(e)}"
                }

        # 2. Preview mode if SMTP credentials not yet provided
        preview_dir = os.path.join(os.getcwd(), "scratch")
        os.makedirs(preview_dir, exist_ok=True)
        preview_file = os.path.join(preview_dir, f"report-{incident_id}.html")
        with open(preview_file, "w", encoding="utf-8") as f:
            f.write(html_content)

        db.add(EventLog(
            incident_id=incident_id,
            event_type="email_report_generated",
            payload_json={"recipient": target_recipient, "subject": target_subject, "mode": "preview_saved"}
        ))
        db.commit()

        return {
            "status": "sent",
            "recipient": target_recipient,
            "subject": target_subject,
            "mode": "preview_ready",
            "message": f"Report drafted for {target_recipient}. (Configure SMTP_USER & SMTP_PASSWORD in .env for live inbox delivery)"
        }

    def _build_html_email(self, incident: Incident, data: Dict[str, Any], note: Optional[str] = None) -> str:
        """Construct a high-readability HTML email report."""
        facts = data.get("facts", [])
        hypotheses = data.get("hypotheses_active", [])
        ruled_out = data.get("hypotheses_ruled_out", [])
        decisions = data.get("decisions", [])
        actions = data.get("actions", [])
        gaps = data.get("gaps", [])

        fact_items = "".join(f"<li style='margin-bottom:6px;'><b>[{f.get('topic', 'general')}]</b> {f.get('label')} <i>({f.get('speaker', 'Unknown')})</i></li>" for f in facts) or "<li>None recorded</li>"
        hyp_items = "".join(f"<li style='margin-bottom:6px;'>{h.get('label')} <i>({h.get('speaker', 'Unknown')})</i></li>" for h in hypotheses) or "<li>None active</li>"
        ruled_items = "".join(f"<li style='margin-bottom:6px;'><strike>{r.get('label')}</strike> <i>({r.get('speaker', 'Unknown')})</i></li>" for r in ruled_out) or "<li>None</li>"
        dec_items = "".join(f"<li style='margin-bottom:6px;'><b>{d.get('label')}</b> <i>({d.get('speaker', 'Unknown')})</i></li>" for d in decisions) or "<li>None recorded</li>"
        act_items = "".join(f"<li style='margin-bottom:6px;'><b>{a.get('label')}</b> - Assigned: <u>{a.get('confirmed_owner') or a.get('proposed_owner') or 'Unassigned'}</u> ({a.get('status')})</li>" for a in actions) or "<li>No action items</li>"
        gap_items = "".join(f"<li style='margin-bottom:6px; color:#c53030;'><b>[{g.get('severity', '').upper()}]</b> {g.get('description')}</li>" for g in gaps) or "<li>No critical gaps detected</li>"

        note_section = ""
        if note:
            note_section = f"""
            <div style="background-color:#ebf8ff; border-left:4px solid #3182ce; padding:12px; margin-bottom:20px; font-size:14px; color:#2b6cb0;">
                <b>Note from Incident Commander:</b><br>{note}
            </div>
            """

        status_color = "#38a169" if incident.status.value == "closed" else "#e53e3e"

        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height:1.6; color:#2d3748; background-color:#f7fafc; padding:20px;">
    <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color:#1a202c; color:#ffffff; padding:24px 28px;">
            <h1 style="margin:8px 0 4px 0; font-size:22px; font-weight:700;">SIGNAL Commander War Room Report</h1>
            <p style="margin:0; font-size:14px; color:#a0aec0;">Executive Post-Mortem & Incident Timeline Digest</p>
        </div>

        <div style="padding:28px;">
            {note_section}

            <table style="width:100%; border-collapse:collapse; margin-bottom:24px; background:#f8fafc; border:1px solid #edf2f7; border-radius:6px;">
                <tr>
                    <td style="padding:10px 14px; font-size:13px; color:#718096; width:25%;">Incident:</td>
                    <td style="padding:10px 14px; font-size:14px; font-weight:bold; color:#1a202c;">{incident.title}</td>
                </tr>
                <tr>
                    <td style="padding:10px 14px; font-size:13px; color:#718096;">Status:</td>
                    <td style="padding:10px 14px; font-size:13px; font-weight:bold; color:{status_color};">{incident.status.value.upper()}</td>
                </tr>
                <tr>
                    <td style="padding:10px 14px; font-size:13px; color:#718096;">Channel / ID:</td>
                    <td style="padding:10px 14px; font-size:13px; font-family:monospace; color:#4a5568;">{incident.channel_name or 'direct'} ({incident.id})</td>
                </tr>
            </table>

            <h3 style="color:#2b6cb0; font-size:16px; border-bottom:2px solid #ebf8ff; padding-bottom:6px; margin-top:20px;">Confirmed Facts</h3>
            <ul style="font-size:14px; padding-left:20px; color:#4a5568;">{fact_items}</ul>

            <h3 style="color:#805ad5; font-size:16px; border-bottom:2px solid #faf5ff; padding-bottom:6px; margin-top:20px;">Hypotheses & Root Cause Analysis</h3>
            <p style="font-size:12px; color:#718096; margin-bottom:4px;"><b>Active Hypotheses:</b></p>
            <ul style="font-size:14px; padding-left:20px; color:#4a5568;">{hyp_items}</ul>
            <p style="font-size:12px; color:#718096; margin-bottom:4px;"><b>Ruled-Out Hypotheses:</b></p>
            <ul style="font-size:14px; padding-left:20px; color:#718096;">{ruled_items}</ul>

            <h3 style="color:#2f855a; font-size:16px; border-bottom:2px solid #f0fff4; padding-bottom:6px; margin-top:20px;">Decisions Made</h3>
            <ul style="font-size:14px; padding-left:20px; color:#4a5568;">{dec_items}</ul>

            <h3 style="color:#d69e2e; font-size:16px; border-bottom:2px solid #fffff0; padding-bottom:6px; margin-top:20px;">Action Items & Owners</h3>
            <ul style="font-size:14px; padding-left:20px; color:#4a5568;">{act_items}</ul>

            <h3 style="color:#e53e3e; font-size:16px; border-bottom:2px solid #fff5f5; padding-bottom:6px; margin-top:20px;">Unresolved Gaps & Risks</h3>
            <ul style="font-size:14px; padding-left:20px; color:#4a5568;">{gap_items}</ul>
        </div>

        <div style="background-color:#edf2f7; padding:16px 28px; text-align:center; font-size:12px; color:#718096;">
            Generated automatically by <b>SIGNAL Commander</b> - Real-time AI Incident Response
        </div>
    </div>
</body>
</html>"""


email_service = EmailService()
