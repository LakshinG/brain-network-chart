from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class Intent(str, Enum):
    EVIDENCE = "EVIDENCE"
    STATS = "STATS"
    KEYWORDS = "KEYWORDS"
    CONFIG_CHECK = "CONFIG_CHECK"


class AgentRequest(BaseModel):
    task_id: str
    sender: str
    intent: Intent
    payload: Dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    task_id: str
    status: Literal["ok", "error"]
    result: Dict[str, Any]
    logs: Optional[List[str]] = None


class KeywordsPayload(BaseModel):
    text: Optional[str] = None
    query: Optional[str] = None
    keywords: Optional[List[str]] = None


class EvidencePayload(BaseModel):
    trait_names: Optional[List[str]] = None
    metric_names: Optional[List[str]] = None
    brain_regions: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    top_k: Optional[int] = None


class StatsPayload(BaseModel):
    table: Optional[List[Dict[str, Any]]] = None
    csv_text: Optional[str] = None
    outcome_column: Optional[str] = None


class ConfigCheckPayload(BaseModel):
    current_config: Optional[Dict[str, Any]] = None
    recommended_config: Optional[Dict[str, Any]] = None
    updates: Optional[List[Dict[str, Any]]] = None


class ResultPayload(BaseModel):
    keywords: List[str] = Field(default_factory=list)
    literature_summary: List[str] = Field(default_factory=list)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    stats_recommendation: Dict[str, Any] = Field(default_factory=dict)
    config_update_suggestion: Dict[str, Any] = Field(
        default_factory=lambda: {"should_update": False, "updates": []}
    )
    confidence: float = 0.0
