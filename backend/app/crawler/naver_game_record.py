"""네이버 스포츠 경기 기록 API 기반 팀 박스스코어·타순 수집."""

import logging
import re

from app.crawler.base import BaseCrawler, make_client
from app.crawler.naver_lineup import HEADERS, kbo_to_naver_game_id
from app.crawler.schemas import GameLineupData, TeamGameStatData

logger = logging.getLogger(__name__)

NAVER_RECORD_API = "https://api-gw.sports.naver.com/schedule/games/{game_id}/record"
NAVER_LINEUP_API = "https://api-gw.sports.naver.com/schedule/games/{game_id}/lineup"


def _batting_events(row: dict) -> list[str]:
    return [str(row.get(f"inn{i}") or "") for i in range(1, 26)]


def _count_extra_base_hits(rows: list[dict]) -> tuple[int, int, int]:
    doubles = triples = home_runs = 0
    for row in rows:
        for event in _batting_events(row):
            parts = event.split("/")
            for part in parts:
                if "홈" in part:
                    home_runs += 1
                elif re.search(r"(?:좌|우|중|좌중|우중)3$", part):
                    triples += 1
                elif re.search(r"(?:좌|우|중|좌중|우중)2$", part):
                    doubles += 1
    return doubles, triples, home_runs


def _team_stat(external_game_id: str, side: str, rows: list[dict]) -> TeamGameStatData:
    at_bats = sum(int(row.get("ab") or 0) for row in rows)
    hits = sum(int(row.get("hit") or 0) for row in rows)
    walks = sum(int(row.get("bb") or 0) for row in rows)
    strikeouts = sum(int(row.get("kk") or 0) for row in rows)
    runs = sum(int(row.get("run") or 0) for row in rows)
    hbp = sum(sum("사구" in event for event in _batting_events(row)) for row in rows)
    sac_flies = sum(sum("희비" in event for event in _batting_events(row)) for row in rows)
    doubles, triples, parsed_home_runs = _count_extra_base_hits(rows)
    home_runs = sum(int(row.get("hr") or 0) for row in rows)
    # 이벤트 파싱 누락 시 API가 제공하는 HR 합계를 우선한다.
    home_runs = max(home_runs, parsed_home_runs)
    singles = max(0, hits - doubles - triples - home_runs)
    total_bases = singles + doubles * 2 + triples * 3 + home_runs * 4
    avg = round(hits / at_bats, 3) if at_bats else None
    obp_denominator = at_bats + walks + hbp + sac_flies
    obp = (hits + walks + hbp) / obp_denominator if obp_denominator else None
    slg = total_bases / at_bats if at_bats else None
    ops = round(obp + slg, 3) if obp is not None and slg is not None else None
    return TeamGameStatData(
        external_game_id=external_game_id,
        side=side,
        runs=runs,
        hits=hits,
        at_bats=at_bats,
        walks=walks,
        strikeouts=strikeouts,
        home_runs=home_runs,
        team_avg=avg,
        team_ops=ops,
    )


def _lineups(external_game_id: str, side: str, rows: list[dict], confirmed: bool) -> list[GameLineupData]:
    return [
        GameLineupData(
            external_game_id=external_game_id,
            side=side,
            player_name=str(row.get("name") or row.get("playerName") or ""),
            player_code=str(row.get("playerCode") or row.get("pCode") or "") or None,
            bat_order=int(row.get("batOrder") or row.get("battingOrder") or 0),
            position=str(row.get("pos") or row.get("position") or "") or None,
            is_starter=not bool(row.get("substituteIn")),
            is_confirmed=confirmed,
        )
        for row in rows
        if (row.get("name") or row.get("playerName")) and (row.get("batOrder") or row.get("battingOrder"))
    ]


class NaverGameRecordCrawler(BaseCrawler):
    async def fetch_record(
        self, external_game_id: str
    ) -> tuple[list[TeamGameStatData], list[GameLineupData]]:
        naver_id = kbo_to_naver_game_id(external_game_id)
        data = await self.fetch_json(NAVER_RECORD_API.format(game_id=naver_id), headers=HEADERS)
        record = data.get("result", {}).get("recordData") if isinstance(data, dict) else None
        boxscore = record.get("battersBoxscore") if isinstance(record, dict) else None
        if not isinstance(boxscore, dict):
            return [], []
        away = boxscore.get("away") or []
        home = boxscore.get("home") or []
        return (
            [_team_stat(external_game_id, "away", away), _team_stat(external_game_id, "home", home)],
            _lineups(external_game_id, "away", away, True) + _lineups(external_game_id, "home", home, True),
        )

    async def fetch_lineup(self, external_game_id: str) -> list[GameLineupData]:
        """발표 전 null일 수 있다. 제공되는 경우에만 확정 타순으로 저장."""
        naver_id = kbo_to_naver_game_id(external_game_id)
        data = await self.fetch_json(NAVER_LINEUP_API.format(game_id=naver_id), headers=HEADERS)
        lineup = data.get("result", {}).get("lineUpData") if isinstance(data, dict) else None
        if not isinstance(lineup, dict):
            return []
        away = lineup.get("away") or lineup.get("awayTeam") or []
        home = lineup.get("home") or lineup.get("homeTeam") or []
        return _lineups(external_game_id, "away", away, True) + _lineups(external_game_id, "home", home, True)


async def fetch_game_records(
    external_game_ids: list[str],
) -> tuple[list[TeamGameStatData], list[GameLineupData]]:
    stats: list[TeamGameStatData] = []
    lineups: list[GameLineupData] = []
    async with make_client() as client:
        crawler = NaverGameRecordCrawler(client)
        for game_id in external_game_ids:
            try:
                game_stats, game_lineups = await crawler.fetch_record(game_id)
                stats.extend(game_stats)
                lineups.extend(game_lineups)
            except Exception as exc:
                logger.warning("Naver record fetch failed for %s: %s", game_id, exc)
    return stats, lineups


async def fetch_confirmed_lineups(external_game_ids: list[str]) -> list[GameLineupData]:
    lineups: list[GameLineupData] = []
    async with make_client() as client:
        crawler = NaverGameRecordCrawler(client)
        for game_id in external_game_ids:
            try:
                lineups.extend(await crawler.fetch_lineup(game_id))
            except Exception as exc:
                logger.warning("Naver lineup fetch failed for %s: %s", game_id, exc)
    return lineups
