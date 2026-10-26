"""Input-driven daily journeys through the actual Web/AIT and RN Web apps.

Only HTTP content, storage seeds and external SDK boundary responses are fixtures.
Import this module from an agent_browser script after a candidate is fixed. Creating
or syntax-checking this module is preparation; it is not a review run.
"""
import copy
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
LANGUAGE_KEY = 'crossword-language-v1'
LABELS = {
    'ko': {
        'start': re.compile(r'^(오늘.*시작|이어서 풀기|다음 판)'),
        'clues': re.compile(r'단서 목록$'),
        'slots': '현재 단어 답칸',
        'available': '선택 가능',
        'repair': '맞는 글자는 그대로! 빈칸만 다시 골라봐요.',
        'result': re.compile(r'한 판, 완성'),
        'next': re.compile(r'^다음 판'),
        'home': re.compile(r'^(홈으로 돌아가기|오늘 완료(?:, 홈으로)?|홈으로)$'),
        'share': '결과 공유',
        'history': '나의 기록',
    },
    'en': {
        'start': re.compile(r"^(Start today's puzzle|Continue puzzle|Next puzzle)"),
        'clues': re.compile(r'Clue list$'),
        'slots': 'Current word answer slots',
        'available': 'available',
        'repair': re.compile(r'correct|right|empty', re.I),
        'result': re.compile(r'Puzzle complete|One puzzle|Well done', re.I),
        'next': re.compile(r'^Next puzzle'),
        'home': re.compile(r'^(Back home|Today complete(?:, back home)?)$'),
        'share': re.compile(r'^Share'),
        'history': re.compile(r'^(My records|My history|History)$'),
    },
}


def read_pack(directory, *, date=None, count=5):
    """Read actual generated puzzle JSON; no board or answer fabrication."""
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    items = [item for item in manifest['puzzles'] if date is None or item['date'] == date]
    items.sort(key=lambda item: (item['date'], item.get('dailySequence', item.get('dailyIndex', 0)), item['puzzleId']))
    if date is None and items:
        date = items[0]['date']
        items = [item for item in items if item['date'] == date]
    assert len(items) >= count, (directory, date, len(items))
    result = []
    for item in items[:count]:
        source = directory / Path(urlsplit(item['path']).path).name
        if not source.exists():
            source = directory / item['path'].lstrip('/')
        puzzle = json.loads(source.read_text())
        assert puzzle['puzzleId'] == item['puzzleId']
        result.append(puzzle)
    return {'manifest': manifest, 'items': items[:count], 'puzzles': result}


async def install_packs(page, packs, *, fail_requests=None):
    """Serve language manifests and their immutable generated boards at HTTP boundary."""
    await page.unroute('**/puzzles/**')
    async def fixture(route):
        if route.request.resource_type not in ['fetch', 'xhr']:
            await route.continue_()
            return
        if fail_requests and fail_requests():
            await route.abort('internetdisconnected')
            return
        path = urlsplit(route.request.url).path
        if path.endswith('manifest.json'):
            language = 'en' if '/en/' in path else 'ko'
            pack = packs[language]
            manifest = copy.deepcopy(pack['manifest'])
            manifest['puzzles'] = pack['items']
            await route.fulfill(json=manifest)
            return
        for pack in packs.values():
            for puzzle in pack['puzzles']:
                if Path(path).stem == puzzle['puzzleId']:
                    await route.fulfill(json=puzzle)
                    return
        await route.fulfill(status=404, json={'error': 'unlisted-fixture'})
    await page.route('**/puzzles/**', fixture)


def storage_key(platform, run_id, suffix):
    prefix = f'crossword-native-qa:{platform}:{run_id}:' if platform != 'web' else ''
    return prefix + suffix


async def seed(page, *, platform, run_id, language, values=None, qa=None):
    """Initialize isolated adapter storage and SDK outcomes before product startup."""
    prefix = f'crossword-native-qa:{platform}:{run_id}:' if platform != 'web' else f'crossword-web-qa:{run_id}:'
    rows = {prefix + LANGUAGE_KEY: language}
    rows.update({prefix + key: value for key, value in (values or {}).items()})
    state = {
        'events': [], 'adOutcome': 'rewarded', 'authFailure': False,
        'remoteConfigFailure': False, 'updateGate': {'kind': 'ok'},
        'notificationPermission': 1, 'storageFailure': False,
        'safeArea': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0},
        **(qa or {}),
    }
    await page.add_init_script(
        'window.__crosswordQa=' + json.dumps(state) + ';'
        'if(location.hostname==="127.0.0.1"){const rows=' + json.dumps(rows, ensure_ascii=False) + ';'
        'for(const [key,value] of Object.entries(rows))if(localStorage.getItem(key)===null)'
        'localStorage.setItem(key,typeof value==="string"?value:JSON.stringify(value));}'
    )


