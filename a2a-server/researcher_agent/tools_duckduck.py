from __future__ import annotations

from typing import Any, Dict

from .mcp_client import MCPClient


async def search_duckduck(client: MCPClient, query: str, top_k: int = 6) -> Dict[str, Any]:
    endpoint = client.get_duckduck_endpoint()
    payload = {"query": query, "top_k": top_k, "max_results": top_k}
    return await client.call(endpoint, payload)
