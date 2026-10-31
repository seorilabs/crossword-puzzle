"""Input-driven continuous-play checks against the real AIT and RN App entries.

HTTP responses, saved state and external SDK outcomes are test boundaries. These
checks never constitute physical-device, production-ad or OS accessibility proof.
Call a journey only after recording an independent round plan and candidate SHA.
"""
import copy
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from bilingual_journey import LABELS, assert_fits, choose_entry, choose_letter, seed, solve, storage_key


NEXT = re.compile(r"^(다음 판 풀기|Play next puzzle)")
START = re.compile(r"^(이어서 풀기|다음 판 풀기|Continue puzzle|Play next puzzle)")
EXHAUSTED = re.compile(r"모든 판을 완성했어요|You[’']ve completed every puzzle", re.I)
AD_HISTORY_KEY = "crossword-completion-ad:history:v1"


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_continuous_pack(directory):
    """Read immutable generated boards, retaining original IDs and dates."""
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text())
    items = sorted(manifest["puzzles"], key=lambda x: (x["date"], x.get("dailySequence", 1)))
    puzzles = []
    for item in items:
        path = Path(urlsplit(item["path"]).path)
        source = directory / path.name
        if not source.exists():
            source = directory / str(path).lstrip("/")
        puzzle = json.loads(source.read_text())
        assert puzzle["puzzleId"] == item["puzzleId"], source
        puzzles.append(puzzle)
    return {"manifest": manifest, "items": items, "puzzles": puzzles}


def ad_history(at, *, active_ms=90000, session_count=0, daily_count=0,
               closed_at=None, last_activity_at=None):
    """Explicit local-history fixture; no ad impression is claimed by this seed."""
    instant = datetime.fromisoformat(at.replace("Z", "+00:00"))
    now_ms = int(instant.timestamp() * 1000)
    value = {"version": 1, "sessionStartedAt": now_ms,
             "lastActivityAt": now_ms if last_activity_at is None else last_activity_at,
             "activePlayMs": active_ms, "sessionImpressions": session_count,
             "utcDay": instant.astimezone(timezone.utc).strftime("%Y-%m-%d"),
             "dailyImpressions": daily_count}
    if closed_at is not None:
        value["lastClosedAt"] = closed_at
    return value


def completed_values(puzzles, at):
    """Seed complete original boards in both platform formats without app writes."""
    values = {"crossword-puzzle:archive:index": [p["puzzleId"] for p in puzzles]}
    for puzzle in puzzles:
        puzzle_id = puzzle["puzzleId"]
        cells = {f"{y}:{x}": letter for y, row in enumerate(puzzle["grid"])
                 for x, letter in enumerate(row) if letter}
        values["crossword-puzzle:progress:" + puzzle_id] = {
            "cellValues": cells, "hintCount": 0, "earnedHintCredits": 0,
            "revealUsed": False, "tentativeCells": [],
        }
        values[f"crossword-puzzle:mission:{puzzle['date']}:{puzzle_id}"] = {
            "date": puzzle["date"], "puzzleId": puzzle_id, "attemptsUsed": 1,
            "maxAttempts": 3, "lastStartedAt": at, "completedAt": at,
        }
        values["crossword-puzzle:archive:record:" + puzzle_id] = {
            "puzzleId": puzzle_id, "puzzle": puzzle, "cachedAt": at,
            "savedAt": at, "startedAt": at, "lastPlayedAt": at,
            "completedAt": at, "hintCount": 0, "revealUsed": False,
        }
    return values


def with_history_fixture(packs, language, today, count=35):
    """Extend test metadata with old IDs to exercise history above archive caps.

    These are deliberate state-test clones of an actual generated board. Their
    dates and IDs are test inputs, not additional production puzzle content.
    """
    result = copy.deepcopy(packs)
    pack = result[language]
    original = pack["puzzles"][0]
    old = []
    today_date = datetime.fromisoformat(today)
    for index in range(count):
        date = (today_date - timedelta(days=10 + index)).strftime("%Y-%m-%d")
        puzzle = copy.deepcopy(original)
        puzzle_id = f"qa-history-{language}-{date.replace('-', '')}-1"
        puzzle.update(puzzleId=puzzle_id, alias=puzzle_id, date=date,
                      slotId=puzzle_id, dailySequence=1, language=language,
                      publishedAt=date + "T00:00:00Z")
        item = {key: value for key, value in puzzle.items()
                if key in ["puzzleId", "alias", "date", "slotId", "dailySequence",
                           "language", "publishedAt", "packId", "difficulty", "metrics"]}
        item["path"] = f"/puzzles/{language}/{puzzle_id}.json"
        pack["items"].append(item)
        pack["puzzles"].append(puzzle)
        old.append(puzzle)
    return result, old


