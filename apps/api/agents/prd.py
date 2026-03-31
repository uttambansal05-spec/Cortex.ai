import json
import uuid
import anthropic
from core.config import settings
from core.database import get_supabase
from models.schemas import PRDStep1Response, PRDResponse
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# In-memory session store (use Redis in production)
_sessions: dict[str, dict] = {}

CONTEXT_PROMPT = """You are the Cortex Brain. A PM wants to write a PRD for: "{feature_name}"

Here is everything I know from the codebase about this feature area:
{nodes_context}

Your job: 
1. Extract what is ALREADY KNOWN from the codebase that would go into a PRD
2. Identify what BUSINESS QUESTIONS the PM must answer (things the code can't tell us)

Return ONLY valid JSON:
{{
  "what_i_know": {{
    "existing_architecture": "What code/modules already exist relevant to this feature",
    "affected_modules": ["module1", "module2"],
    "technical_constraints": ["constraint1"],
    "estimated_effort": "X days based on codebase complexity",
    "existing_apis": ["api endpoints that would be affected"],
    "risks": ["technical risks from the codebase"],
    "dependencies": ["what this depends on"]
  }},
  "questions": [
    {{
      "id": "q1",
      "question": "Business question the Brain can't answer",
      "why_needed": "Why this is required for the PRD",
      "type": "text|select|multiline"
    }}
  ]
}}

Rules:
- Only surface questions the codebase CANNOT answer
- Do NOT ask about tech stack, existing APIs, or module structure — you already know those
- Keep questions to the minimum needed (ideally 3-7)
- Focus questions on: user goals, business rules, edge cases, success metrics, rollout strategy"""

PRD_GENERATE_PROMPT = """You are a senior product manager writing a PRD for: "{feature_name}"

CODEBASE CONTEXT (from Brain):
{what_i_know}

ANSWERS FROM PM:
{answers}

Write a complete, production-ready PRD. Format in Markdown.

# {feature_name}

## Overview
[2-3 sentence summary]

## Problem Statement
[What problem this solves and for whom]

## Goals & Success Metrics
[Measurable outcomes]

## User Stories
[Key user stories with acceptance criteria]

## Functional Requirements
[Detailed requirements, informed by codebase context]

## Technical Notes
[Architecture implications, affected modules, integration points — from Brain]

## Edge Cases & Risks
[Derived from codebase analysis + PM answers]

## Out of Scope
[Explicit exclusions]

## Open Questions
[Any unresolved items]

## Timeline Estimate
[Based on codebase complexity]

Rules:
- Be specific. Reference actual module names, API endpoints, and file paths from the Brain context.
- Flag risks inline with ⚠
- Use tables where comparisons are needed
- This should be ready to paste into Notion and hand to an engineer"""


