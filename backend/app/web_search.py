"""Opt-in server-side Tavily search adapter."""
import httpx

from .config import settings


async def search(query: str) -> list[dict]:
    if not settings.tavily_api_key:
        raise RuntimeError("Web search is not configured. Add TAVILY_API_KEY to the backend environment.")
    async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=5)) as client:
        response = await client.post("https://api.tavily.com/search", json={
            "api_key": settings.tavily_api_key,
            "query": query[:500],
            "search_depth": "basic",
            "max_results": 5,
            "include_answer": False,
        })
        response.raise_for_status()
        data = response.json()
    return [{"title": item.get("title", ""), "url": item.get("url", ""),
             "content": item.get("content", "")[:1800]}
            for item in data.get("results", []) if item.get("url", "").startswith("https://")]
