// Design prototype only. It does not load application accounts or puzzle progress.
const STORAGE_PREFIX='crossword-design-tile-v3-20261023-';
const ICONS={back:'<path d="m14 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',hint:'<path d="M8 15c-5-5-1-12 4-12s9 7 4 12l-1 2H9Z"/><path d="M9 20h6m-5 3h4"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',erase:'<path d="m8 5-6 7 6 7h13V5Z"/><path d="m12 9 6 6m0-6-6 6"/>',book:'<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z"/><path d="M12 6v16"/>',stats:'<path d="M4 20V12h4v8m2 0V7h4v13m2 0V3h4v17"/>',gear:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.next}</svg>`;
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const keyOf=cell=>cell.join(',');
const units=answer=>Array.from(answer.normalize('NFC'));
const TEXT={
 ko:{daily:'오늘의 퍼즐',words:'단어',hint:'힌트',across:'가로',down:'세로',letters:'글자',pick:'글자를 골라보세요',guide:'이 단어가 첫 세 단어의 마지막이에요',idle:'타일을 눌러 빈칸을 채워봐요.',repair:'맞는 글자는 그대로! 빈칸만 다시 골라봐요.',hinted:'한 글자를 채웠어요. 이어서 골라봐요.',wordDone:'완성!',already:'이미 완성한 단어예요.',prev:'이전',next:'다음',erase:'지우기',list:'단서 목록',choose:'원하는 단서를 골라보세요',close:'닫기',complete:'오늘 한 판,<br>완성!',completeSub:n=>`${n}단어를 모두 채웠어요.`,completeMessage:'한 칸씩 모아, 한 판 가득.<br>오늘도 잘 풀었어요.',home:'홈으로',record:'오늘의 기록',grid:'보드',date:'OCT 23 · 오늘의 한 판',homeTitle:'오늘도,<br>한 칸씩.',homeSub:'타일을 골라 천천히 채워봐요.',resume:'이어서 풀기',review:'완성한 판 보기',homeComplete:'오늘의 퍼즐을 완성했어요',saved:'풀던 내용은 자동으로 저장돼요.',archive:'지난 퍼즐',myStats:'내 기록',homeLabel:'홈으로',answerSlot:(i,n)=>`${n}글자 중 ${i+1}번째 칸`,used:'사용함',available:'선택 가능',noUndo:'지울 글자가 없어요.'},
 en:{daily:'Daily Crossword',words:'words',hint:'Hint',across:'Across',down:'Down',letters:'letters',pick:'Pick a tile',guide:'One more word to get you going',idle:'Tap a tile to fill the next space.',repair:'Keep the right letters. Try the empty spaces.',hinted:'One letter in place. Keep going.',wordDone:'complete!',already:'You have already solved this clue.',prev:'Previous',next:'Next',erase:'Undo',list:'All clues',choose:'Pick a clue',close:'Close',complete:'A whole puzzle.<br>All yours.',completeSub:n=>`All ${n} words are in place.`,completeMessage:'One little tile at a time.<br>Nicely done today.',home:'Back to home',record:'Today’s progress',grid:'grid',date:'OCT 23 · YOUR DAILY PAUSE',homeTitle:'A little pause.<br>A few good words.',homeSub:'Pick a tile. Make it yours.',resume:'Keep solving',review:'View your finished puzzle',homeComplete:'Today’s puzzle is complete',saved:'Your progress is saved automatically.',archive:'Past puzzles',myStats:'My stats',homeLabel:'Back to home',answerSlot:(i,n)=>`Letter ${i+1} of ${n}`,used:'used',available:'available',noUndo:'No letters to undo.'}
};
const states=new Map();
let locale=new URLSearchParams(location.search).get('locale')==='en'?'en':'ko';

function hash(value){let n=2166136261;for(const ch of value)n=Math.imul(n^ch.codePointAt(0),16777619);return n>>>0;}
function shuffle(items,seed){const result=items.slice();let n=seed||1;for(let i=result.length-1;i>0;i--){n^=n<<13;n^=n>>>17;n^=n<<5;const j=(n>>>0)%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;}
function entry(s){return s.sample.runs.find(r=>r.answer===s.selected)||s.sample.runs[0];}
function isAllDone(s){return s.completed.size===s.sample.runs.length;}
function synchronize(s){
 s.completed=new Set();
 for(const r of s.sample.runs){
  if(r.cells.every((cell,i)=>s.values[keyOf(cell)]===units(r.answer)[i])){
   s.completed.add(r.answer);r.cells.forEach(cell=>s.confirmed.add(keyOf(cell)));
  }
 }
}
function firstBlank(s,r=entry(s)){const i=r.cells.findIndex(cell=>!s.values[keyOf(cell)]);return i>=0?i:r.cells.findIndex(cell=>!s.confirmed.has(keyOf(cell)));}
function initialState(id,language,scene){
 const sample=SAMPLES[language];const s={id,locale:language,sample,selected:sample.selected,values:{},confirmed:new Set(),completed:new Set(),active:0,hints:3,view:'play',status:scene==='retry'?'repair':'idle',history:[],timer:null};
 for(const r of sample.runs.filter(r=>sample.completed.includes(r.answer))){r.cells.forEach((cell,i)=>{s.values[keyOf(cell)]=units(r.answer)[i];s.confirmed.add(keyOf(cell));});}
 if(scene==='retry'){
  entry(s).cells.forEach((cell,i)=>{if(i!==1){s.values[keyOf(cell)]=units(entry(s).answer)[i];s.confirmed.add(keyOf(cell));}});
 }
 if(scene==='result'){
  sample.grid.forEach((row,y)=>row.forEach((v,x)=>{if(v){s.values[`${y},${x}`]=v;s.confirmed.add(`${y},${x}`);}}));s.view='complete';
 }
 synchronize(s);s.active=firstBlank(s);return s;
}
function recommend(s){
 return s.sample.runs.filter(r=>!s.completed.has(r.answer)).sort((a,b)=>{
  const filled=r=>r.cells.filter(c=>s.confirmed.has(keyOf(c))).length/r.cells.length;
  return filled(b)-filled(a)||a.cells.length-b.cells.length;
 })[0];
}
function loadState(id,language,scene){
 const s=initialState(id,language,scene);
 try{
  const stored=JSON.parse(localStorage.getItem(STORAGE_PREFIX+id)||'null');
  if(stored&&stored.version===1&&stored.locale===language){
   const validKeys=new Set(s.sample.runs.flatMap(r=>r.cells.map(keyOf)));
   const validValues=stored.values&&typeof stored.values==='object'&&Object.entries(stored.values).every(([key,value])=>validKeys.has(key)&&typeof value==='string'&&units(value).length===1);
   if(validValues){
    s.values={...stored.values};s.confirmed=new Set((Array.isArray(stored.confirmed)?stored.confirmed:[]).filter(key=>validKeys.has(key)&&s.values[key]===s.sample.grid[Number(key.split(',')[0])][Number(key.split(',')[1])]));
    s.hints=Number.isInteger(stored.hints)?Math.max(0,Math.min(3,stored.hints)):3;
    if(s.sample.runs.some(r=>r.answer===stored.selected))s.selected=stored.selected;
    synchronize(s);s.active=firstBlank(s);s.view=stored.view==='home'?'home':isAllDone(s)?'complete':'play';s.status='idle';
    if(s.view==='play'&&s.completed.has(s.selected)){const next=recommend(s);if(next){s.selected=next.answer;s.active=firstBlank(s);}}
   }
  }
 }catch{}
 return s;
}
function getState(id,language,scene){if(!states.has(id))states.set(id,loadState(id,language,scene));return states.get(id);}
function save(s){try{localStorage.setItem(STORAGE_PREFIX+s.id,JSON.stringify({version:1,locale:s.locale,values:s.values,confirmed:[...s.confirmed],selected:s.selected,hints:s.hints,view:s.view}));}catch{}}
function tray(s){
 const r=entry(s),answer=units(r.answer);const correct=answer.map((value,i)=>({id:'answer-'+i,value}));
 const fallback=s.locale==='ko'?['나','무','가','물','소','해']:['S','T','O','N','L','I'];
 const candidates=[...new Set([...s.sample.runs.flatMap(r=>units(r.answer)),...fallback])].filter(v=>!answer.includes(v));
 const extras=shuffle(candidates,hash(r.answer+'extra')).slice(0,2).map((value,i)=>({id:'extra-'+i,value}));
 const tokens=shuffle([...correct,...extras],hash(s.locale+r.answer+'tray3'));const used=new Set();
 for(const cell of r.cells){const value=s.values[keyOf(cell)];if(!value)continue;const found=tokens.find(t=>t.value===value&&!used.has(t.id));if(found)used.add(found.id);}
 return tokens.map(t=>({...t,used:used.has(t.id)}));
}
function stopTimer(s){if(s.timer){clearTimeout(s.timer);s.timer=null;}}
function selectEntry(s,answer,index){stopTimer(s);s.selected=answer;s.active=typeof index==='number'?index:firstBlank(s);s.status='idle';s.history=[];s.view='play';save(s);renderPhone(s);}
function afterWord(s){
 synchronize(s);s.status='correct';s.history=[];save(s);renderPhone(s);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 s.timer=setTimeout(()=>{
  s.timer=null;
  if(isAllDone(s))s.view='complete';
  else {const next=recommend(s);s.selected=next.answer;s.active=firstBlank(s);s.status='idle';}
  save(s);renderPhone(s);
 },reduced?120:480);
}
function judge(s){
 const r=entry(s);const answer=units(r.answer);
 if(r.cells.every((cell,i)=>s.values[keyOf(cell)]===answer[i])){afterWord(s);return;}
 r.cells.forEach((cell,i)=>{const key=keyOf(cell);if(s.values[key]===answer[i])s.confirmed.add(key);else delete s.values[key];});
 synchronize(s);s.active=firstBlank(s);s.status='repair';s.history=[];save(s);renderPhone(s);
}
function takeTile(s,id){
 if(s.status==='correct'||s.completed.has(s.selected))return;
 const r=entry(s),tile=tray(s).find(t=>t.id===id&&!t.used);if(!tile)return;
 let index=s.active;
 if(index<0||s.confirmed.has(keyOf(r.cells[index])))index=firstBlank(s);
 if(index<0)return;
 const key=keyOf(r.cells[index]);s.values[key]=tile.value;s.history.push(key);s.status='idle';
 const empty=r.cells.findIndex((c,i)=>i>index&&!s.values[keyOf(c)]);s.active=empty>=0?empty:firstBlank(s);
 if(r.cells.every(c=>s.values[keyOf(c)])){judge(s);return;}
 save(s);renderPhone(s);
}
function clearOne(s){
 if(s.status==='correct')return;
 const r=entry(s);let key;
 while(s.history.length&&!key){const candidate=s.history.pop();if(!s.confirmed.has(candidate)&&s.values[candidate])key=candidate;}
 if(!key)key=r.cells.map(keyOf).reverse().find(k=>s.values[k]&&!s.confirmed.has(k));
 if(key){delete s.values[key];s.active=r.cells.findIndex(c=>keyOf(c)===key);s.status='idle';save(s);renderPhone(s);}
}
function useHint(s){
 if(s.hints<=0||s.status==='correct'||s.completed.has(s.selected))return;
 const r=entry(s),index=firstBlank(s);if(index<0)return;
 const key=keyOf(r.cells[index]);s.values[key]=units(r.answer)[index];s.confirmed.add(key);s.hints--;s.status='hint';s.active=firstBlank(s);
 if(r.cells.every(c=>s.values[keyOf(c)])){judge(s);return;}
 synchronize(s);save(s);renderPhone(s);
}
function move(s,delta){
 const list=s.sample.runs,from=list.findIndex(r=>r.answer===s.selected);
 for(let i=1;i<=list.length;i++){const next=list[(from+delta*i+list.length*2)%list.length];if(!s.completed.has(next.answer)){selectEntry(s,next.answer);return;}}
 s.view='complete';save(s);renderPhone(s);
}
function statusBar(){return '<div class="status"><span>9:41</span><svg viewBox="0 0 54 13" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx=".6"/><rect x="5" y="5" width="3" height="7" rx=".6"/><rect x="10" y="2" width="3" height="10" rx=".6"/><path d="M20 5q7-7 14 0l-2 2q-5-5-10 0Zm3 4q4-4 8 0l-4 4Z"/><rect x="38" y="2" width="13" height="9" rx="2" fill="none" stroke="currentColor"/><rect x="40" y="4" width="9" height="5" rx="1"/><rect x="52" y="5" width="2" height="3" rx=".5"/></svg></div>';}
function board(s,mini=false){
 const r=entry(s),selection=new Set(r.cells.map(keyOf));const active=r.cells[s.active]?keyOf(r.cells[s.active]):'';
 return `<div class="board" role="group" aria-label="8 × 8">${s.sample.grid.map((row,y)=>row.map((value,x)=>{
  if(!value)return '<span class="board-cell block" aria-hidden="true"></span>';
  const key=`${y},${x}`,text=s.values[key]||'',num=s.sample.numbers[key];
  return `<button class="board-cell ${!mini&&selection.has(key)?'selected':''} ${!mini&&active===key&&!s.confirmed.has(key)?'current':''} ${s.confirmed.has(key)?'confirmed':''}" data-cell="${key}" aria-label="${y+1}, ${x+1}${text?', '+esc(text):''}" ${mini?'tabindex="-1"':''}>${num?`<span class="number">${num}</span>`:''}<span>${esc(text)}</span></button>`;
 }).join('')).join('')}</div>`;
}
function progress(s){const t=TEXT[s.locale];return `<div class="progress-row"><span class="progress-count"><b>${s.completed.size}</b> / ${s.sample.runs.length} ${t.words}</span><div class="progress-track"><i style="width:${s.completed.size/s.sample.runs.length*100}%"></i></div><span class="progress-check">${icon('check')}</span></div>`;}
function play(s){
 const t=TEXT[s.locale],r=entry(s),tokens=tray(s),done=s.completed.has(r.answer),canUndo=r.cells.some(c=>s.values[keyOf(c)]&&!s.confirmed.has(keyOf(c)));
 const message=s.status==='correct'?`${esc(r.answer)} ${t.wordDone}`:s.status==='repair'?t.repair:s.status==='hint'?t.hinted:done?t.already:t.idle;
 return `${statusBar()}<nav class="app-nav"><button class="icon-button" data-action="home" aria-label="${t.homeLabel}">${icon('back')}</button><span class="nav-title">${t.daily}</span><button class="hint-button" data-action="hint" aria-label="${t.hint} ${s.hints}" ${s.hints<=0||done?'disabled':''}>${icon('hint')}<span>${s.hints}</span></button></nav>${progress(s)}
 <div class="board-wrap">${board(s)}</div><section class="clue-panel"><div class="clue-label"><b class="clue-number">${r.number}</b><span>${r.direction==='across'?t.across:t.down}</span><span class="clue-length">${r.cells.length} ${t.letters}</span></div><p class="clue-text">${esc(r.clue)}</p></section>
 <div class="answer-row ${r.cells.length>5?'long':''}" role="group" aria-label="${s.locale==='ko'?'현재 단어 답칸':'Current answer'}">${r.cells.map((cell,i)=>{const key=keyOf(cell),v=s.values[key]||'',fixed=s.confirmed.has(key);return `<button class="answer-cell ${i===s.active&&!fixed?'current':''} ${fixed?'confirmed':''}" data-slot="${i}" aria-label="${t.answerSlot(i,r.cells.length)}${v?', '+esc(v):''}" ${fixed?'disabled':''}>${esc(v)}</button>`;}).join('')}</div>
 <section class="tray-section"><div class="tray-heading"><strong><span class="mini-star">✦</span>${t.pick}</strong><button class="tool-button" data-action="list">${icon('list')}${t.list}</button></div><div class="tray ${tokens.length>6?'dense':''} ${tokens.length>8?'wide':''}">${tokens.map(tile=>`<button class="letter-tile ${tile.used?'used':''}" data-token="${tile.id}" data-letter="${esc(tile.value)}" aria-label="${esc(tile.value)}, ${tile.used?t.used:t.available}" ${tile.used||done||s.status==='correct'?'disabled':''}>${esc(tile.value)}</button>`).join('')}</div></section>
 <div class="feedback ${s.status==='correct'||s.status==='hint'?'positive':''} ${s.status==='repair'?'repair':''}" aria-live="polite">${message}</div><div class="bottom-tools"><button class="tool-button" data-action="prev">${icon('back')}${t.prev}</button><button class="tool-button undo" data-action="erase" ${!canUndo?'disabled':''}>${icon('erase')}${t.erase}</button><button class="tool-button" data-action="next">${t.next}${icon('next')}</button></div><div class="home-indicator"></div>`;
}
function completion(s){const t=TEXT[s.locale];return `${statusBar()}<nav class="app-nav"><button class="icon-button" data-action="home" aria-label="${t.homeLabel}">${icon('back')}</button><span class="nav-title">${t.daily}</span></nav><section class="celebration"><div class="eyebrow">OCT 23 · DAILY COMPLETE</div><div class="complete-badge">${icon('check')}</div><h3 class="complete-title">${t.complete}</h3><p class="complete-sub">${t.completeSub(s.sample.runs.length)}</p><div class="complete-board">${board(s,true)}</div><div class="complete-meta"><div class="complete-metric"><b>${s.completed.size}</b>${t.words}</div><div class="complete-metric"><b>8 × 8</b>${t.grid}</div></div><p class="complete-message">${t.completeMessage}</p><button class="primary-button" data-action="home">${t.home}${icon('next')}</button><button class="secondary-button" data-action="record">${t.record}</button></section><div class="home-indicator"></div>`;}
function home(s){const t=TEXT[s.locale],done=isAllDone(s);return `${statusBar()}<nav class="app-nav"><span class="brand-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="nav-title">${s.locale==='ko'?'가로세로 낱말':t.daily}</span></nav><section class="home-content"><div class="home-eyebrow">${t.date}</div><h3 class="home-title">${t.homeTitle}</h3><p class="home-sub">${done?t.homeComplete:t.homeSub}</p><div class="home-brand" aria-hidden="true"><span class="star">✦</span><span class="brand-tile">${s.locale==='ko'?'낱':'W'}</span><span class="brand-tile">${s.locale==='ko'?'말':'O'}</span><span class="small"></span></div><div class="home-board">${board(s,true)}</div><div class="home-meta"><b>8 × 8</b>　${s.sample.runs.length} ${t.words}</div><div class="home-status"><b>${s.completed.size} / ${s.sample.runs.length}</b><div class="progress-track"><i style="width:${s.completed.size/s.sample.runs.length*100}%"></i></div>${done?icon('check'):''}</div><button class="primary-button" data-action="resume">${done?t.review:t.resume}${icon('next')}</button><p class="home-note">${t.saved}</p><div class="home-bottom"><button data-action="list">${icon('book')}${t.archive}</button><button data-action="record">${icon('stats')}${t.myStats}</button></div></section><div class="home-indicator"></div>`;}
function openList(s,record=false){
 const p=document.querySelector(`[data-demo="${s.id}"]`),t=TEXT[s.locale];const shade=document.createElement('div');shade.className='modal-shade';
 shade.innerHTML=`<section class="clue-sheet"><h3>${record?t.record:t.choose}</h3><div class="clue-list">${s.sample.runs.map(r=>`<button class="clue-choice" data-answer="${esc(r.answer)}"><b>${r.number}</b><span>${esc(r.clue)}</span><small>${s.completed.has(r.answer)?'✓':r.cells.length+' '+t.letters}</small></button>`).join('')}</div><button class="sheet-close">${t.close}</button></section>`;
 p.append(shade);shade.querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>selectEntry(s,b.dataset.answer)));shade.querySelector('.sheet-close').addEventListener('click',()=>shade.remove());
}
function fitPhone(p){
 const wrap=p.querySelector('.board-wrap');if(!wrap)return;
 wrap.style.width='';
 const overflow=p.scrollHeight-p.clientHeight;
 if(overflow>0)wrap.style.width=Math.max(160,wrap.getBoundingClientRect().width-overflow-2)+'px';
}
function renderPhone(s){
 const p=document.querySelector(`[data-demo="${s.id}"]`);if(!p)return;
 p.dataset.entry=s.selected;p.dataset.active=String(s.active);p.dataset.complete=String(s.completed.size);p.dataset.view=s.view;p.dataset.largeTray=String(tray(s).length>8);p.classList.toggle('busy',s.status==='correct');
 p.innerHTML=s.view==='complete'?completion(s):s.view==='home'?home(s):play(s);
 p.querySelectorAll('[data-token]').forEach(b=>b.addEventListener('click',()=>takeTile(s,b.dataset.token)));
 p.querySelectorAll('[data-slot]').forEach(b=>b.addEventListener('click',()=>{const index=Number(b.dataset.slot),key=keyOf(entry(s).cells[index]);if(s.confirmed.has(key))return;if(s.values[key])delete s.values[key];s.active=index;s.status='idle';save(s);renderPhone(s);}));
 p.querySelectorAll('[data-cell]').forEach(b=>b.addEventListener('click',()=>{
  const matches=s.sample.runs.filter(r=>r.cells.some(c=>keyOf(c)===b.dataset.cell));const target=matches.find(r=>r.answer!==s.selected)||matches[0];if(target)selectEntry(s,target.answer,target.cells.findIndex(c=>keyOf(c)===b.dataset.cell));
 }));
 p.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{
  const action=b.dataset.action;
  if(action==='hint')return useHint(s);
  if(action==='prev'||action==='next')return move(s,action==='prev'?-1:1);
  if(action==='erase')return clearOne(s);
  if(action==='list'||action==='record')return openList(s,action==='record');
  stopTimer(s);s.view=action==='home'?'home':'play';s.status='idle';save(s);renderPhone(s);
 }));
 fitPhone(p);
}
function renderGallery(){
 for(const s of states.values())stopTimer(s);
 document.querySelectorAll('[data-locale]').forEach(b=>b.classList.toggle('active',b.dataset.locale===locale));
 const labels=locale==='ko'?[
  ['play','01','타일로 한 단어씩','큰 보드와 큰 글자, 키보드 없이 바로 선택','음절을 골라 빈칸 채우기','한 번 누르면 다음 빈칸으로. 한 단어를 맞히면 다음 미완료 단어를 권합니다.'],
  ['retry','02','틀린 칸만 다시','맞는 글자는 남기고, 조각은 제자리로','처음부터 다시 풀지 않아요','틀린 위치만 비워두고 맞는 위치는 유지합니다. 후보를 다시 섞거나 진행을 지우지 않습니다.'],
  ['result','03','오늘 한 판 완성','모든 단어를 채웠을 때 한 번의 완성 화면','작은 성공이 모여 한 판 완주','8×8과 18단어를 유지합니다. 첫 세 단어 안내와 전체 완주는 구분합니다.']
 ]:[
  ['play','01','English / Pick tiles','Letter tiles in the same A visual direction','A familiar layout in another language','This is an 8×8, 22-word layout fixture, not a released English content pack.'],
  ['retry','02','English / Try again','Keep correct letters and refill the gaps','No keyboard and no lost progress','Repeated letters are separate pieces. Wrong pieces return to their original positions.'],
  ['result','03','English / Complete','Every word filled before the finish screen','A whole puzzle, one tile at a time','Language-specific word banks and editorial checks remain a separate future task.']
 ];
 document.querySelector('#gallery').innerHTML=labels.map(([scene,n,title,sub,strong,caption])=>`<section class="scene"><div class="scene-heading"><span class="scene-index">${n}</span><h2>${title}</h2></div><p class="scene-sub">${sub}</p><article class="phone locale-${locale}" data-demo="${locale}-${scene}"></article><p class="scene-caption"><strong>${strong}</strong>${caption}</p></section>`).join('');
 for(const [scene] of labels)renderPhone(getState(locale+'-'+scene,locale,scene));
}
document.querySelectorAll('[data-locale]').forEach(b=>b.addEventListener('click',()=>{locale=b.dataset.locale;history.replaceState({},'',`?locale=${locale}`);renderGallery();}));
document.querySelector('.reset-demo').addEventListener('click',()=>{
 for(const s of states.values())stopTimer(s);states.clear();
 for(const language of ['ko','en'])for(const scene of ['play','retry','result'])try{localStorage.removeItem(STORAGE_PREFIX+language+'-'+scene);}catch{}
 renderGallery();
});
renderGallery();
window.addEventListener('resize',()=>document.querySelectorAll('.phone').forEach(fitPhone));
