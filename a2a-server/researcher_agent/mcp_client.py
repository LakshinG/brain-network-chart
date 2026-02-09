from __future__ import annotations

import os
from typing import Any, Dict, Iterable, List, Optional

import httpx


class MCPClient:
    def __init__(self, base_url: str, schema: Optional[Dict[str, Any]] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.schema = schema or {}
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(60))
        self._cached_paths = self._extract_paths(self.schema)
        self._cached_strings = self._extract_strings(self.schema)

    @classmethod
    async def create(cls, base_url: Optional[str] = None) -> "MCPClient":
        resolved_base = base_url or os.getenv("MCP_BASE_URL", "http://yukon.acm.unc.edu:8010")
        schema_url = f"{resolved_base.rstrip('/')}/api/schema"
        schema: Dict[str, Any] = {}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                response = await client.get(schema_url)
                response.raise_for_status()
                schema = response.json()
        except Exception:
            schema = {}
        return cls(resolved_base, schema=schema)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def call(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = endpoint
        if not endpoint.startswith("http"):
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
        response = await self._client.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    def resolve_endpoint(self, tokens: Iterable[str], env_var: str) -> str:
        env_value = os.getenv(env_var)
        if env_value:
            return env_value

        normalized_tokens = [t.lower() for t in tokens]
        candidates: List[str] = []
        for path in self._cached_paths:
            lowered = path.lower()
            if any(token in lowered for token in normalized_tokens):
                candidates.append(path)
        for value in self._cached_strings:
            lowered = value.lower()
            if any(token in lowered for token in normalized_tokens):
                candidates.append(value)

        if not candidates:
            raise RuntimeError(
                f"Unable to discover MCP endpoint for {env_var}. "
                f"Set {env_var} explicitly."
            )

        candidates = sorted(set(candidates), key=len)
        return candidates[0]

    def get_pubmed_endpoint(self) -> str:
        return self.resolve_endpoint(["pubmed"], "MCP_PUBMED_ENDPOINT")

    def get_duckduck_endpoint(self) -> str:
        return self.resolve_endpoint(["duckduck", "duckduckgo", "search"], "MCP_DUCKDUCK_ENDPOINT")

    def get_stats_endpoint(self) -> str:
        return self.resolve_endpoint(
            ["stat", "stats", "analysis", "regression", "correlation"],
            "MCP_STATS_ENDPOINT",
        )

    def _extract_paths(self, schema: Any) -> List[str]:
        paths: List[str] = []
        if isinstance(schema, dict):
            if "paths" in schema and isinstance(schema["paths"], dict):
                paths.extend(list(schema["paths"].keys()))
            for value in schema.values():
                paths.extend(self._extract_paths(value))
        elif isinstance(schema, list):
            for item in schema:
                paths.extend(self._extract_paths(item))
        return paths

    def _extract_strings(self, schema: Any) -> List[str]:
        values: List[str] = []
        if isinstance(schema, dict):
            for value in schema.values():
                values.extend(self._extract_strings(value))
        elif isinstance(schema, list):
            for item in schema:
                values.extend(self._extract_strings(item))
        elif isinstance(schema, str):
            if schema.startswith("/") or schema.startswith("http"):
                values.append(schema)
        return values
