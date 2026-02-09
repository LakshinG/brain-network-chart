from __future__ import annotations

from typing import Any, Dict

from .mcp_client import MCPClient


async def search_pubmed(client: MCPClient, query: str, top_k: int = 8) -> Dict[str, Any]:
    endpoint = client.get_pubmed_endpoint()
    payload = {"query": query, "top_k": top_k}
    return await client.call(endpoint, payload)
