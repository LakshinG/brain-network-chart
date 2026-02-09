from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple


def build_pubmed_query(payload: Dict[str, Any]) -> str:
    parts: List[str] = []
    for key in ("trait_names", "metric_names", "brain_regions", "keywords"):
        values = payload.get(key)
        if isinstance(values, list):
            parts.extend([str(v) for v in values if v])
    if not parts:
        for key in ("query", "text", "topic"):
            value = payload.get(key)
            if value:
                return str(value)
    if not parts:
        return "brain network"
    return " AND ".join(sorted(set(parts)))


def expand_query(query: str) -> str:
    lowered = query.lower()
    if "brain" in lowered and "network" in lowered:
        return query
    return f"{query} AND brain network"


def infer_outcome_type(
    table: Optional[List[Dict[str, Any]]], outcome_column: Optional[str]
) -> str:
    if not table or not outcome_column:
        return "numeric"
    values = [row.get(outcome_column) for row in table if outcome_column in row]
    normalized = {str(v).strip().lower() for v in values if v is not None}
    if normalized and normalized.issubset({"0", "1", "true", "false", "yes", "no"}):
        return "binary"
    if all(_is_number(v) for v in values if v is not None):
        return "numeric"
    return "numeric"


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def build_stats_request(outcome_type: str) -> Dict[str, Any]:
    regression = "logistic" if outcome_type == "binary" else "linear"
    return {
        "correlation": ["pearson", "spearman"],
        "regression": [regression],
        "multiple_comparisons": "fdr_bh",
    }


def build_stats_recommendation(outcome_type: str) -> Dict[str, Any]:
    regression = "logistic" if outcome_type == "binary" else "linear"
    return {
        "methods": {
            "correlation": ["pearson", "spearman"],
            "regression": regression,
        },
        "assumptions": {
            "correlation": "check linearity and outliers",
            "regression": "check residuals and multicollinearity",
        },
        "multiple_comparisons": "fdr_bh",
        "covariates": [],
    }


def build_config_update_suggestion(
    payload: Dict[str, Any],
    evidence_summary: Optional[List[str]] = None,
    stats_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    updates = payload.get("updates")
    if isinstance(updates, list):
        return {"should_update": len(updates) > 0, "updates": updates}

    current_config = payload.get("current_config")
    recommended_config = payload.get("recommended_config")
    if isinstance(current_config, dict) and isinstance(recommended_config, dict):
        diff_updates = []
        for key, value in recommended_config.items():
            if current_config.get(key) != value:
                diff_updates.append(
                    {
                        "path": f"/{key}",
                        "value": value,
                        "reason": "recommended_config differs from current_config",
                    }
                )
        return {"should_update": len(diff_updates) > 0, "updates": diff_updates}

    if evidence_summary or stats_summary:
        return {
            "should_update": False,
            "updates": [],
        }

    return {"should_update": False, "updates": []}


def safe_json_loads(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            snippet = text[start : end + 1]
            return json.loads(snippet)
        raise