async def assert_fits(page, board, *, width, height, native):
    bounds = await board.bounding_box()
    assert bounds and bounds['width'] > 0 and bounds['height'] > 0, bounds
    assert bounds['x'] >= -1 and bounds['x'] + bounds['width'] <= width + 1, bounds
    if native:
        assert bounds['y'] >= -1 and bounds['y'] + bounds['height'] <= height + 1, bounds
    overflow = await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
    assert not overflow, 'Horizontal page overflow'
    return bounds


async def wait_today_complete_home(page, *, language):
    """Wait for persisted result exit and the actual completed home screen."""
    await page.get_by_role('heading', name=LABELS[language]['result']).wait_for(state='hidden', timeout=15000)
    await page.get_by_text(re.compile(r'5\s*/\s*5')).first.wait_for(timeout=15000)
    await page.get_by_role('button', name=re.compile(r'^(완성한 판 보기|View completed puzzle)')).first.wait_for(timeout=15000)


async def choose_entry(page, entry, *, language, native):
    labels = LABELS[language]
    await page.get_by_role('button', name=labels['clues']).click()
    if native:
        clue = page.get_by_role('button', name=entry['clue'], exact=True)
    else:
        clue = page.locator('.tileClueList button').filter(has_text=entry['clue']).first
    await clue.click()
    await page.get_by_label(labels['slots'], exact=True).wait_for()


async def choose_letter(page, letter, *, language):
    labels = LABELS[language]
    available = page.get_by_role('button', name=f'{letter}, {labels["available"]}', exact=True)
    for button in await available.all():
        if await button.is_enabled():
            await button.click()
            await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            return
    raise AssertionError(f'No available tile for {letter}')


async def solve(page, puzzle, *, language, native, step, first=False):
    labels = LABELS[language]
    result = page.get_by_role('heading', name=labels['result'])
    if first:
        entry = next(entry for entry in puzzle['entries'] if len(entry['answer']) >= 3)
        await choose_entry(page, entry, language=language, native=native)
        candidates = await page.get_by_role('button', name=re.compile(', ' + labels['available'] + '$')).evaluate_all('(nodes)=>nodes.map(node=>node.getAttribute("aria-label"))')
        wrong = next(label.split(',')[0] for label in candidates if label.split(',')[0] not in entry['answer'])
        await choose_letter(page, wrong, language=language)
        for letter in entry['answer'][1:]:
            await choose_letter(page, letter, language=language)
        await page.get_by_text(labels['repair']).first.wait_for()
        await choose_letter(page, entry['answer'][0], language=language)
        step('wrong_word_repaired')
    for entry in puzzle['entries']:
        if await result.count():
            break
        await choose_entry(page, entry, language=language, native=native)
        slots = await page.get_by_label(labels['slots'], exact=True).get_by_role('button').all()
        assert len(slots) == len(entry['answer'])
        for index, letter in enumerate(entry['answer']):
            if await result.count():
                break
            if await slots[index].is_disabled():
                continue
            await slots[index].click()
            await choose_letter(page, letter, language=language)
        step('entry:' + entry['id'])
    await result.wait_for(timeout=15000)


