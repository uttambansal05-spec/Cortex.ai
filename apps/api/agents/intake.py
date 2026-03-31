import json
import uuid
import anthropic
from core.config import settings
from core.database import get_supabase
from models.schemas import IntakeResponse, IntakeStatus
import structlog
from datetime import datetime, timezone

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

INTAKE_PROMPT = """You are the Cortex Brain intake analyser. Analyse this feature request against the codebase.

Feature request:
Title: {title}
Description: {description}

Brain nodes (codebase knowledge):
{nodes_context}

Return ONLY valid JSON:
{{
  "status": "new|partial_exists|duplicate|unfeasible",
  "known_from_brain": {{
    "existing_relevant_code": "What already exists in the codebase related to this",
    "affected_modules": ["module1"],
    "relevant_apis": ["endpoint1"],
    "effort_estimate": "Low (<1 day)|Medium (2-5 days)|High (1-2 weeks)|Unknown"
  }},
  "gaps": [
    {{
      "question": "What's missing or unclear from this request",
      "category": "user_goal|business_rule|edge_case|success_metric|scope"
    }}
  ],
  "duplicates": [
    {{
      "label": "Existing feature or entity that overlaps",
      "overlap": "How it overlaps",
      "source_file": "file/path.ts"
    }}
  ],
  "risks": [
    {{
      "label": "Risk",
      "severity": "high|medium|low",
      "detail": "Why this is risky"
    }}
  ],
  "recommendation": "Short recommendation: accept|needs_info|duplicate|reject",
  "recommendation_reason": "1-2 sentence reason"
}}"""


class IntakeAgent:
    def __init__(self):
        self.db = get_supabase()

    async def run(self, project_id: str, title: str, description: str) -> IntakeResponse:
        # Get latest snapshot
        snapshot = (
            self.db.table("brain_snapshots")
            .select("id")
            .eq("project_id", project_id)
            .eq("status", "complete")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not snapshot.data:
            raise ValueError("No complete Brain found.")

        snapshot_id = snapshot.data[0]["id"]
        nodes = self._get_relevant_nodes(snapshot_id, f"{title} {description}")
        nodes_context = self._format_nodes(nodes)

        message = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": INTAKE_PROMPT.format(
                    title=title,
                    description=description,
                    nodes_context=nodes_context,
                )
            }]
        )

        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        analysis = json.loads(text)

        # Map status
        status_map = {
            "new": IntakeStatus.PENDING,
            "partial_exists": IntakeStatus.ANALYSED,
            "duplicate": IntakeStatus.DUPLICATE,
            "unfeasible": IntakeStatus.REJECTED,
        }
        status = status_map.get(analysis.get("status", "new"), IntakeStatus.ANALYSED)

        # Save to DB
        intake_id = str(uuid.uuid4())
        self.db.table("intake_requests").insert({
            "id": intake_id,
            "project_id": project_id,
            "title": title,
            "description": description,
            "cortex_analysis": analysis,
            "status": status,
        }).execute()

        return IntakeResponse(
            id=uuid.UUID(intake_id),
            title=title,
            status=status,
            analysis=analysis,
            created_at=datetime.now(timezone.utc),
        )

    def _get_relevant_nodes(self, snapshot_id: str, text: str) -> list[dict]:
        keywords = [w.lower() for w in text.split() if len(w) > 3][:10]
        result = (
            self.db.table("brain_nodes")
            .select("node_type, label, summary, source_file")
            .eq("snapshot_id", snapshot_id)
            .execute()
        )
        nodes = result.data or []

        def score(n: dict) -> int:
            haystack = f"{n['label']} {n['summary']}".lower()
            return sum(1 for kw in keywords if kw in haystack)

        return sorted(nodes, key=score, reverse=True)[:20]

    def _format_nodes(self, nodes: list[dict]) -> str:
        return "\n".join(
            f"[{n['node_type'].upper()}] {n['label']}: {n.get('summary', '')}"
            for n in nodes
        )
