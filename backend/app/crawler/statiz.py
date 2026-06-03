"""
[DEPRECATED] Statiz 투수 성적 크롤러.

statiz.sporki.com 도메인 폐기(DNS 소멸) 및 statiz.co.kr 의 전면 로그인 전환으로
공개 크롤링이 불가능해졌습니다. 투수 성적 소스는 KBO 공식 기록실로 교체되었습니다.

→ app.crawler.kbo_pitcher 를 사용하세요.

이 모듈은 기존 import 경로 호환을 위해 재export 만 유지합니다.
"""

from app.crawler.kbo_pitcher import (  # noqa: F401
    KBOPitcherCrawler,
    run_pitcher_stats_all_teams,
)
