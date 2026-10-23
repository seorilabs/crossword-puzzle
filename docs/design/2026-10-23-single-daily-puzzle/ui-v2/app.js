const ICONS={
 back:'<path d="m14 5-7 7 7 7"/>', next:'<path d="m9 5 7 7-7 7"/>',
 gear:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',
 hint:'<path d="M8 15c-5-5-1-12 4-12s9 7 4 12l-1 2H9Z"/><path d="M9 20h6m-5 3h4"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
 book:'<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z"/><path d="M12 6v16"/>',
 stats:'<path d="M4 20V12h4v8m2 0V7h4v13m2 0V3h4v17"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.next}</svg>`;
const THEMES=[
 {id:'a',code:'A',name:'타일 보드',sub:'따뜻한 테이블 위, 한 칸씩 눌러 채우는 손맛',title:'추천: 가볍게 게임다운 방향',caption:'도톰한 타일, 잉크색 글자, 살구색 선택. 보드가 먼저 보이고, 작은 화면에서도 색과 글자가 또렷합니다.'},
 {id:'b',code:'B',name:'별빛 퍼즐',sub:'깊은 밤색 공간에 떠 있는 밝은 퍼즐 조각',title:'분위기와 몰입을 더하는 방향',caption:'어두운 배경과 밝은 타일의 대비. 정답을 채우면 별빛이 짧게 번지는 잔잔한 게임 느낌입니다.'},
 {id:'c',code:'C',name:'데일리 퍼즐북',sub:'종이와 잉크, 매일 한 장을 완성하는 즐거움',title:'오래 즐기는 퍼즐북의 방향',caption:'얇은 격자, 따뜻한 종이, 벽돌색 강조. 장식보다 읽는 편안함과 매일 완성하는 기분을 살립니다.'},
];
const COPY={
 ko:{daily:'오늘의 퍼즐',title:'오늘도,<br>한 칸씩.',sub:'천천히 채워도 괜찮아요.',date:'10월 23일',shortDate:'OCT 23',hint:'힌트',words:'단어',guide:'처음 세 단어',after:'이제 원하는 단어를 골라보세요',letter:'글자',across:'가로',down:'세로',input:'정답을 입력하세요',submit:'입력',list:'단서 목록',skip:'안내 건너뛰기',saved:'풀던 내용은 자동으로 저장돼요',continue:'이어서 풀기',archive:'지난 퍼즐',stats:'내 기록',good:'좋아요! 한 단어 더 채웠어요.',wrong:'단서를 한 번 더 살펴볼까요?',choose:'단서를 골라보세요',close:'닫기',keyboard:'한국어',start:'처음부터 천천히',homeLabel:'홈으로',settings:'설정'},
 en:{daily:'Daily Crossword',title:'A little pause.<br>A few good words.',sub:'Take your time. Make it yours.',date:'October 23',shortDate:'OCT 23',hint:'Hint',words:'words',guide:'Your first three words',after:'Pick any clue. Make it yours.',letter:'letters',across:'Across',down:'Down',input:'Type your answer',submit:'Enter',list:'All clues',skip:'Skip the guide',saved:'Your progress is saved automatically',continue:'Keep solving',archive:'Past puzzles',stats:'My stats',good:'Nice! One more word in place.',wrong:'Take another look at the clue.',choose:'Pick a clue',close:'Close',keyboard:'English',start:'One word at a time',homeLabel:'Back to home',settings:'Settings'}
};
const states=new Map();
let view=new URLSearchParams(location.search).get('view')||'play';
function status(){return '<div class="status"><span>9:41</span><svg viewBox="0 0 54 13" fill="currentColor" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx=".6"/><rect x="5" y="5" width="3" height="7" rx=".6"/><rect x="10" y="2" width="3" height="10" rx=".6"/><path d="M20 5q7-7 14 0l-2 2q-5-5-10 0Zm3 4q4-4 8 0l-4 4Z"/><rect x="38" y="2" width="13" height="9" rx="2" fill="none" stroke="currentColor"/><rect x="40" y="4" width="9" height="5" rx="1"/><rect x="52" y="5" width="2" height="3" rx=".5"/></svg></div>';}
function getState(id,locale){
 const key=id+locale;
 if(!states.has(key)){
  const data=locale==='ko'?SAMPLES.ko:SAMPLES.en;
  states.set(key,{data,locale,selected:data.selected,completed:new Set(data.completed),entered:{},guide:true});
 }
 return states.get(key);
}
function solvedCells(s){const cells=new Map();s.data.runs.filter(r=>s.completed.has(r.answer)).forEach(r=>r.cells.forEach(([y,x],i)=>cells.set(`${y},${x}`,Array.from(r.answer)[i])));return cells;}
function board(s,mini=false){
 const selected=s.data.runs.find(r=>r.answer===s.selected)||s.data.runs[0];
 const selection=new Set(selected.cells.map(c=>c.join(','))), solved=solvedCells(s);
 return `<div class="board" role="group" aria-label="8 × 8 ${s.locale==='ko'?'퍼즐':'crossword'}">${s.data.grid.map((row,y)=>row.map((v,x)=>{
  const key=`${y},${x}`,num=s.data.numbers[key],filled=solved.get(key)||'';
  if(!v)return '<span class="tile block" aria-hidden="true"></span>';
  const cls=['tile',!mini&&selection.has(key)?'selected':'',!mini&&selected.cells[0].join(',')===key?'active':'',filled?'solved':''].join(' ');
  return `<button class="${cls}" data-cell="${key}" aria-label="${y+1}, ${x+1}${filled?', '+filled:''}" ${mini?'tabindex="-1"':''}>${num?`<span class="number">${num}</span>`:''}<span>${filled}</span></button>`;
 }).join('')).join('')}</div>`;
}
function keyboard(locale){
 const rows=locale==='ko'?['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ','ㅁㄴㅇㄹㅎㅗㅓㅏㅣ','ㅋㅌㅊㅍㅠㅜㅡ']:['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
 return `<div class="keyboard" aria-hidden="true">${rows.map((row,i)=>`<div class="key-row">${i===2?'<span class="key small">⇧</span>':''}${Array.from(row).map(x=>`<span class="key">${x}</span>`).join('')}${i===2?'<span class="key small">⌫</span>':''}</div>`).join('')}<div class="key-row"><span class="key small">123</span><span class="key small">◎</span><span class="key space">${COPY[locale].keyboard}</span><span class="key return">${locale==='ko'?'완료':'Done'}</span></div></div>`;
}
function progress(s){const c=COPY[s.locale];return `<div class="progress-row"><span class="progress-count"><b>${s.completed.size}</b> / ${s.data.runs.length} ${c.words}</span><div class="progress-track"><div class="progress-fill" style="width:${s.completed.size/s.data.runs.length*100}%"></div></div><span class="progress-symbol">${icon('check')}</span></div>`;}
function playContent(s){
 const c=COPY[s.locale],r=s.data.runs.find(x=>x.answer===s.selected)||s.data.runs[0];
 return `${status()}<nav class="app-nav"><button class="icon-button" data-action="home" aria-label="${c.homeLabel}">${icon('back')}</button><span class="nav-title">${c.daily}</span><button class="hint-button" data-action="hint">${icon('hint')}${c.hint}</button></nav>
 ${progress(s)}<div class="board-wrap">${board(s)}</div>
 <div class="board-hint"><span class="sparkle">✦</span><span>${s.guide&&s.completed.size<3?c.guide:c.after}</span>${s.guide&&s.completed.size<3?'<span class="steps"><i class="done"></i><i class="done"></i><i class="current"></i></span><span>3/3</span>':''}</div>
 <section class="clue-card"><div class="clue-label"><b class="clue-id">${r.number}</b><span>${r.direction==='across'?c.across:c.down}</span><span class="clue-length">${Array.from(r.answer).length} ${c.letter}</span></div><p class="clue-text">${r.clue}</p></section>
 <form class="entry-row"><input class="entry" aria-label="${c.input}" placeholder="${c.input}" autocomplete="off" spellcheck="false" enterkeyhint="done"><button class="submit" type="submit">${c.submit}</button></form>
 <div class="tools"><button class="text-button" data-action="list">${icon('list')}${c.list}</button><button class="text-button" data-action="skip">${c.skip}</button></div><div class="feedback" aria-live="polite">${c.saved}</div>${keyboard(s.locale)}<div class="home-indicator"></div>`;
}
function homeContent(s){
 const c=COPY[s.locale];
 return `${status()}<nav class="app-nav"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="nav-title">${s.locale==='ko'?'가로세로 낱말':c.daily}</span><button class="icon-button" data-action="settings" aria-label="${c.settings}">${icon('gear')}</button></nav>
 <div class="home-content"><div class="home-eyebrow">${c.shortDate} · ${s.locale==='ko'?'오늘의 한 판':'YOUR DAILY PAUSE'}</div><h3 class="home-title">${c.title}</h3><p class="home-sub">${c.sub}</p><div class="home-hero" aria-hidden="true"><span class="hero-line"></span><span class="hero-spark">✦</span><span class="hero-tile">${s.locale==='ko'?'낱':'W'}</span><span class="hero-tile">${s.locale==='ko'?'말':'O'}</span><span class="hero-small"></span></div><div class="home-board">${board(s,true)}</div><div class="daily-meta"><strong>8 × 8</strong> ${s.data.runs.length} ${c.words} · ${c.date}</div><div class="home-progress"><b>${s.completed.size} / ${s.data.runs.length}</b><div class="progress-track"><div class="progress-fill" style="width:${s.completed.size/s.data.runs.length*100}%"></div></div><span>${s.locale==='ko'?'풀고 있어요':'in progress'}</span></div><button class="primary" data-action="play">${c.continue}${icon('next')}</button><p class="saved-note">${c.saved}</p><div class="secondary-nav"><button data-action="archive">${icon('book')}${c.archive}</button><button data-action="stats">${icon('stats')}${c.stats}</button></div></div><div class="home-indicator"></div>`;
}
function renderPhone(phone,s,mode){
 phone.innerHTML=mode==='home'?homeContent(s):playContent(s);
 phone.querySelector('form')?.addEventListener('submit',e=>{
  e.preventDefault();const c=COPY[s.locale],input=phone.querySelector('input');
  if(input.value.trim().normalize('NFC').toUpperCase()===s.selected.toUpperCase()){
   s.completed.add(s.selected);renderPhone(phone,s,mode);phone.querySelector('.feedback').textContent=c.good;
  }else phone.querySelector('.feedback').textContent=c.wrong;
 });
 phone.querySelectorAll('[data-cell]').forEach(b=>b.addEventListener('click',()=>{
  if(mode==='home'){renderPhone(phone,s,'play');return;}
  const matches=s.data.runs.filter(r=>r.cells.some(c=>c.join(',')===b.dataset.cell));
  s.selected=(matches.find(r=>r.answer!==s.selected)||matches[0]).answer;renderPhone(phone,s,mode);
 }));
 phone.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{
  const action=b.dataset.action,c=COPY[s.locale];
  if(action==='home'||action==='play'){renderPhone(phone,s,action);return;}
  if(action==='skip'){s.guide=false;renderPhone(phone,s,mode);return;}
  if(action==='list'){
   const modal=document.createElement('div');modal.className='modal-backdrop';
   modal.innerHTML=`<section class="clue-sheet"><h3>${c.choose}</h3>${s.data.runs.filter(r=>!s.completed.has(r.answer)).slice(0,4).map(r=>`<button class="clue-choice" data-answer="${r.answer}"><b>${r.number}</b><span>${r.clue}</span><small>${Array.from(r.answer).length}</small></button>`).join('')}<button class="close-sheet">${c.close}</button></section>`;
   phone.append(modal);modal.querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>{s.selected=b.dataset.answer;renderPhone(phone,s,mode);}));modal.querySelector('.close-sheet').addEventListener('click',()=>modal.remove());
   return;
  }
  const note=phone.querySelector('.feedback')||phone.querySelector('.saved-note');
  note.textContent=s.locale==='ko'?'시안에서는 화면 구성만 확인할 수 있어요.':'This is a visual preview.';
 }));
}
function render(){
 document.querySelector('.gallery-head>p').textContent=view==='global'?'긴 영문 단서와 버튼 문구 확인용. 영문 8×8, 22단어 배치 예시입니다.':'같은 8×8, 같은 18단어, 같은 진행 상태로 비교하는 세 가지 시안';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const gallery=document.querySelector('#gallery');gallery.className=view==='global'?'global-gallery':'';
 if(view==='global'){
  gallery.innerHTML=`${['home','play'].map((mode,i)=>`<section class="concept"><div class="concept-heading"><span class="concept-code">A</span><h2>${i?'English / Play':'English / Home'}</h2></div><p class="concept-sub">영문 배치 예시. 해외 콘텐츠 팩은 후속 작업입니다.</p><article class="phone theme-a" data-concept="a-en-${mode}"></article></section>`).join('')}<aside class="global-note"><div class="eyebrow">READY FOR THE NEXT CHAPTER</div><h2>표현은 가볍게,<br>언어의 자리는 넉넉하게.</h2><p>한글과 영문의 글자 폭이 달라도 보드, 단서, 입력의 순서는 같습니다.</p><ul><li>그림에 글자를 굽지 않고 실제 서체 사용</li><li>긴 단서는 줄바꿈, 버튼은 문구 길이에 맞춤</li><li>한국어 조합 입력과 언어별 키보드 유지</li><li>언어별 정답, 단서와 발행 날짜를 분리</li><li>전체 어휘와 한 판의 단어 수 보존</li></ul><p>영문 퍼즐은 배치 확인용입니다. 번역만으로 해외용 정답과 단서를 만드는 방식은 쓰지 않습니다.</p><span class="locale-chip">한국어</span> <span class="locale-chip">English</span></aside>`;
  gallery.querySelectorAll('.phone').forEach((p,i)=>renderPhone(p,getState('en-'+i,'en'),i?'play':'home'));
 }else{
  gallery.innerHTML=THEMES.map(t=>`<section class="concept"><div class="concept-heading"><span class="concept-code">${t.code}</span><h2>${t.name}</h2>${t.id==='a'?'<span class="recommend">추천</span>':''}</div><p class="concept-sub">${t.sub}</p><article class="phone theme-${t.id}" data-concept="${t.id}"></article><p class="concept-caption"><strong>${t.title}</strong>${t.caption}</p></section>`).join('');
  gallery.querySelectorAll('.phone').forEach(p=>renderPhone(p,getState(p.dataset.concept,'ko'),view));
 }
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;history.replaceState({},'',`?view=${view}`);render();}));
render();