class ContentBoundary:
    """Serve only supplied originals and count requested JSON bytes per phase."""

    def __init__(self, packs):
        self.packs = packs
        self.requests = []
        self.fail = False
        self.phase = "startup"

    async def install(self, page):
        async def route(request_route):
            request = request_route.request
            if request.resource_type not in ("fetch", "xhr"):
                await request_route.continue_()
                return
            path = urlsplit(request.url).path
            kind = "manifest" if path.endswith("manifest.json") else "board"
            entry = {"url": request.url, "path": path, "kind": kind, "phase": self.phase}
            self.requests.append(entry)
            if self.fail:
                entry.update(status=503, responseBytes=0)
                await request_route.fulfill(status=503, json={"error": "qa-offline"})
                return
            if kind == "manifest":
                pack = self.packs["en" if "/en/" in path else "ko"]
                value = {**pack["manifest"], "puzzles": pack["items"]}
            else:
                value = next((p for pack in self.packs.values() for p in pack["puzzles"]
                              if Path(path).stem == p["puzzleId"]), None)
            if value is None:
                entry.update(status=404, responseBytes=0)
                await request_route.fulfill(status=404, json={"error": "unlisted-fixture"})
                return
            body = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            entry.update(status=200, responseBytes=len(body.encode("utf-8")),
                         sha256=hashlib.sha256(body.encode("utf-8")).hexdigest())
            await request_route.fulfill(status=200, content_type="application/json", body=body)
        await page.route("**/puzzles/**", route)

    def summary(self):
        return {
            "requests": len(self.requests),
            "manifestRequests": sum(r["kind"] == "manifest" for r in self.requests),
            "boardRequests": sum(r["kind"] == "board" for r in self.requests),
            "responseBytes": sum(r.get("responseBytes", 0) for r in self.requests),
            "byPhase": {
                phase: {"requests": sum(r["phase"] == phase for r in self.requests),
                        "responseBytes": sum(r.get("responseBytes", 0) for r in self.requests if r["phase"] == phase)}
                for phase in dict.fromkeys(r["phase"] for r in self.requests)
            },
        }


async def assert_primary_visible(page, button, *, width, height):
    """Check actual focusable action geometry, including result bottom placement."""
    await button.wait_for(state="visible")
    bounds = await button.bounding_box()
    assert bounds and bounds["width"] >= 44 and bounds["height"] >= 44, bounds
    assert bounds["x"] >= -1 and bounds["x"] + bounds["width"] <= width + 1, bounds
    assert bounds["y"] >= -1 and bounds["y"] + bounds["height"] <= height + 1, bounds
    assert await button.is_enabled(), "Primary action is disabled"
    await button.focus()
    assert await button.evaluate("node=>node===document.activeElement"), "Primary action is not keyboard focusable"
    return bounds


