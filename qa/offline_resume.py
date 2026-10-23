"""Actual App recovery after an interrupted request on a saved play route."""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


async def run(session, *, platform, run_id, output_dir, base_url=None, page=None):
    page = page or session.page()
    native = platform != 'web'
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    puzzle = json.loads((ROOT / 'qa/fixtures/single-daily-20.json').read_text())
    puzzle_id = today[2:].replace('-', '') + '01'
    puzzle.update(date=today, puzzleId=puzzle_id, alias=puzzle_id,
                  slotId=today + '-h01', publishedAt=today + 'T00:00:00+09:00')
    summary = {key: puzzle[key] for key in
               ['date', 'puzzleId', 'alias', 'slotId', 'publishedAt',
                'difficulty', 'metrics', 'quality']}
    summary['path'] = '/puzzles/' + puzzle_id + '.json'
    state = {'offline': False}

    async def fixture(route):
        if route.request.resource_type not in ['fetch', 'xhr']:
            await route.continue_()
        elif state['offline']:
            await route.fulfill(status=503, json={'error': 'temporary failure'})
        else:
            await route.fulfill(json={'puzzles': [summary]}
                                if 'manifest.json' in route.request.url else puzzle)

    await page.route('**/puzzles/**', fixture)
    await page.set_viewport_size({'width': 390, 'height': 844})
    base = base_url or ('http://127.0.0.1:4182/' if native
                        else 'http://127.0.0.1:4183/')
    await page.goto(base + f'?platform={platform}&run={run_id}',
                    wait_until='domcontentloaded')
    await page.get_by_role('button', name=re.compile('^오늘 한 판 시작')).click(timeout=25000)
    board = page.get_by_test_id('tile-board') if native else page.locator('.tileBoard')
    await board.wait_for()
    await page.get_by_role('button', name=re.compile(', 선택 가능$')).first.click()
    await page.get_by_role('button', name='힌트 3개', exact=True).click()
    await page.get_by_role('button', name='힌트 2개', exact=True).wait_for()
    prefix = f'crossword-native-qa:{platform}:{run_id}:' if native else ''
    progress_key = prefix + 'crossword-puzzle:progress:' + puzzle_id
    wallet_key = prefix + 'crossword-puzzle:daily-hints:' + today
    await page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)||"null")?.hintCount===1', arg=progress_key)
    before = await page.evaluate('(keys)=>keys.map(k=>JSON.parse(localStorage.getItem(k)))', arg=[progress_key, wallet_key])
    state['offline'] = True
    await page.reload(wait_until='domcontentloaded')
    retry = page.get_by_role('button', name=re.compile('^다시 불러오기'))
    await retry.wait_for(timeout=25000)
    assert await board.count() == 0, 'Unloaded fallback board must not replace saved board'
    offline = await page.evaluate('(keys)=>keys.map(k=>JSON.parse(localStorage.getItem(k)))', arg=[progress_key, wallet_key])
    assert offline == before, (before, offline)
    await page.screenshot(path=str(output / 'offline.png'))
    state['offline'] = False
    await retry.click()
    await page.get_by_role('button', name=re.compile('^이어서 풀기')).click(timeout=25000)
    await board.wait_for()
    await page.get_by_role('button', name='힌트 2개', exact=True).wait_for()
    after = await page.evaluate('(keys)=>keys.map(k=>JSON.parse(localStorage.getItem(k)))', arg=[progress_key, wallet_key])
    for key in ['cellValues', 'hintCount']:
        assert after[0][key] == before[0][key], (key, before[0], after[0])
    assert after[0]['tileInput']['confirmedCells'] == before[0]['tileInput']['confirmedCells']
    assert after[1] == before[1], (before[1], after[1])
    complete = await page.evaluate('window.__crosswordQa.events.filter(e=>e.source==="firebase"&&["mission_complete","game_puzzle_complete"].includes(e.name))')
    assert not complete, complete
    await page.screenshot(path=str(output / 'recovered.png'))
    result = {'platform': platform, 'run': run_id, 'puzzleId': puzzle_id,
              'checks': ['saved-route-failure', 'no-substitute-board', 'retry',
                         'saved-letters', 'hint-wallet', 'no-false-completion'],
              'before': before, 'offline': offline, 'after': after}
    (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result
