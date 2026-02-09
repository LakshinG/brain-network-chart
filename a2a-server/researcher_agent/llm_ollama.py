from __future__ import annotations

import asyncio
import os
from typing import Optional

import httpx


class OllamaClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
        max_retries: int = 3,
        backoff_base: float = 1.7,
    ) -> None:
        self.base_url = base_url or os.getenv(
            "OLLAMA_BASE_URL", "http://yukon.acm.unc.edu:11434"
        )
        self.model = model or os.getenv(
            "OLLAMA_MODEL", "Huzderu/txgemma-27B-chat-Q8_0_GGUF:latest"
        )
        timeout_value = timeout_seconds or int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
        self.timeout = httpx.Timeout(timeout_value)
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._client = httpx.AsyncClient(timeout=self.timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate(self, prompt: str) -> str:
        payload = {"model": self.model, "prompt": prompt, "stream": False}
        url = f"{self.base_url.rstrip('/')}/api/generate"
        last_error: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            try:
                response = await self._client.post(url, json=payload)
                if response.status_code in {408, 429} or response.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"Retryable status {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                response.raise_for_status()
                data = response.json()
                return str(data.get("response", "")).strip()
            except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
                last_error = exc
                if attempt >= self.max_retries:
                    break
                delay = self.backoff_base**attempt
                await asyncio.sleep(delay)

        raise RuntimeError(f"Ollama generate failed after retries: {last_error}")
