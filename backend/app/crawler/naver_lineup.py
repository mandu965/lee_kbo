"""
네이버 스포츠 선발투수 크롤러

소스 (2026 검증):
  GET https://api-gw.sports.naver.com/schedule/games/{naverGameId}
  응답 오브젝트에 homeStarterName, awayStarterName 포함

네이버 gameId 형식: KBO_gameId + 시즌연도
  KBO:   20260530SKHH0
  Naver: 20260530SKHH02026

KBO 일정 크롤러(GetScheduleList)가 relay 셀에서 gameId를 추출하면
  external_game_id = KBO gameId (이미 저장됨)
  naver_game_id    = external_game_id + "2026"  (또는 해당 년도)

제한: 경기 당일 선발 발표 이후에만 이름이 채워짐.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional

from app.crawler.base import BaseCrawler, make_client

logger = logging.getLogger(__name__)

NAVER_GAME_API = "https://api-gw.sports.naver.com/schedule/games/{game_id}"

HEADERS = {
    "Referer": "https://m.sports.naver.com/kbaseball/schedule/index",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}


@dataclass
class StarterInfo:
    home_starter_name: Optional[str]
    away_starter_name: Optional[str]
    win_pitcher_name: Optional[str]
    lose_pitcher_name: Optional[str]


def kbo_to_naver_game_id(kbo_game_id: str) -> str:
    """KBO gameId → Naver gameId 변환.
    예) '20260530SKHH0' → '20260530SKHH02026'
    """
    m = re.match(r"(\d{4})", kbo_game_id)
    season = m.group(1) if m else "2026"
    return kbo_game_id + season


class NaverLineupCrawler(BaseCrawler):
    """네이버 스포츠 개별 게임 API에서 선발투수 이름 수집."""

    async def fetch_starters(self, kbo_game_id: str) -> Optional[StarterInfo]:
        naver_id = kbo_to_naver_game_id(kbo_game_id)
        url = NAVER_GAME_API.format(game_id=naver_id)
        try:
            data = await self.fetch_json(url, headers=HEADERS)
            game = data.get("result", {}).get("game", {}) if isinstance(data, dict) else {}
            if not game:
                return None
            return StarterInfo(
                home_starter_name=game.get("homeStarterName") or None,
                away_starter_name=game.get("awayStarterName") or None,
                win_pitcher_name=game.get("winPitcherName") or None,
                lose_pitcher_name=game.get("losePitcherName") or None,
            )
        except Exception as e:
            logger.warning("NaverLineup fetch failed for %s: %s", kbo_game_id, e)
            return None


async def fetch_all_starters(kbo_game_ids: list[str]) -> dict[str, StarterInfo]:
    """KBO gameId 리스트 → {kbo_game_id: StarterInfo} 반환."""
    async with make_client() as client:
        crawler = NaverLineupCrawler(client)
        result: dict[str, StarterInfo] = {}
        for gid in kbo_game_ids:
            info = await crawler.fetch_starters(gid)
            if info:
                result[gid] = info
        return result
