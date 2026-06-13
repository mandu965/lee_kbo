"""Polish existing blog draft files with local Ollama.

Usage:
    python scripts/polish_blog_drafts.py
    python scripts/polish_blog_drafts.py --dir outputs/blog_drafts --model qwen2.5:7b
    python scripts/polish_blog_drafts.py --num-ctx 2048 --keep-alive 0
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path


NUM_RE = re.compile(r"\d+(?:\.\d+)?%?|\d{4}-\d{2}-\d{2}")


def _call_ollama(
    base_url: str,
    model: str,
    prompt: str,
    timeout: int,
    num_ctx: int,
    keep_alive: str,
) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": keep_alive,
            "options": {"temperature": 0.15, "num_ctx": num_ctx},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = json.loads(res.read().decode("utf-8"))
    return (data.get("response") or "").strip()


def _make_prompt(path: Path, content: str) -> str:
    platform = "tistory markdown" if path.suffix == ".md" else "naver text"
    return f"""
너는 KBO 전문 해설가이자 블로그 편집자다.
아래 원고를 사람이 직접 쓴 스포츠 해설 글처럼 자연스럽고 읽기 좋게 다듬어라.

편집 방향:
- 딱딱한 템플릿 문장을 해설가의 설명처럼 부드럽게 바꾼다.
- 과장하지 말고, 경기 전 관전 포인트를 차분하게 짚는 톤으로 쓴다.
- 문단 흐름을 자연스럽게 정리하되, 독자가 복사해 바로 블로그에 올릴 수 있게 완성본으로 출력한다.

반드시 지킬 규칙:
- 팀명, 선수명, 날짜, 시간, 경기장, 확률, 점수, 순위, ELO, 승/패/무 수, URL은 바꾸지 않는다.
- 원고에 있는 숫자와 퍼센트는 삭제하지 말고 그대로 유지한다.
- 표, 목록, 경기별 블록, 순서는 유지한다. 문단을 크게 요약하거나 생략하지 않는다.
- 원고에 없는 새 사실, 부상 정보, 선발 변경, 결과 예측 근거를 추가하지 않는다.
- 네이버 텍스트 파일은 일반 텍스트 형식을 유지한다.
- 티스토리 Markdown 파일은 frontmatter, 제목, 표, 목록, 인용, 링크 구조를 유지한다.
- 결과 본문만 출력한다. 설명, 머리말, 코드블록, 따옴표 포장은 넣지 않는다.

파일 형식: {platform}
파일명: {path.name}

원고:
{content}
""".strip()


def _is_valid(original: str, polished: str, is_markdown: bool) -> tuple[bool, str]:
    if not polished:
        return False, "empty response"

    original_len = len(original.strip())
    polished_len = len(polished.strip())
    if polished_len < original_len * 0.65:
        return False, f"too short: {polished_len} < {original_len * 0.65:.0f}"
    if polished_len > original_len * 1.6:
        return False, f"too long: {polished_len} > {original_len * 1.6:.0f}"

    if is_markdown and original.lstrip().startswith("---") and not polished.lstrip().startswith("---"):
        return False, "markdown frontmatter removed"
    if is_markdown and "```" in polished:
        return False, "markdown code fence wrapper detected"

    original_numbers = set(NUM_RE.findall(original))
    polished_numbers = set(NUM_RE.findall(polished))
    missing = sorted(n for n in original_numbers - polished_numbers if not re.fullmatch(r"0\d", n))
    if missing:
        return False, f"numeric facts missing: {', '.join(missing[:8])}"

    return True, "ok"


def _split_frontmatter(content: str) -> tuple[str, str]:
    if not content.startswith("---\n"):
        return "", content
    end = content.find("\n---\n", 4)
    if end == -1:
        return "", content
    split_at = end + len("\n---\n")
    return content[:split_at], content[split_at:]


def _strip_code_fence_wrapper(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("```markdown"):
        stripped = stripped[len("```markdown"):].lstrip()
    elif stripped.startswith("```"):
        stripped = stripped[len("```"):].lstrip()
    if stripped.endswith("```"):
        stripped = stripped[:-3].rstrip()
    return stripped


def polish_file(
    path: Path,
    backup_dir: Path,
    base_url: str,
    model: str,
    timeout: int,
    num_ctx: int,
    keep_alive: str,
) -> bool:
    original = path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(original) if path.suffix == ".md" else ("", original)
    prompt = _make_prompt(path, body)
    polished_body = _strip_code_fence_wrapper(
        _call_ollama(base_url, model, prompt, timeout, num_ctx, keep_alive)
    )
    polished = frontmatter + polished_body if frontmatter else polished_body
    valid, reason = _is_valid(original, polished, path.suffix == ".md")
    if not valid:
        print(f"REJECT {path.name}: {reason}", file=sys.stderr)
        return False

    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / path.name
    if not backup_path.exists():
        shutil.copy2(path, backup_path)
    path.write_text(polished.rstrip() + "\n", encoding="utf-8")
    print(f"OK {path.name}: {len(original)} -> {len(polished)} chars")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="outputs/blog_drafts")
    parser.add_argument("--model", default="qwen2.5:7b")
    parser.add_argument("--url", default="http://127.0.0.1:11434")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--num-ctx", type=int, default=2048)
    parser.add_argument("--keep-alive", default="0")
    parser.add_argument("--file", action="append", help="Polish only this draft file name/path. Can be repeated.")
    args = parser.parse_args()

    draft_dir = Path(args.dir)
    if not draft_dir.exists():
        print(f"draft dir not found: {draft_dir}", file=sys.stderr)
        return 1

    if args.file:
        files = []
        for file_arg in args.file:
            file_path = Path(file_arg)
            files.append(file_path if file_path.is_absolute() else draft_dir / file_path)
    else:
        files = sorted([*draft_dir.glob("*.txt"), *draft_dir.glob("*.md")])
    if not files:
        print(f"no draft files found: {draft_dir}", file=sys.stderr)
        return 1

    backup_dir = draft_dir / "_backup_before_ollama_polish"
    ok = 0
    for path in files:
        if backup_dir in path.parents:
            continue
        try:
            if polish_file(path, backup_dir, args.url, args.model, args.timeout, args.num_ctx, args.keep_alive):
                ok += 1
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"FAIL {path.name}: ollama request failed: {e}", file=sys.stderr)
        except Exception as e:
            print(f"FAIL {path.name}: {e}", file=sys.stderr)

    print(f"done: {ok}/{len(files)} files polished")
    return 0 if ok == len(files) else 2


if __name__ == "__main__":
    raise SystemExit(main())
