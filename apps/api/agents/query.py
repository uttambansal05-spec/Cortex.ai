import anthropic
from core.config import settings
from core.database import get_supabase
from models.schemas import QueryResponse
import structlog

log = structlog.get_logger()
_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

QUERY_PROMPT = """You are the Cortex Brain — a product intelligence assistant with deep knowledge of this specific codebase.

Product context:
{product_summary}

Relevant knowledge graph nodes:
{nodes_context}

Answer this question precisely and specifically:
{question}

Rules:
- Answer from the provided nodes only. Do not invent or hallucinate.
- If you reference a specific file, module, or decision — name it exactly.
- If the Brain doesn't have enough context to answer confidently, say so clearly.
- Keep answers concise but complete. Bullet points for lists, prose for explanations.
- If you detect a risk or gap relevant to the question, flag it."""


class QueryAgent:
    def __init__(self):
        self.db = get_supabase()

    async def run(self, project_id: str, question: str) -> QueryResponse:
        # Get latest complete snapshot
        snapshot = (
            self.db.table("brain_snapshots")
            .select("id, version, built_at, staleness_score, metadata")
            .eq("project_id", project_id)
            .eq("status", "complete")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not snapshot.data:
            raise ValueError("No complete Brain found. Build the Brain first.")

        snap = snapshot.data[0]
        staleness = snap.get("staleness_score", 0)

        # Get relevant nodes via keyword + type search
        # (Full pgvector semantic search requires embedding; use keyword fallback for now)
        nodes = self._get_relevant_nodes(project_id, snap["id"], question)

        if not nodes:
            return QueryResponse(
                answer="The Brain doesn't have enough context to answer this question. "
                       "Try rebuilding the Brain or asking about a specific module.",
                source_nodes=[],
                staleness_warning=self._staleness_warning(staleness),
                tokens_used=0,
            )

        # Build context
        nodes_context = self._format_nodes(nodes)
        product_summary = snap.get("metadata", {}).get("product_summary", {})

        message = _client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": QUERY_PROMPT.format(
                    product_summary=str(product_summary),
                    nodes_context=nodes_context,
                    question=question,
                )
            }]
        )

        answer = message.content[0].text
        tokens = message.usage.input_tokens + message.usage.output_tokens

        return QueryResponse(
            answer=answer,
            source_nodes=[{
                "id": str(n["id"]),
                "label": n["label"],
                "type": n["node_type"],
                "source_file": n.get("source_file"),
            } for n in nodes[:10]],
            staleness_warning=self._staleness_warning(staleness),
            tokens_used=tokens,
        )

    def _get_relevant_nodes(
        self,
        project_id: str,
        snapshot_id: str,
        question: str,
        limit: int = 25,
    ) -> list[dict]:
        """
        Get relevant nodes using three-tier search:
        1. Postgres GIN full-text search (fast, ranked, uses existing index)
        2. Keyword fallback if FTS returns too few results
        3. Risk/gap nodes always included via the SQL function
        """
        # Tier 1: GIN full-text search via RPC
        try:
            fts_result = self.db.rpc("search_brain_nodes", {
                "p_snapshot_id": snapshot_id,
                "p_query": question,
                "p_limit": limit,
            }).execute()
            if fts_result.data and len(fts_result.data) >= 5:
                log.info("query.retrieval", method="fts", count=len(fts_result.data))
                return fts_result.data[:limit]
        except Exception as e:
            log.warning("query.fts_failed", error=str(e)[:100])

        # Tier 2: Keyword fallback (pulls all nodes, scores in Python)
        log.info("query.retrieval", method="keyword_fallback")
        keywords = [w.lower() for w in question.split() if len(w) > 3]

        result = (
            self.db.table("brain_nodes")
            .select("id, node_type, label, summary, source_file, metadata")
            .eq("snapshot_id", snapshot_id)
            .execute()
        )

        nodes = result.data or []

        def score(node: dict) -> int:
            text = f"{node['label']} {node['summary']}".lower()
            return sum(1 for kw in keywords if kw in text)

        scored = sorted(nodes, key=score, reverse=True)

        # Always include risks, gaps, and configs at the top
        priority = [n for n in scored if n["node_type"] in ("risk", "gap", "config")]
        rest = [n for n in scored if n["node_type"] not in ("risk", "gap", "config")]

        return (priority + rest)[:limit]

    def _format_nodes(self, nodes: list[dict]) -> str:
        lines = []
        for n in nodes:
            lines.append(f"[{n['node_type'].upper()}] {n['label']}")
            if n.get("summary"):
                lines.append(f"  → {n['summary']}")
            if n.get("source_file"):
                lines.append(f"  📄 {n['source_file']}")
            lines.append("")
        return "\n".join(lines)

    def _staleness_warning(self, score: float) -> str | None:
        if score >= 0.5:
            return f"⚠ Brain is {round(score * 100)}% stale. Rebuild recommended for accurate answers."
        if score >= 0.3:
            return f"Brain is {round(score * 100)}% stale. Some answers may be outdated."
        return None