async def assert_fixed_result_action(page, button, *, width, height):
    before = await assert_primary_visible(page, button, width=width, height=height)
    assert before["y"] + before["height"] >= height - 150, before
    await page.mouse.move(width / 2, height / 2)
    await page.mouse.wheel(0, 600)
    await page.evaluate("()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
    after = await button.bounding_box()
    assert after and abs(before["y"] - after["y"]) <= 2, (before, after)
    await page.mouse.wheel(0, -600)
    return {"beforeScroll": before, "afterScroll": after}


async def app_events(page):
    return await page.evaluate("window.__crosswordQa.events")


async def assert_started_id(page, puzzle_id):
    await page.wait_for_function(
        "id=>window.__crosswordQa.events.some(e=>e.params?.puzzle_id===id && "
        "['home_quick_start','mission_start','game_puzzle_start','attempt_start'].includes(e.name))",
        arg=puzzle_id,
    )


async def run_seeded_selection(session, *, platform, run_id, language, packs,
                               today, values, output_dir, source_sha,
                               expected_id=None, empty_pattern=None, qa=None,
                               width=390, height=844, page=None):
    """Execute one explicitly seeded recommendation or exhausted-state case."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    page = page or session.page()
    native = platform != "web"
    boundary = ContentBoundary(packs)
    await boundary.install(page)
    result = {"sourceSha": source_sha, "run": run_id, "platform": platform,
              "language": language, "startedAt": utc_now(), "status": "running",
              "fixture": "Explicit isolated saved state and SDK/HTTP boundaries"}
    try:
        await page.clock.set_fixed_time(datetime.fromisoformat(today + "T12:00:00+00:00"))
        await seed(page, platform=platform, run_id=run_id, language=language,
                   values=values, qa=qa)
        await page.set_viewport_size({"width": width, "height": height})
        base = "http://127.0.0.1:4182/" if native else "http://127.0.0.1:4183/"
        await page.goto(base + f"?platform={platform}&run={run_id}", wait_until="domcontentloaded")
        if expected_id:
            action = page.get_by_role("button", name=START).first
            await action.wait_for(timeout=25000)
            await assert_primary_visible(page, action, width=width, height=height)
            assert not [r for r in boundary.requests if r["kind"] == "board"], "Home downloaded board data"
            boundary.phase = "selection"
            await action.click()
            board = page.get_by_test_id("tile-board") if native else page.locator(".tileBoard")
            await board.wait_for()
            await assert_started_id(page, expected_id)
            await assert_fits(page, board, width=width, height=height, native=native)
            board_paths = [Path(r["path"]).stem for r in boundary.requests if r["kind"] == "board"]
            assert all(p == expected_id for p in board_paths), board_paths
        else:
            await page.get_by_text(empty_pattern or EXHAUSTED).first.wait_for(timeout=25000)
            actions = await page.get_by_role("button", name=START).all()
            assert not any([await action.is_enabled() for action in actions]), "No eligible puzzle but an enabled play action remains"
            assert not [r for r in boundary.requests if r["kind"] == "board"], "Empty home downloaded boards"
        await page.screenshot(path=str(output / "selection.png"))
        result.update(status="passed", expectedId=expected_id)
        return result
    except Exception as error:
        result.update(status="failed", error=str(error))
        await page.screenshot(path=str(output / "failure.png"))
        raise
    finally:
        result.update(completedAt=utc_now(), network=boundary.summary())
        (output / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        (output / "requests.json").write_text(json.dumps(boundary.requests, ensure_ascii=False, indent=2) + "\n")
        (output / "events.json").write_text(json.dumps(await app_events(page), ensure_ascii=False, indent=2) + "\n")


def _selection(pack, language, today):
    todays = sorted([p for p in pack["puzzles"] if p["date"] == today],
                    key=lambda p: p.get("dailySequence", 1))
    past = sorted([p for p in pack["puzzles"] if p["date"] < today],
                  key=lambda p: (-int(p["date"].replace("-", "")), p.get("dailySequence", 1)))
    assert len(todays) == 5 and past, (language, today, len(todays), len(past))
    return todays, past


async def run_chain(session, *, platform, run_id, language, packs, today,
                    output_dir, source_sha, width=390, height=844, page=None,
                    large_text=False, qa=None):
    """Play today's five boards then the newest past board through visible input.

    Exercises wrong-answer recovery, partial save/reload, immutable past IDs,
    actual result actions and content request counts.
    """
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    native = platform != "web"
    page = page or session.page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    boundary = ContentBoundary(packs)
    await boundary.install(page)
    todays, past = _selection(packs[language], language, today)
    result = {"sourceSha": source_sha, "platform": platform, "language": language,
              "run": run_id, "startedAt": utc_now(), "status": "running",
              "fixture": "Original generated IDs, dates, grids and clues; HTTP and SDK boundaries replaced",
              "viewport": {"width": width, "height": height}}

    def step(name):
        with (output / "steps.log").open("a") as stream:
            stream.write(utc_now() + " " + name + "\n")

    try:
        await page.clock.set_fixed_time(datetime.fromisoformat(today + "T12:00:00+00:00"))
        await seed(page, platform=platform, run_id=run_id, language=language, qa=qa)
        await page.set_viewport_size({"width": width, "height": height})
        base = "http://127.0.0.1:4182/" if native else "http://127.0.0.1:4183/"
        query = f"?platform={platform}&run={run_id}" if native else f"?run={run_id}"
        await page.goto(base + query, wait_until="domcontentloaded")
        start = page.get_by_role("button", name=START).first
        await start.wait_for(timeout=25000)
        if large_text:
            await page.get_by_role("button", name=re.compile(r"^(설정|Settings)$")).first.click()
            await page.get_by_role("button", name=re.compile(r"^(크게|Large|글자 크기|Text size)$")).first.click()
            await page.get_by_role("button", name=re.compile(r"^(닫기|Close)$")).click()
            step("large_text_from_product_settings")
        await assert_primary_visible(page, start, width=width, height=height)
        await page.screenshot(path=str(output / "01-home.png"))
        assert not [r for r in boundary.requests if r["kind"] == "board"], "Home downloaded preview boards"
        boundary.phase = "play"
        await start.click()
        board = page.get_by_test_id("tile-board") if native else page.locator(".tileBoard")
        await board.wait_for()
        await assert_started_id(page, todays[0]["puzzleId"])
        await assert_fits(page, board, width=width, height=height, native=native)
        assert not await page.get_by_role("button", name=re.compile("힌트|hint", re.I)).count()
        first = next(e for e in todays[0]["entries"] if len(e["answer"]) >= 3)
        await choose_entry(page, first, language=language, native=native)
        await choose_letter(page, first["answer"][0], language=language)
        progress_key = storage_key(platform, run_id, "crossword-puzzle:progress:" + todays[0]["puzzleId"])
        await page.wait_for_function("key=>Boolean(JSON.parse(localStorage.getItem(key)||'null')?.tileInput?.selectionHistory?.length)", arg=progress_key)
        saved = await page.evaluate("key=>JSON.parse(localStorage.getItem(key))", arg=progress_key)
        boundary.phase = "resume"
        await page.reload(wait_until="domcontentloaded")
        if native:
            await page.get_by_role("button", name=START).first.click(timeout=25000)
        await board.wait_for(timeout=25000)
        restored = await page.evaluate("key=>JSON.parse(localStorage.getItem(key))", arg=progress_key)
        assert saved["cellValues"] == restored["cellValues"]
        assert saved["tileInput"]["selectionHistory"] == restored["tileInput"]["selectionHistory"]
        await page.get_by_role("button", name=re.compile(r"^(⌫ )?(지우기|Undo|Clear)$")).click()
        step("partial_save_reload_restore_undo")
        boundary.phase = "chain"
        past_leaderboard_count = None
        for index, puzzle in enumerate(todays + past[:1]):
            if index == 5:
                past_leaderboard_count = len([e for e in await app_events(page)
                                              if "leaderboard" in e["name"] and "submit" in e["name"]])
            await solve(page, puzzle, language=language, native=native, step=step, first=index == 0)
            next_button = page.get_by_role("button", name=NEXT).first
            await assert_fixed_result_action(page, next_button, width=width, height=height)
            await page.screenshot(path=str(output / f"result-{index + 1:02d}.png"))
            if index < 5:
                await next_button.click()
                await board.wait_for()
                expected = (todays + past[:1])[index + 1]
                await assert_started_id(page, expected["puzzleId"])
                await assert_fits(page, board, width=width, height=height, native=native)
        events = await app_events(page)
        completions = [e for e in events if e["source"] == "firebase" and e["name"] == "mission_complete"]
        # The first partial-play reload clears only the in-memory fixture event log.
        assert len(completions) == 6, len(completions)
        past_complete = [e for e in completions if e["params"].get("puzzle_id") == past[0]["puzzleId"]]
        assert len(past_complete) == 1, past_complete
        past_mission_key = storage_key(platform, run_id,
                                      f"crossword-puzzle:mission:{past[0]['date']}:{past[0]['puzzleId']}")
        stored_mission = await page.evaluate("key=>JSON.parse(localStorage.getItem(key)||'null')", arg=past_mission_key)
        assert stored_mission and stored_mission["date"] == past[0]["date"] and stored_mission.get("completedAt"), stored_mission
        today_mission_key = storage_key(platform, run_id,
                                       f"crossword-puzzle:mission:{today}:{past[0]['puzzleId']}")
        assert await page.evaluate("key=>localStorage.getItem(key)", arg=today_mission_key) is None
        assert len([e for e in events if "leaderboard" in e["name"] and "submit" in e["name"]]) == past_leaderboard_count
        await page.get_by_role("button", name=re.compile(r"^(홈으로|Back home|Home)$")).first.click()
        await page.get_by_text(re.compile(r"5\s*/\s*5")).first.wait_for()
        completed_suffix = " 완료" if language == "ko" else " complete"
        assert not await page.get_by_label(past[0]["date"] + completed_suffix, exact=True).count(), "Past puzzle date was counted as the activity date"
        assert await page.get_by_label(today + completed_suffix, exact=True).count(), "Actual completion day is missing from activity"
        await page.screenshot(path=str(output / "home-after-past.png"))
        assert not errors, errors
        step("five_today_then_original_past_id_complete")
        result.update(status="passed", checks=["home_without_board_download", "partial_save_reload_restore_undo",
                      "wrong_word_repair", "five_today_then_latest_past", "original_past_id_and_date",
                      "six_unique_completions", "past_excluded_from_daily_progress_and_ranking",
                      "actual_completion_day_activity", "visible_fixed_focusable_result_action", "no_hints"],
                      network=boundary.summary(), completedPuzzleIds=[p["puzzleId"] for p in todays + past[:1]])
        return result
    except Exception as error:
        result.update(status="failed", error=str(error))
        try:
            await page.screenshot(path=str(output / "failure.png"))
        except Exception:
            pass
        raise
    finally:
        result.update(completedAt=utc_now(), pageErrors=errors, network=boundary.summary())
        (output / "requests.json").write_text(json.dumps(boundary.requests, ensure_ascii=False, indent=2) + "\n")
        try:
            (output / "events.json").write_text(json.dumps(await app_events(page), ensure_ascii=False, indent=2) + "\n")
        except Exception:
            pass
        (output / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