async def run_daily(session, *, platform, run_id, language, packs, output_dir,
                    width=390, height=844, page=None, qa=None, large_text=False, clock_date=None):
    """Complete five actual boards by visible input and inspect completion once."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    page = page or session.page()
    native = platform != 'web'
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(10000)
    def step(name):
        with (output / 'steps.log').open('a') as stream:
            stream.write(datetime.now(timezone.utc).isoformat() + ' ' + name + '\n')
    result = {'platform': platform, 'language': language, 'run': run_id,
              'viewport': {'width': width, 'height': height}, 'status': 'running'}
    try:
        await install_packs(page, packs)
        if clock_date:
            await page.clock.set_fixed_time(datetime.fromisoformat(clock_date + 'T12:00:00+00:00'))
        await seed(page, platform=platform, run_id=run_id, language=language, qa=qa)
        await page.set_viewport_size({'width': width, 'height': height})
        base = 'http://127.0.0.1:4182/' if native else 'http://127.0.0.1:4183/'
        query = f'?platform={platform}&run={run_id}' if native else f'?run={run_id}'
        await page.goto(base + query, wait_until='domcontentloaded')
        labels = LABELS[language]
        start = page.get_by_role('button', name=labels['start']).first
        await start.wait_for(timeout=25000)
        if large_text:
            await page.get_by_role('button', name=re.compile(r'^(설정|Settings)$')).first.click()
            control = page.get_by_role('button', name=re.compile(r'^(크게|Large|글자 크기|Text size)$')).first
            await control.click()
            await page.screenshot(path=str(output / '00-large-text-settings.png'))
            await page.get_by_role('button', name=re.compile(r'^(닫기|Close)$')).click()
            step('large_text_from_settings')
        await page.screenshot(path=str(output / '01-home.png'))
        await start.click()
        board = page.get_by_test_id('tile-board') if native else page.locator('.tileBoard')
        await board.wait_for()
        initial = await assert_fits(page, board, width=width, height=height, native=native)
        assert await page.get_by_role('button', name=re.compile('힌트|hint', re.I)).count() == 0
        scope = page.get_by_test_id('tile-game') if native else page.locator('.tileGame')
        assert await scope.locator('input,textarea').count() == 0
        await page.screenshot(path=str(output / '02-game.png'))
        first = next(entry for entry in packs[language]['puzzles'][0]['entries'] if len(entry['answer']) >= 3)
        await choose_entry(page, first, language=language, native=native)
        await choose_letter(page, first['answer'][0], language=language)
        first_key = storage_key(platform, run_id, 'crossword-puzzle:progress:' + packs[language]['puzzles'][0]['puzzleId'])
        await page.wait_for_function('(key)=>Boolean(JSON.parse(localStorage.getItem(key)||"null")?.tileInput?.selectionHistory?.length)', arg=first_key)
        before = await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', arg=first_key)
        await page.reload(wait_until='domcontentloaded')
        if native:
            await page.get_by_role('button', name=labels['start']).first.click(timeout=25000)
        await board.wait_for(timeout=15000)
        after = await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', arg=first_key)
        assert after['cellValues'] == before['cellValues']
        assert after['tileInput']['selectionHistory'] == before['tileInput']['selectionHistory']
        await page.get_by_role('button', name=re.compile(r'^(⌫ )?(지우기|Undo|Clear)$')).click()
        await page.wait_for_function('(key)=>Object.keys(JSON.parse(localStorage.getItem(key)||"null")?.cellValues||{}).length===0', arg=first_key)
        step('partial_save_reload_restore_undo')
        for index, puzzle in enumerate(packs[language]['puzzles']):
            step(f'puzzle:{index + 1}:{puzzle["puzzleId"]}')
            await solve(page, puzzle, language=language, native=native, step=step, first=index == 0)
            key = storage_key(platform, run_id, 'crossword-puzzle:progress:' + puzzle['puzzleId'])
            await page.wait_for_function('(key)=>Boolean(JSON.parse(localStorage.getItem(key)||"null")?.tileInput?.confirmedCells?.length)', arg=key)
            progress = await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', arg=key)
            assert len(progress['tileInput']['confirmedCells']) == sum(bool(letter) for row in puzzle['grid'] for letter in row)
            if language == 'en':
                assert await page.get_by_role('button', name=re.compile('순위|leaderboard|ranking', re.I)).count() == 0
            assert await page.get_by_text(re.compile('힌트 없이|without hints|no hints', re.I)).count() == 0
            await page.screenshot(path=str(output / f'0{index + 3}-result.png'))
            if index < 4:
                await page.get_by_role('button', name=labels['next']).click()
                await board.wait_for()
                await assert_fits(page, board, width=width, height=height, native=native)
            else:
                assert await page.get_by_role('button', name=labels['next']).count() == 0
                await page.get_by_role('button', name=labels['home']).first.click()
        await wait_today_complete_home(page, language=language)
        await page.screenshot(path=str(output / '08-today-complete.png'))
        events = await page.evaluate('window.__crosswordQa.events')
        completions = [event for event in events if event['source'] == 'firebase' and event['name'] == 'mission_complete']
        game_completions = [event for event in events if event['source'] == 'firebase' and event['name'] == 'game_puzzle_complete']
        assert len(completions) == 5, len(completions)
        assert len(game_completions) == 5, len(game_completions)
        for event in completions:
            assert event['params']['content_language'] == language
            assert event['params']['ui_language'] == language
        if language == 'en':
            assert not [event for event in events if event['name'] in ['leaderboard_submit', 'submit']]
        await page.reload(wait_until='domcontentloaded')
        await wait_today_complete_home(page, language=language)
        assert not await page.evaluate('window.__crosswordQa.events.some(event=>event.source==="firebase"&&["mission_complete","game_puzzle_complete"].includes(event.name))')
        assert not errors, errors
        result.update(status='pass', board=initial, completedPuzzles=5,
                      checks=['five_actual_boards', 'partial_save_reload_restore_undo', 'wrong_word_repair', 'tile_only',
                              'saved_confirmed_cells', 'completion_once', 'no_hints',
                              'no_new_no_hint_badge', 'english_leaderboard_isolation',
                              'result_next', 'last_result_home', 'reload_no_repeat'])
        (output / 'events.json').write_text(json.dumps(events, ensure_ascii=False, indent=2) + '\n')
        return result
    except Exception as error:
        result.update(status='failed', error=str(error))
        try:
            await page.screenshot(path=str(output / 'failure.png'))
            (output / 'events.json').write_text(json.dumps(await page.evaluate('window.__crosswordQa.events'), ensure_ascii=False, indent=2) + '\n')
        except Exception:
            pass
        raise
    finally:
        result['pageErrors'] = errors
        (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
