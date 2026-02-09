from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


def base_result(confidence: float = 0.5) -> Dict[str, Any]:
    return {
        "keywords": [],
        "literature_summary": [],
        "citations": [],
        "stats_recommendation": {},
        "config_update_suggestion": {"should_update": False, "updates": []},
        "confidence": confidence,
    }


def extract_items(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        for key in ("results", "items", "data", "papers", "documents"):
            value = raw.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def normalize_citations(*raw_sources: Any) -> List[Dict[str, Any]]:
    citations: List[Dict[str, Any]] = []
    for raw in raw_sources:
        for item in extract_items(raw):
            citation = {
                "pmid": item.get("pmid") or item.get("PMID"),
                "title": item.get("title") or item.get("paper_title"),
                "year": item.get("year") or item.get("pub_year"),
                "journal": item.get("journal") or item.get("source"),
                "url": item.get("url") or item.get("link"),
                "relevance": item.get("relevance") or item.get("score"),
            }
            filtered = {k: v for k, v in citation.items() if v is not None}
            if filtered:
                citations.append(filtered)
    return citations


def format_summary_lines(text: Optional[str]) -> List[str]:
    if not text:
        return []
    lines = [line.strip("- ").strip() for line in text.splitlines() if line.strip()]
    return lines
