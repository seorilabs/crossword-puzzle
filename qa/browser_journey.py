"""Actual Web/RN screens and adapters; only SDK and HTTP fixture boundaries are replaced."""
import copy, json, re, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
async def run(session, *, platform, run_id, output_dir, width=390, height=844, page=None, guide_enabled=True, accept_reminder=False, fixture_name="single-daily-20.json"):
    page=page or session.page()
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=False)
    native=platform!='web'
    errors=[];unexpected=[]
    def step(name):
        with (output/'steps.log').open('a') as stream:stream.write(name+'\n')
    page.set_default_timeout(8000)
    page.set_default_navigation_timeout(15000)
    page.on('pageerror',lambda error:errors.append(str(error)))
    await page.unroute('**/puzzles/**')
    today=datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    puzzle=json.loads((ROOT/'qa/fixtures'/fixture_name).read_text())
    puzzle.update(date=today,puzzleId=today[2:].replace('-','')+'01',slotId=today+'-h01',publishedAt=today+'T00:00:00+09:00')
    puzzle['alias']=puzzle['puzzleId']
    item={key:puzzle[key] for key in ['date','puzzleId','slotId','publishedAt','difficulty','metrics','quality','alias']}
    item['path']='/puzzles/'+puzzle['puzzleId']+'.json'
    async def fixture(route):
        if route.request.resource_type not in ["fetch","xhr"]:
            await route.continue_();return
        await route.fulfill(json={'puzzles':[item]} if 'manifest.json' in route.request.url else puzzle)
    await page.route('**/puzzles/**',fixture)
    await page.set_viewport_size({'width':width,'height':height})
    base='http://127.0.0.1:4182/' if native else 'http://127.0.0.1:4183/'
    query=f'?platform={platform}&run={run_id}' if native else f'?run={run_id}'
    await page.goto(base+query,wait_until='domcontentloaded')
    start=page.get_by_role('button',name=re.compile('^오늘 한 판 시작'))
    await start.wait_for(timeout=25000)
    await page.screenshot(path=str(output/'01-home.png'))
    await start.click()
    board=page.get_by_test_id('tile-board') if native else page.locator('.tileBoard')
    await board.wait_for(timeout=10000)
    initial=await board.bounding_box()
    assert initial and initial['width']>0
    if native:
        frame=await page.get_by_test_id('tile-game').bounding_box()
        assert frame and frame['height']<=height and frame['y']>=0,frame
        tools=await page.get_by_role('button',name=re.compile('^다음')).bounding_box()
        assert tools and tools['y']>=0 and tools['y']+tools['height']<=height,tools
    scope=page.get_by_test_id('tile-game') if native else page.locator('.tileGame')
    assert await scope.locator('input,textarea').count()==0
    await page.screenshot(path=str(output/'02-game.png'))
    async def choose_entry(entry):
        step('open clue '+entry['id'])
        await page.get_by_role('button',name=re.compile('^.*단서 목록$')).click()
        if native:
            clue=page.get_by_role('button',name=entry['clue'],exact=True)
        else:
            clue=page.locator('.tileClueList button').filter(has_text=entry['clue']).first
        step("select clue "+entry["id"])
        await clue.click()
        step("selected clue "+entry["id"])
        await page.get_by_label('현재 단어 답칸',exact=True).wait_for()
    async def available(letter):
        buttons=await page.get_by_role('button',name=f'{letter}, 선택 가능',exact=True).all()
        for button in buttons:
            if await button.is_enabled():return button
        raise AssertionError(f'No available tile {letter}')
    async def select_letter(letter):
        step("select tile "+letter)
        await (await available(letter)).click()
        await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        step("selected tile "+letter)
    async def slots():
        return await page.get_by_label('현재 단어 답칸',exact=True).get_by_role('button').all()
    def storage_key():
        key='crossword-puzzle:progress:'+puzzle['puzzleId']
        return f'crossword-native-qa:{platform}:{run_id}:'+key if native else key
    async def progress():
        return await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)||"null")',arg=storage_key())
    first=next(entry for entry in puzzle['entries'] if len(entry['answer'])>=3 and len(set(entry['answer']))>1)
    await choose_entry(first)
    await select_letter(first['answer'][0])
    await page.wait_for_function('(key)=>Boolean(JSON.parse(localStorage.getItem(key)||"null")?.tileInput?.selectionHistory?.length)',arg=storage_key())
    step('read partial')
    partial=await progress()
    assert partial['tileInput']['entryId']==first['id']
    assert partial['tileInput']['confirmedCells']==[]
    step('reload')
    await page.reload(wait_until='domcontentloaded')
    if native:await page.get_by_role('button',name=re.compile('^이어서 풀기')).click()
    else:await board.wait_for(timeout=15000)
    restored=await progress()
    assert restored['cellValues']==partial['cellValues']
    assert restored['tileInput']['selectionHistory']==partial['tileInput']['selectionHistory']
    await page.get_by_role('button',name=re.compile('^(⌫ )?지우기$')).click()
    await page.wait_for_function('(key)=>Object.keys(JSON.parse(localStorage.getItem(key)||"null")?.cellValues||{}).length===0',arg=storage_key())
    step('reload')
    await page.reload(wait_until='domcontentloaded')
    if native:await page.get_by_role('button',name=re.compile('^이어서 풀기')).click()
    else:await board.wait_for(timeout=15000)
    assert (await progress())['cellValues']=={}
    # Full-word repair returns the wrong piece and keeps only correct positions.
    await choose_entry(first)
    candidate_labels=await page.get_by_role('button',name=re.compile(', 선택 가능$')).evaluate_all('(nodes)=>nodes.map(node=>node.getAttribute("aria-label"))')
    wrong=next(label.split(',')[0] for label in candidate_labels if label.split(',')[0] not in first['answer'])
    await select_letter(wrong)
    for letter in first['answer'][1:]:await select_letter(letter)
    await page.get_by_text('맞는 글자는 그대로! 빈칸만 다시 골라봐요.',exact=True).wait_for(timeout=4000)
    assert await (await available(wrong)).is_enabled()
    await select_letter(first['answer'][0])
    for entry in puzzle['entries']:
        if await page.get_by_role('heading',name='한 판, 완성!',exact=True).count():break
        await choose_entry(entry)
        cell_slots=await slots()
        for index,letter in enumerate(entry['answer']):
            if await page.get_by_role('heading',name='한 판, 완성!',exact=True).count():break
            if await cell_slots[index].is_disabled():continue
            await cell_slots[index].click()
            await select_letter(letter)
        if not await page.get_by_role('heading',name='한 판, 완성!',exact=True).count():
            size=await board.bounding_box()
            assert size and abs(size['width']-initial['width'])<1 and abs(size['height']-initial['height'])<1, (initial,size)
    await page.get_by_role('heading',name='한 판, 완성!',exact=True).wait_for(timeout=10000)
    if accept_reminder:
        requested=await page.evaluate('window.__crosswordQa.events.filter(e=>["request_permission","notification_agreement"].includes(e.name)).length')
        assert requested==0
        await page.get_by_role('button',name='알림 받기',exact=True).click()
        await page.wait_for_function('window.__crosswordQa.events.some(e=>e.source==="firebase"&&e.name==="return_reminder_result")')
    await page.screenshot(path=str(output/'03-complete.png'))
    await page.get_by_role('button',name='결과 공유',exact=True).click()
    await page.wait_for_function('window.__crosswordQa.events.some(e=>e.source==="firebase"&&e.name==="share_result_outcome"&&e.params.outcome==="shared")')
    leaderboard=page.get_by_role('button',name='순위 보기',exact=True)
    if await leaderboard.count():await leaderboard.click()
    events=await page.evaluate('window.__crosswordQa.events')
    counts={name:len([event for event in events if event['source']=='firebase' and event['name']==name]) for name in ['first_answer_input','first_three_words_complete','mission_complete','game_puzzle_complete']}
    assert counts['mission_complete']==1 and counts['game_puzzle_complete']==1,counts
    assert counts['first_three_words_complete']==(1 if guide_enabled else 0),counts
    shown=len([e for e in events if e['source']=='firebase' and e['name']=='first_three_words_shown'])
    assert (shown>0) if guide_enabled else (shown==0)
    final=await progress()
    assert len(final['tileInput']['confirmedCells'])==sum(bool(letter) for row in puzzle['grid'] for letter in row)
    await page.get_by_role('button',name='나의 기록',exact=True).click()
    await page.get_by_text('퍼즐 기록' if native else '기록',exact=True).first.wait_for()
    history=await page.evaluate('window.__crosswordQa.events.filter(e=>e.source==="firebase"&&e.name==="history_open"&&e.params.source==="result_screen")')
    assert len(history)==1
    events=await page.evaluate('window.__crosswordQa.events')
    step('reload')
    await page.reload(wait_until='domcontentloaded')
    if native: await page.get_by_role('button',name=re.compile('^완성한 판 보기')).wait_for(timeout=15000)
    else:
        await page.get_by_text('기록',exact=True).first.wait_for(timeout=15000)
    repeated=await page.evaluate('window.__crosswordQa.events.filter(event=>event.source==="firebase"&&["mission_complete","game_puzzle_complete"].includes(event.name)).length')
    assert repeated==0
    assert not errors,errors
    result={'platform':platform,'run':run_id,'viewport':{'width':width,'height':height},'board':initial,'words':len(puzzle['entries']),'completedCells':len(final['tileInput']['confirmedCells']),'events':counts,'pageErrors':errors,'checks':['tile_only_complete','partial_restore','undo_empty_restore','wrong_word_repair','fixed_board_across_entries','guide_distinct_from_complete','completion_once','share_sdk_boundary','history_from_result','reload_without_repeat']}
    (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (output/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    return result

async def run_exceptions(session, *, platform, run_id, output_dir):
    page=session.page();native=platform!='web'
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=False)
    page.set_default_timeout(8000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    today=datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    puzzle=json.loads((ROOT/'qa/fixtures/single-daily-18.json').read_text())
    puzzle.update(date=today,puzzleId=today[2:].replace('-','')+'01',alias=today[2:].replace('-','')+'01',slotId=today+'-h01',publishedAt=today+'T00:00:00+09:00')
    item={key:puzzle[key] for key in ['date','puzzleId','slotId','publishedAt','difficulty','metrics','quality','alias']};item['path']='/puzzles/'+puzzle['puzzleId']+'.json'
    await page.unroute('**/puzzles/**')
    async def fixture(route):
        if route.request.resource_type not in ['fetch','xhr']:await route.continue_();return
        await route.fulfill(json={'puzzles':[item]} if 'manifest.json' in route.request.url else puzzle)
    await page.route('**/puzzles/**',fixture)
    await page.set_viewport_size({'width':390,'height':844})
    base='http://127.0.0.1:4182/' if native else 'http://127.0.0.1:4183/'
    await page.goto(base+(f'?platform={platform}&run={run_id}' if native else f'?run={run_id}'),wait_until='domcontentloaded')
    await page.get_by_role('button',name=re.compile('^오늘 한 판 시작')).click(timeout=25000)
    board=page.get_by_test_id('tile-board') if native else page.locator('.tileBoard')
    await board.wait_for();initial=await board.bounding_box()
    await page.get_by_role('button',name='첫 세 단어 안내 건너뛰기',exact=True).click()
    await page.get_by_role('button',name='일시정지',exact=True).click()
    candidates=page.get_by_role('button',name=re.compile(', 선택 가능$'))
    assert all([await b.is_disabled() for b in await candidates.all()])
    await page.get_by_role('button',name=re.compile('^(계속|이어서) 풀기')).click()
    assert any([await b.is_enabled() for b in await candidates.all()])
    await page.get_by_role('button',name=re.compile('단서 목록$')).click()
    await page.get_by_role('button',name='설정',exact=True).click()
    if native:
        await page.get_by_role('button',name='글자 크기',exact=True).click()
        await page.get_by_role('button',name='타이머 표시',exact=True).click()
    else:
        await page.get_by_role('button',name='크게',exact=True).click()
        await page.locator('.settingsRow').filter(has_text='타이머 표시').get_by_role('button').click()
    await page.get_by_role('button',name='닫기',exact=True).click()
    assert abs((await board.bounding_box())['width']-initial['width'])<1
    long=next(e for e in puzzle['entries'] if len(e['answer'])>=4)
    await page.get_by_role('button',name=re.compile('단서 목록$')).click()
    if native:await page.get_by_role('button',name=long['clue'],exact=True).click()
    else:await page.locator('.tileClueList button').filter(has_text=long['clue']).first.click()
    for count in [3,2,1]:
        await page.get_by_role('button',name=f'힌트 {count}개',exact=True).click()
        await page.get_by_role('button',name=f'힌트 {count-1}개',exact=True).wait_for()
    async def request_ad(outcome):
        await page.evaluate('(outcome)=>window.__crosswordQa.adOutcome=outcome',arg=outcome)
        await page.get_by_role('button',name='힌트 0개',exact=True).click()
        await page.get_by_role('button',name=re.compile('^광고 보기')).click()
        if native:await page.get_by_text('광고를 보고 힌트 받기',exact=True).wait_for(state='hidden')
    await request_ad('dismissed')
    await page.get_by_role('button',name='힌트 0개',exact=True).wait_for()
    await page.get_by_text(re.compile('끝까지 보지|중간에|완료되지 않아')).first.wait_for()
    await request_ad('error')
    await page.get_by_role('button',name='힌트 0개',exact=True).wait_for()
    await page.get_by_text(re.compile('불러오지 못|준비하지 못|광고.*실패|표시하지 못')).first.wait_for()
    await request_ad('rewarded')
    await page.get_by_role('button',name='힌트 1개',exact=True).wait_for()
    key='crossword-puzzle:progress:'+puzzle['puzzleId']
    if native:key=f'crossword-native-qa:{platform}:{run_id}:'+key
    before=await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',arg=key)
    await page.evaluate('window.__crosswordQa.storageFailure=true')
    answer_slots=await page.get_by_label('현재 단어 답칸',exact=True).get_by_role('button').all()
    for index,slot in enumerate(answer_slots):
        if await slot.is_disabled():continue
        await slot.click()
        await page.get_by_role('button',name=long['answer'][index]+', 선택 가능',exact=True).first.click()
        break
    await page.get_by_text(re.compile('저장.*못|저장 공간')).first.wait_for()
    after=await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',arg=key)
    assert after==before
    assert abs((await board.bounding_box())['width']-initial['width'])<1
    await page.screenshot(path=str(output/'exceptions.png'))
    events=await page.evaluate('window.__crosswordQa.events')
    assert not [e for e in events if e['source']=='firebase' and e['name'] in ['mission_complete','game_puzzle_complete','first_three_words_complete']]
    await page.evaluate('window.__crosswordQa.storageFailure=false')
    await page.reload(wait_until='domcontentloaded')
    if native:await page.get_by_role('button',name=re.compile('^이어서 풀기')).click(timeout=15000)
    else:await board.wait_for(timeout=15000)
    restored=await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',arg=key)
    assert restored['cellValues']==before['cellValues']
    await page.get_by_role('button',name='힌트 1개',exact=True).wait_for()
    assert not errors,errors
    result={'platform':platform,'run':run_id,'checks':['guide_skip','pause_disables_input','resume','font_and_timer_settings','fixed_board_with_large_font','three_free_hints','ad_dismiss_no_reward','ad_error_no_reward','ad_reward_once','storage_error_notice','failed_save_retains_previous_progress','wallet_restore','no_completion_on_skip'],'pageErrors':errors}
    (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');(output/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    return result

async def run_legacy(session, *, platform, run_id, output_dir, page=None):
    page=page or session.page();native=platform!='web'
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=False)
    today=datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    puzzles=[];seeds={};prefix=f'crossword-native-qa:{platform}:{run_id}:' if native else f'crossword-web-qa:{run_id}:'
    for index,name in enumerate(['legacy-easy-5.json','single-daily-20.json']):
        puzzle=json.loads((ROOT/'qa/fixtures'/name).read_text());id=today[2:].replace('-','')+f'0{index}'
        puzzle.update(date=today,puzzleId=id,alias=id,slotId=today+f'-h0{index}',publishedAt=today+f'T0{index}:00:00+09:00')
        puzzles.append(puzzle)
        entry=puzzle['entries'][0];keys=[f"{entry['row']+(i if entry['direction']=='down' else 0)}:{entry['col']+(i if entry['direction']=='across' else 0)}" for i in range(len(entry['answer']))]
        values={keys[0]:entry['answer'][0],keys[1]:(entry['answer'][1] if index else ('가' if entry['answer'][1]!='가' else '나'))}
        seeds[prefix+'crossword-puzzle:progress:'+id]={'cellValues':values,'hintCount':1+index,'earnedHintCredits':1-index}
        seeds[prefix+'crossword-puzzle:mission:'+today+':'+id]={'date':today,'puzzleId':id,'attemptsUsed':1,'maxAttempts':3,'lastStartedAt':today+'T00:00:00+09:00'}
    marker=prefix+'seeded'
    await page.add_init_script('if(location.hostname==="127.0.0.1"&&!localStorage.getItem('+json.dumps(marker)+')){Object.entries('+json.dumps(seeds,ensure_ascii=False)+').forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));localStorage.setItem('+json.dumps(marker)+',"1");}')
    items=[{**{k:p[k] for k in ['date','puzzleId','alias','slotId','publishedAt','difficulty','metrics','quality']},'path':'/puzzles/'+p['puzzleId']+'.json'} for p in puzzles]
    await page.unroute('**/puzzles/**')
    async def fixture(route):
        if route.request.resource_type not in ['fetch','xhr']:await route.continue_();return
        value={'puzzles':items} if 'manifest.json' in route.request.url else next(p for p in puzzles if p['puzzleId']+'.json' in route.request.url)
        await route.fulfill(json=value)
    await page.route('**/puzzles/**',fixture);await page.set_viewport_size({'width':390,'height':844})
    base='http://127.0.0.1:4182/' if native else 'http://127.0.0.1:4183/'
    await page.goto(base+(f'?platform={platform}&run={run_id}' if native else f'?run={run_id}'),wait_until='domcontentloaded')
    await page.get_by_role('button',name=re.compile('^이어서 풀기')).click(timeout=25000)
    await page.get_by_role('button',name='힌트 1개',exact=True).wait_for()
    board=page.get_by_test_id('tile-board') if native else page.locator('.tileBoard')
    rows=page.get_by_test_id('tile-board').locator(':scope > div') if native else page.locator('.tileBoard .tileBoardCell')
    assert await rows.count()==(8 if native else 64)
    await page.get_by_role('button',name='홈으로',exact=True).click()
    await page.get_by_role('button',name=re.compile('나의 기록$')).click()
    await page.get_by_role('button').filter(has_text=puzzles[0]['puzzleId']).first.click()
    await board.wait_for(timeout=15000)
    assert await rows.count()==(5 if native else 25)
    await page.get_by_role('button',name='힌트 1개',exact=True).wait_for()
    key='crossword-puzzle:progress:'+puzzles[0]['puzzleId']
    stored=await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',arg=prefix+key if native else key)
    assert stored['cellValues']==seeds[prefix+key]['cellValues'];assert stored['hintCount']==1
    wallet_key='crossword-puzzle:daily-hints:'+today
    wallet=await page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',arg=prefix+wallet_key if native else wallet_key)
    assert wallet['earnedCredits']==1 and wallet['usedCredits']==3,wallet
    events=await page.evaluate('window.__crosswordQa.events')
    assert not [e for e in events if e['name'] in ['mission_complete','game_puzzle_complete','first_three_words_complete']]
    await page.screenshot(path=str(output/'legacy-easy.png'))
    result={'platform':platform,'run':run_id,'checks':['legacy_hard_resume','legacy_easy_from_history','legacy_correct_and_wrong_letters_preserved','shared_hint_wallet_migration','no_completion_on_open'],'wallet':wallet}
    (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');(output/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    return result
