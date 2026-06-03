import asyncio
import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# KBO 사이트 User-Agent (브라우저 없으면 403 반환하는 경우 대비)
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}


class BaseCrawler:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def fetch_html(
        self,
        url: str,
        *,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
        headers: Optional[dict] = None,
        retries: int = 3,
        delay: float = 1.0,
    ) -> BeautifulSoup:
        """GET(params) 또는 POST(data)로 HTML을 가져와 BeautifulSoup으로 반환."""
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(1, retries + 1):
            try:
                if data is not None:
                    resp = await self.client.post(url, data=data, params=params, headers=headers)
                else:
                    resp = await self.client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                return BeautifulSoup(resp.text, "html.parser")
            except httpx.HTTPStatusError as e:
                logger.warning("HTTP %s on %s (attempt %d/%d)", e.response.status_code, url, attempt, retries)
                last_exc = e
            except httpx.RequestError as e:
                logger.warning("Request error on %s (attempt %d/%d): %s", url, attempt, retries, e)
                last_exc = e

            if attempt < retries:
                await asyncio.sleep(delay * attempt)

        raise last_exc

    async def fetch_json(
        self,
        url: str,
        *,
        method: str = "GET",
        params: Optional[dict] = None,
        data: Optional[dict] = None,
        headers: Optional[dict] = None,
        retries: int = 3,
        delay: float = 1.0,
    ) -> dict | list:
        """JSON API 엔드포인트 호출 (GET/POST 지원)."""
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(1, retries + 1):
            try:
                if method.upper() == "POST":
                    resp = await self.client.post(url, data=data, params=params, headers=headers)
                else:
                    resp = await self.client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPStatusError, httpx.RequestError) as e:
                logger.warning("Error on %s (attempt %d/%d): %s", url, attempt, retries, e)
                last_exc = e
            if attempt < retries:
                await asyncio.sleep(delay * attempt)
        raise last_exc


def make_client(timeout: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=DEFAULT_HEADERS, timeout=timeout, follow_redirects=True)
