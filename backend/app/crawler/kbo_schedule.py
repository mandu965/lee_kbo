"""
KBO 공식 사이트 크롤러 (경기 일정 / 결과)

데이터 소스 (2026 검증 완료):
  일정/결과: POST https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList
             (Schedule.aspx 가 내부적으로 호출하는 AJAX 엔드포인트)
             form: leId=1, srIdList="0,9,6"(정규시즌), seasonId=year,
                   gameMonth=MM, teamId="" (전체)
             응답: JSON { rows: [ { row: [ {Text, Class, RowSpan, ...}, ... ] }, ... ] }

각 row 의 셀 구조 (Class 기준):
  day   : "05.01(금)"  (해당 날짜 첫 경기에만, RowSpan 으로 그룹)
  time  : "<b>17:00</b>"
  play  : "<span>원정</span><em><span class='lose'>1</span>vs<span class='win'>5</span></em><span>홈</span>"
          → 점수 있으면 종료(final), "vs" 만 있으면 예정(scheduled)
  relay : 리뷰/게임센터 링크 (gameId 포함)
  이후 Class 없는 셀: 하이라이트 / TV / 라디오 / 구장 / 비고
          → 구장 = 뒤에서 2번째 셀, 비고 = 마지막 셀
"""

import logging
import re
from datetime import date, time
from typing import Optional

from bs4 import BeautifulSoup

from app.crawler.base import BaseCrawler, make_client
from app.crawler.schemas import GameScheduleData

logger = logging.getLogger(__name__)

BASE_URL = "https://www.koreabaseball.com"
SCHEDULE_API = f"{BASE_URL}/ws/Schedule.asmx/GetScheduleList"
SCHEDULE_PAGE = f"{BASE_URL}/Schedule/Schedule.aspx"

# 정규시즌(0) + 더블헤더(9) + 올스타(6) 시리즈 묶음 (사이트 ddlSeries 기본값)
REGULAR_SERIES = "0,9,6"

# KBO 표시 팀명 → 내부 code (seed_data 기준)
KBO_TEAM_MAP: dict[str, str] = {
    "LG": "LG",
    "KT": "KT",
    "SSG": "SSG",
    "NC": "NC",
    "KIA": "KIA",
    "두산": "OB",
    "롯데": "LT",
    "삼성": "SS",
    "한화": "HH",
    "키움": "WO",
}

# gameId 내 팀 약어 → 내부 code (HT=KIA, SK=SSG 만 상이)
GAMEID_TEAM_MAP: dict[str, str] = {
    "LG": "LG", "KT": "KT", "SK": "SSG", "NC": "NC", "HT": "KIA",
    "OB": "OB", "LT": "LT", "SS": "SS", "HH": "HH", "WO": "WO",
}

# 구장 약식명 → 정규화 이름 (seed_data 의 stadium 과 일치)
STADIUM_MAP: dict[str, str] = {
    "잠실": "잠실야구장",
    "고척": "고척스카이돔",
    "수원": "수원KT위즈파크",
    "인천": "인천SSG랜더스필드",
    "문학": "인천SSG랜더스필드",
    "대전": "대전한화생명볼파크",
    "창원": "창원NC파크",
    "사직": "부산사직야구장",
    "광주": "광주기아챔피언스필드",
    "대구": "대구삼성라이온즈파크",
}

GAMEID_RE = re.compile(r"gameId=(\d{8})([A-Z]{2})([A-Z]{2})(\d)")


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _normalize_team(name: str) -> str:
    return KBO_TEAM_MAP.get(name.strip(), name.strip())


def _normalize_stadium(name: str) -> str:
    name = name.strip()
    for key, val in STADIUM_MAP.items():
        if key in name:
            return val
    return name


def _parse_time(raw: str) -> Optional[time]:
    m = re.search(r"(\d{1,2}):(\d{2})", raw or "")
    if m:
        return time(int(m.group(1)), int(m.group(2)))
    return None


def _cell_by_class(cells: list[dict], cls: str) -> Optional[dict]:
    for c in cells:
        if c.get("Class") == cls:
            return c
    return None