class PRDAgent:
    def __init__(self):
        self.db = get_supabase()

    async def start(self, project_id: str, feature_name: str) -> PRDStep1Response:
        """Step 1: Brain surfaces what it knows, returns only business questions."""

        # Get latest snapshot
        snapshot = (
            self.db.table("brain_snapshots")
            .select("id, metadata")
            .eq("project_id", project_id)
            .eq("status", "complete")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not snapshot.data:
            raise ValueError("No complete Brain found. Build the Brain first.")

        snapshot_id = snapshot.data[0]["id"]

        # Get relevant nodes
        nodes = self._get_relevant_nodes(snapshot_id, feature_name)
        nodes_context = self._format_nodes(nodes)

        message = _client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": CONTEXT_PROMPT.format(
                    feature_name=feature_name,
                    nodes_context=nodes_context,
                )
            }]
        )

        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(text)
        session_id = str(uuid.uuid4())

        # Store session
        _sessions[session_id] = {
            "project_id": project_id,
            "feature_name": feature_name,
            "snapshot_id": snapshot_id,
            "what_i_know": result.get("what_i_know", {}),
            "questions": result.get("questions", []),
        }

        return PRDStep1Response(
            session_id=session_id,
            what_i_know=result.get("what_i_know", {}),
            questions=result.get("questions", []),
        )

    async def complete(self, session_id: str, answers: dict[str, str]) -> PRDResponse:
        """Step 2: Generate full PRD from Brain context + PM answers."""

        session = _sessions.get(session_id)
        if not session:
            raise ValueError("Session expired. Start PRD generation again.")

        # Format answers with question text
        answers_formatted = {}
        for q in session["questions"]:
            qid = q["id"]
            if qid in answers:
                answers_formatted[q["question"]] = answers[qid]

        message = _client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": PRD_GENERATE_PROMPT.format(
                    feature_name=session["feature_name"],
                    what_i_know=json.dumps(session["what_i_know"], indent=2),
                    answers=json.dumps(answers_formatted, indent=2),
                )
            }]
        )

        prd_content = message.content[0].text

        # Save to DB
        prd_id = str(uuid.uuid4())
        self.db.table("prds").insert({
            "id": prd_id,
            "project_id": session["project_id"],
            "snapshot_id": session["snapshot_id"],
            "feature_name": session["feature_name"],
            "content": prd_content,
            "status": "draft",
            "metadata": {
                "what_i_know": session["what_i_know"],
                "answers": answers_formatted,
                "tokens": message.usage.input_tokens + message.usage.output_tokens,
            },
        }).execute()

        # Push to Notion if configured
        notion_url = await self._push_to_notion(
            project_id=session["project_id"],
            feature_name=session["feature_name"],
            content=prd_content,
        )
        if notion_url:
            self.db.table("prds").update({"notion_url": notion_url}).eq("id", prd_id).execute()

        # Clean up session
        del _sessions[session_id]

        from datetime import datetime, timezone
        return PRDResponse(
            id=uuid.UUID(prd_id),
            feature_name=session["feature_name"],
            content=prd_content,
            notion_url=notion_url,
            metadata={"tokens": message.usage.input_tokens + message.usage.output_tokens},
            created_at=datetime.now(timezone.utc),
        )

    def _get_relevant_nodes(self, snapshot_id: str, feature_name: str) -> list[dict]:
        keywords = [w.lower() for w in feature_name.split() if len(w) > 2]
        result = (
            self.db.table("brain_nodes")
            .select("node_type, label, summary, source_file, metadata")
            .eq("snapshot_id", snapshot_id)
            .execute()
        )
        nodes = result.data or []

        def score(n: dict) -> int:
            text = f"{n['label']} {n['summary']}".lower()
            return sum(1 for kw in keywords if kw in text)

        return sorted(nodes, key=score, reverse=True)[:25]

    def _format_nodes(self, nodes: list[dict]) -> str:
        return "\n".join(
            f"[{n['node_type'].upper()}] {n['label']}: {n['summary']}"
            + (f" ({n['source_file']})" if n.get("source_file") else "")
            for n in nodes
        )

    async def _push_to_notion(
        self,
        project_id: str,
        feature_name: str,
        content: str,
    ) -> str | None:
        """Push PRD to Notion if database configured."""
        project = (
            self.db.table("projects")
            .select("config")
            .eq("id", project_id)
            .single()
            .execute()
        )
        notion_db_id = project.data.get("config", {}).get("notion_database_id") if project.data else None
        if not notion_db_id or not settings.NOTION_API_KEY:
            return None

        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.notion.com/v1/pages",
                    headers={
                        "Authorization": f"Bearer {settings.NOTION_API_KEY}",
                        "Notion-Version": "2022-06-28",
                        "Content-Type": "application/json",
                    },
                    json={
                        "parent": {"database_id": notion_db_id},
                        "properties": {
                            "Name": {"title": [{"text": {"content": feature_name}}]},
                            "Status": {"select": {"name": "Draft"}},
                        },
                        "children": [{
                            "object": "block",
                            "type": "paragraph",
                            "paragraph": {
                                "rich_text": [{"type": "text", "text": {"content": content[:2000]}}]
                            }
                        }]
                    }
                )
                if response.status_code == 200:
                    return response.json().get("url")
        except Exception as e:
            log.warning("notion.push_failed", error=str(e))

        return None