def _parse_play_cell(html: str) -> tuple[Optional[str], Optional[str], Optional[int], Optional[int]]:
    """
    play 셀 HTML → (away_name, home_name, away_score, home_score)

    종료 경기: <span>NC</span><em><span class="lose">1</span><span>vs</span><span class="win">5</span></em><span>LG</span>
    예정 경기: <span>롯데</span><em><span>vs</span></em><span>KT</span>
    """
    soup = BeautifulSoup(html or "", "html.parser")
    spans = [s.get_text(strip=True) for s in soup.find_all("span")]
    spans = [s for s in spans if s != ""]
    if len(spans) < 2:
        return None, None, None, None

    away_name = spans[0]
    home_name = spans[-1]

    # 가운데 숫자 스팬 = 점수 (있을 때만)
    scores = [int(s) for s in spans[1:-1] if s.isdigit()]
    if len(scores) >= 2:
        return away_name, home_name, scores[0], scores[1]
    return away_name, home_name, None, None


class KBOScheduleCrawler(BaseCrawler):
    """월별 경기 일정 및 결과 수집 (AJAX JSON 엔드포인트 사용)."""

    async def fetch_month(self, year: int, month: int) -> list[GameScheduleData]:
        payload = {
            "leId": "1",
            "srIdList": REGULAR_SERIES,
            "seasonId": str(year),
            "gameMonth": f"{month:02d}",
            "teamId": "",
        }
        data = await self.fetch_json(
            SCHEDULE_API,
            method="POST",
            data=payload,
            headers={"Referer": SCHEDULE_PAGE},
        )
        # asmx 는 보통 {"d": {...}} 래퍼를 쓰지만 이 엔드포인트는 최상위에 직접 반환
        top = data.get("d", data) if isinstance(data, dict) else {}
        rows = top.get("rows", []) if isinstance(top, dict) else []
        return self._parse_rows(rows, year, month)

    def _parse_rows(self, rows: list, year: int, month: int) -> list[GameScheduleData]:
        results: list[GameScheduleData] = []
        current_day = 1
        current_month = month

        for entry in rows:
            cells = entry.get("row", []) if isinstance(entry, dict) else []
            if not cells:
                continue

            # 날짜 셀 (RowSpan 으로 그룹 → 해당 날짜 첫 행에만 존재)
            day_cell = _cell_by_class(cells, "day")
            if day_cell:
                m = re.search(r"(\d{1,2})\.(\d{1,2})", _strip_tags(day_cell["Text"]))
                if m:
                    current_month = int(m.group(1))
                    current_day = int(m.group(2))

            play_cell = _cell_by_class(cells, "play")
            if play_cell is None:
                continue  # 경기 행이 아님 (구분선 등)

            away_name, home_name, away_score, home_score = _parse_play_cell(play_cell["Text"])
            if not away_name or not home_name:
                continue

            away_code = _normalize_team(away_name)
            home_code = _normalize_team(home_name)

            time_cell = _cell_by_class(cells, "time")
            start_time = _parse_time(_strip_tags(time_cell["Text"])) if time_cell else None

            # relay 셀에서 KBO gameId 추출 (예: "20260501NCLG0")
            relay_cell = _cell_by_class(cells, "relay")
            external_game_id: str | None = None
            doubleheader_no = 0
            if relay_cell:
                m = GAMEID_RE.search(relay_cell["Text"])
                if m:
                    external_game_id = m.group(1) + m.group(2) + m.group(3) + m.group(4)
                    doubleheader_no = int(m.group(4))

            # 구장 = 뒤에서 2번째 셀, 비고 = 마지막 셀 (Class 없는 후미 셀들)
            stadium = _normalize_stadium(_strip_tags(cells[-2]["Text"])) if len(cells) >= 2 else ""
            note = _strip_tags(cells[-1]["Text"]) if cells else ""

            # 상태 판정
            if any(k in note for k in ("취소", "우천", "노게임", "서스펜")):
                status = "cancelled"
            elif away_score is not None and home_score is not None:
                status = "final"
            else:
                status = "scheduled"

            try:
                game_date = date(year, current_month, current_day)
            except ValueError:
                continue

            results.append(
                GameScheduleData(
                    game_date=game_date,
                    start_time=start_time,
                    home_team_code=home_code,
                    away_team_code=away_code,
                    stadium=stadium,
                    status=status,
                    home_score=home_score if status == "final" else None,
                    away_score=away_score if status == "final" else None,
                    external_game_id=external_game_id,
                    doubleheader_no=doubleheader_no,
                )
            )

        return results


async def run_schedule_crawl(year: int, month: int) -> list[GameScheduleData]:
    async with make_client() as client:
        crawler = KBOScheduleCrawler(client)
        return await crawler.fetch_month(year, month)
