/**
 * Interview Prep Max v9 — Application Logic
 * APP_VERSION: 9.0.0
 */
const APP_VERSION = '9.0.0';

// ═══ DATA LOADING ═══
var BASE_QUESTIONS = [], SUBNET_PROBLEMS = [], TS_SCENARIOS = [], CMD_TASKS = [],
    CODE_TASKS = [], GIT_TASKS = [], REGEX_TASKS = [], ANSIBLE_PB_TASKS = [],
    DOCKERFILE_TASKS = [], K8S_TASKS = [], PORTS_TASKS = [], LABS_TASKS = [], TIPS = [];

const DATA_FILES = {
  base_questions: 'tasks/base_questions.json',
  subnet: 'tasks/subnet.json',
  ts: 'tasks/ts.json',
  cmd: 'tasks/cmd.json',
  code: 'tasks/code.json',
  git: 'tasks/git.json',
  regex: 'tasks/regex.json',
  ansible_pb: 'tasks/ansible_pb.json',
  dockerfile: 'tasks/dockerfile.json',
  k8s: 'tasks/k8s.json',
  ports: 'tasks/ports.json',
  labs: 'tasks/labs.json',
  tips: 'tasks/tips.json'
};

const DATA_VARS = {
  base_questions: 'BASE_QUESTIONS', subnet: 'SUBNET_PROBLEMS', ts: 'TS_SCENARIOS',
  cmd: 'CMD_TASKS', code: 'CODE_TASKS', git: 'GIT_TASKS', regex: 'REGEX_TASKS',
  ansible_pb: 'ANSIBLE_PB_TASKS', dockerfile: 'DOCKERFILE_TASKS', k8s: 'K8S_TASKS',
  ports: 'PORTS_TASKS', labs: 'LABS_TASKS', tips: 'TIPS'
};

async function loadAllData() {
  const status = document.getElementById('load-status');
  const errors = [];
  const promises = Object.entries(DATA_FILES).map(async ([key, url]) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      window[DATA_VARS[key]] = data;
      status.textContent = `Загружено: ${key} (${data.length})`;
    } catch (e) {
      console.error(`Failed to load ${url}:`, e);
      errors.push(`${key}: ${e.message}`);
      status.textContent = `Ошибка загрузки ${key}`;
    }
  });
  await Promise.all(promises);
  if (errors.length > 0) {
    document.getElementById('app-loading').innerHTML =
      '<div style="font-size:48px;margin-bottom:16px">⚠️</div>'+
      '<div style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--red)">Не удалось загрузить данные</div>'+
      '<div style="font-size:12px;color:var(--text2);max-width:400px;margin:0 auto">'+
      errors.map(e => '<div>• '+esc(e)+'</div>').join('')+
      '</div>'+
      '<div style="margin-top:16px"><button class="btn btn-primary" onclick="location.reload()">🔄 Попробовать снова</button></div>';
    throw new Error('Data loading failed: '+errors.join(', '));
  }
  status.textContent = 'Инициализация...';
}

// ═══ STORAGE ═══
const LS = {
  mistakes:'ipmax_mistakes',stats:'ipmax_stats',history:'ipmax_history',
  qprog:'ipmax_qprog',streak_best:'ipmax_streak_best',custom:'ipmax_custom',theme:'ipmax_theme',
  ts_scores:'ipmax_ts_scores',cmd_prog:'ipmax_cmd_prog',code_prog:'ipmax_code_prog',subnet_prog:'ipmax_subnet_prog',
  git_prog:'ipmax_git_prog',regex_prog:'ipmax_regex_prog',ans_prog:'ipmax_ans_prog',df_prog:'ipmax_df_prog',
  k8s_prog:'ipmax_k8s_prog',pt_prog:'ipmax_pt_prog',labs_prog:'ipmax_labs_prog',daily:'ipmax_daily'
};
function lsGet(k,def){try{const v=localStorage.getItem(LS[k]);return v?JSON.parse(v):def;}catch(e){console.warn('lsGet error:',e);return def;}}
function lsSet(k,v){try{localStorage.setItem(LS[k],JSON.stringify(v));}catch(e){console.warn('lsSet error:',e);}}
function getCustomQ(){return lsGet('custom',[]);}
function getAllQ(){return [...BASE_QUESTIONS,...getCustomQ()];}
function getMistakes(){return lsGet('mistakes',{});}
function getQProg(){return lsGet('qprog',{});}

// Динамический список тем (из данных, а не захардкожен)
function getAllTopics(){const topics=new Set();getAllQ().forEach(q=>topics.add(q.topic));return [...topics].sort();}

// ═══ STATE ═══
let currentMode='all',currentView='standard',currentTopic='all',currentLevel='all',currentCategory='all';
let timerSecs=0,timerInterval=null;
let activeQuestions=[],singleIdx=0;
let streak=0;
let questionStartTime={};
let cmdMuscleActive=false;

// ═══ NAV ═══
const PAGE_TITLES={home:'Главная',exam:'Экзамен',analytics:'Аналитика',
  subnet:'Тренажёр подсетей',ts:'Troubleshooting-симулятор',
  cmd:'Command Builder',code:'Code Reviewer',
  ansible:'Ansible Playbook',dockerfile:'Dockerfile',k8s:'K8s YAML',ports:'Порты TCP',labs:'Debugging',
  git:'Git-тренажёр',regex:'Regex-тренажёр',tips:'Советы'};
function nav(page){
  stopActiveSessions();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  const pg=document.getElementById('page-'+page);
  const sb=document.querySelector('[data-page="'+page+'"]');
  if(pg) pg.classList.add('active');
  if(sb) sb.classList.add('active');
  document.getElementById('page-title').textContent=PAGE_TITLES[page]||page;
  closeSidebar();
  if(page==='home') renderHome();
  if(page==='analytics') renderAnalytics();
  if(page==='subnet') renderSubnet();
  if(page==='ts') renderTsList();
  if(page==='cmd') renderCmd();
  if(page==='labs') renderLabs();
  if(page==='code') renderCode();
  if(page==='ansible') renderAnsible();
  if(page==='dockerfile') renderDockerfile();
  if(page==='k8s') renderK8s();
  if(page==='ports') renderPorts();
  if(page==='tips') renderTips();
  if(page==='exam') renderQuestions();
  if(page==='git') renderGit();
  if(page==='regex') renderRegex();
}
function startMode(m){nav('exam');currentMode=m;document.querySelectorAll('#mode-chips .chip').forEach(c=>c.classList.remove('active'));renderQuestions();}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('open');}
document.getElementById('sidebar-overlay').onclick=closeSidebar;

function stopActiveSessions(){
  if(blitzState.timer){clearInterval(blitzState.timer);blitzState.timer=null;blitzState.active=false;}
  if(mockState.timer){clearInterval(mockState.timer);mockState.timer=null;mockState.active=false;}
  if(cmdMuscleActive){cmdMuscleActive=false;renderCmd();}
}

// ═══ THEME ═══
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='light'?'':'light';
  document.documentElement.setAttribute('data-theme',next);
  document.getElementById('theme-icon').textContent=next==='light'?'🌙':'☀️';
  document.getElementById('theme-label').textContent=next==='light'?'Тёмная тема':'Светлая тема';
  lsSet('theme',next||'dark');
}

// ═══ HELPERS ═══
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[b[i],b[j]]=[b[j],b[i]];}return b;}

// ═══ TAGS ═══
const TAG_MAP={Terraform:'tf',Linux:'lx','Сети':'net',Ansible:'ans',Docker:'docker',Kubernetes:'k8s','CI/CD':'cicd',Git:'git',Regex:'rx'};
function ttag(t){return '<span class="tag tag-'+(TAG_MAP[t]||'tf')+'">'+esc(t)+'</span>';}
function ltag(l){const m={Junior:'jr',Middle:'md',Senior:'sr'};return '<span class="tag tag-'+(m[l]||'jr')+'">'+l+'</span>';}
function ctag(c){if(!c||c==='definition') return '';const lbl={scenario:'Сценарий',tradeoff:'Trade-off',output:'Анализ вывода'};const cls={scenario:'sc',tradeoff:'tr',output:'out'};return '<span class="tag tag-'+(cls[c]||'sc')+'">'+(lbl[c]||c)+'</span>';}

// ═══ SYNTAX HIGHLIGHTING ═══
function highlightDockerfile(code){return esc(code).replace(/^(FROM\s+.+)$/gm,'<span style="color:#c084fc">$1</span>').replace(/^(RUN\s+.+)$/gm,'<span style="color:#fbbf24">$1</span>').replace(/^(COPY|ADD)\s+(.+)$/gm,'<span style="color:#38bdf8">$1</span> <span style="color:#a5b4fc">$2</span>').replace(/^(CMD|ENTRYPOINT)\s+(.+)$/gm,'<span style="color:#4ade80">$1</span> <span style="color:#fde68a">$2</span>').replace(/^(WORKDIR|EXPOSE|ENV|USER|HEALTHCHECK)\s+(.+)$/gm,'<span style="color:#fb923c">$1</span> <span style="color:#cbd5e1">$2</span>').replace(/^(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/--([a-z-]+)/g,'<span style="color:#f59e0b">--$1</span>');}
function highlightYAML(code){return esc(code).replace(/^(\s*)([a-z_][a-z_0-9]*):/gm,'$1<span style="color:#c084fc">$2</span>:').replace(/:\s+(true|false|yes|no)$/gm,': <span style="color:#f59e0b">$1</span>').replace(/:\s+(\d+)$/gm,': <span style="color:#38bdf8">$1</span>').replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span style="color:#4ade80">$1</span>').replace(/^(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/\{\{\s*(\S+)\s*\}\}/g,'<span style="color:#fb923c">{{ $1 }}</span>');}
function highlightHCL(code){return esc(code).replace(/(resource|data|variable|output|provider|module|terraform)\s+"([^"]+)"/g,'<span style="color:#c084fc">$1</span> <span style="color:#4ade80">"$2"</span>').replace(/(resource|data|variable|output|provider|module|terraform)\s+/g,'<span style="color:#c084fc">$1</span> ').replace(/=\s*(true|false)/g,'= <span style="color:#f59e0b">$1</span>').replace(/(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/"([^"]*)"/g,'<span style="color:#4ade80">"$1"</span>');}

// ═══ EXAM ═══
function setMode(m,el){currentMode=m;setChip('mode-chips',el);clearTInterval();renderQuestions();}
function setView(v,el){currentView=v;setChip('view-chips',el);clearTInterval();renderQuestions();}
function setTopic(t,el){currentTopic=t;setChip('topic-chips',el);renderQuestions();}
function setLevel(l,el){currentLevel=l;setChip('level-chips',el);renderQuestions();}
function setCategory(c,el){currentCategory=c;setChip('cat-chips',el);renderQuestions();}
function setTimer(s,el){timerSecs=s;setChip('timer-chips',el);}
function setChip(groupId,el){document.querySelectorAll('#'+groupId+' .chip').forEach(c=>c.classList.remove('active'));if(el)el.classList.add('active');}
function clearMistakes(){if(confirm('Сбросить все ошибки?')){lsSet('mistakes',{});renderQuestions();}}
function clearTInterval(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}}

function filterQs(){
  let qs=getAllQ();
  if(currentTopic!=='all') qs=qs.filter(q=>q.topic===currentTopic);
  if(currentLevel!=='all') qs=qs.filter(q=>q.level===currentLevel);
  if(currentCategory!=='all') qs=qs.filter(q=>(q.category||'definition')===currentCategory);
  const s=document.getElementById('exam-search')?.value?.toLowerCase()||'';
  if(s) qs=qs.filter(q=>q.q.toLowerCase().includes(s)||(q.options||[]).some(o=>o.toLowerCase().includes(s)));
  const mistakes=getMistakes();const qprog=getQProg();
  if(currentMode==='mistakes') qs=qs.filter(q=>mistakes[q.id]);
  if(currentMode==='smart'||currentMode==='srs'){
    const now=Date.now();
    if(currentMode==='srs'){
      // Только вопросы, которые пора повторить
      qs=qs.filter(q=>{const p=qprog[q.id];return !p||!p.nextReviewAt||p.nextReviewAt<=now;});
    } else {
      // Умный: ошибки + давно не видел + низкий процент
      qs=qs.filter(q=>{const p=qprog[q.id];if(!p) return true;const r=p.correct/(p.correct+p.wrong);const age=(now-(p.lastSeen||0))/3600000;return r<0.7||age>24;});
    }
  }
  if(['mix10','mix20','mix30'].includes(currentMode)){
    const n={mix10:10,mix20:20,mix30:30}[currentMode];
    qs=shuffle(qs).slice(0,n);
  }
  return qs;
}

function renderQuestions(){
  clearTInterval();
  const qs=filterQs();activeQuestions=qs;
  const cont=document.getElementById('questions-container');
  const sc=document.getElementById('single-controls');
  const pi=document.getElementById('progress-info');
  const sb=document.getElementById('seg-bar');
  if(!qs.length){cont.innerHTML='<div class="empty-state"><div class="icon">🔍</div><p>Нет вопросов для выбранных фильтров</p></div>';sc.style.display='none';sb.style.display='none';pi.innerHTML='';return;}
  const qprog=getQProg();const total=qs.length;
  let ok=0,err=0;
  qs.forEach(q=>{const p=qprog[q.id];if(p){if(p.correct>p.wrong)ok++;else if(p.wrong>0)err++;}});
  sb.style.display='flex';
  sb.innerHTML='<div class="seg-ok" style="width:'+(ok/total*100)+'%"></div><div class="seg-err" style="width:'+(err/total*100)+'%"></div><div class="seg-none" style="width:'+((total-ok-err)/total*100)+'%"></div>';
  pi.innerHTML='<span style="font-size:12px;color:var(--text2)">Показано: <b>'+total+'</b> | ✅ '+ok+' | ❌ '+err+' | ⭕ '+(total-ok-err)+'</span>';
  if(currentView==='flashcard'){renderFlashcards(qs);sc.style.display='none';return;}
  if(currentView==='freeform'){renderFreeform();sc.style.display='none';return;}
  if(currentView==='single'){singleIdx=0;renderSingle();sc.style.display='block';return;}
  sc.style.display='none';
  cont.innerHTML=qs.map(q=>renderQCard(q,false)).join('');
}

function renderQCard(q,sMode){
  const mistakes=getMistakes();const qprog=getQProg();const qp=qprog[q.id]||{correct:0,wrong:0};
  const L=['A','B','C','D','E'];const opts=(q.options||[]);
  const order=[...Array(opts.length).keys()];
  for(let i=order.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[order[i],order[j]]=[order[j],order[i]];}
  const studyMode=document.getElementById('study-mode-cb')?.checked;
  questionStartTime[q.id]=Date.now();
  return '<div class="q-card" id="qcard-'+q.id+'">'+
    '<div class="q-meta">'+ttag(q.topic)+ltag(q.level)+ctag(q.category)+
    '<span class="q-num">#'+q.id+(mistakes[q.id]?' ❌':'')+
    ' <span style="color:var(--text3)">✅'+qp.correct+' ❌'+qp.wrong+'</span></span>'+
    (sMode&&timerSecs?'<span class="q-timer" id="timer-'+q.id+'">'+timerSecs+'с</span>':'')+
    '</div>'+
    '<div class="q-text">'+esc(q.q)+'</div>'+
    '<div class="q-options">'+
    order.map((origIdx,visPos)=>'<div class="q-opt" id="opt-'+q.id+'-'+visPos+'" data-orig-idx="'+origIdx+'" data-answer="'+q.answer+'" onclick="pick('+q.id+','+origIdx+','+q.answer+')"><span class="opt-letter">'+L[visPos]+'</span><span>'+esc(opts[origIdx])+'</span></div>').join('')+
    '</div>'+
    (q.explanation&&studyMode?'<div class="q-explanation">💡 '+esc(q.explanation)+'</div>':'')+
    '<div id="qexpl-'+q.id+'" style="display:none" class="q-explanation"></div>'+
    '</div>';
}

function pick(qid,chosen,correct){
  const card=document.getElementById('qcard-'+qid);
  if(!card||card.querySelector('.q-opt.correct-opt')) return;
  const q=getAllQ().find(x=>x.id===qid);
  const opts=card.querySelectorAll('.q-opt');
  opts.forEach(o=>{o.classList.add('disabled');const oi=parseInt(o.getAttribute('data-orig-idx'));if(oi===correct)o.classList.add('correct-opt');else if(oi===chosen)o.classList.add('wrong-opt');});
  const ok=chosen===correct;
  card.classList.add(ok?'correct':'wrong');
  streak=ok?streak+1:0;
  const best=lsGet('streak_best',0);if(streak>best)lsSet('streak_best',streak);
  updateStreakDisplay();
  const qprog=getQProg();
  if(!qprog[qid])qprog[qid]={correct:0,wrong:0,times:[]};
  if(!qprog[qid].times)qprog[qid].times=[];
  qprog[qid][ok?'correct':'wrong']++;
  qprog[qid].lastSeen=Date.now();
  const respTime=questionStartTime[qid]?Math.round((Date.now()-questionStartTime[qid])/1000):0;
  qprog[qid].times.push(respTime);
  if(qprog[qid].times.length>20)qprog[qid].times.shift();
  // Spaced Repetition (SM-2)
  if(!qprog[qid].ease) qprog[qid].ease = 2.5;
  if(!qprog[qid].interval) qprog[qid].interval = 0;
  if(!qprog[qid].repetitions) qprog[qid].repetitions = 0;
  if(ok){
    qprog[qid].repetitions++;
    if(qprog[qid].interval === 0) qprog[qid].interval = 1;
    else if(qprog[qid].interval === 1) qprog[qid].interval = 3;
    else qprog[qid].interval = Math.round(qprog[qid].interval * qprog[qid].ease);
    qprog[qid].ease = Math.min(3.0, qprog[qid].ease + 0.1);
  } else {
    qprog[qid].repetitions = 0;
    qprog[qid].interval = 1;
    qprog[qid].ease = Math.max(1.3, qprog[qid].ease - 0.2);
  }
  qprog[qid].nextReviewAt = Date.now() + qprog[qid].interval * 86400000;
  lsSet('qprog',qprog);
  const mistakes=getMistakes();if(!ok)mistakes[qid]=1;else delete mistakes[qid];lsSet('mistakes',mistakes);
  const stats=lsGet('stats',{total:0,correct:0});stats.total++;if(ok)stats.correct++;lsSet('stats',stats);
  const hist=lsGet('history',[]);hist.unshift({date:new Date().toLocaleString('ru'),topic:q&&q.topic,correct:ok});if(hist.length>20)hist.pop();lsSet('history',hist);
  const today=new Date().toISOString().slice(0,10);const daily=lsGet('daily',{});daily[today]=(daily[today]||0)+1;lsSet('daily',daily);
  if(q&&q.explanation){const el=document.getElementById('qexpl-'+qid);if(el){el.innerHTML='💡 '+esc(q.explanation);el.style.display='block';}}
  clearTInterval();
  if(pageActive('home')) renderMasteryCards();
}
function pageActive(p){return document.getElementById('page-'+p)?.classList.contains('active');}

function renderSingle(){
  const q=activeQuestions[singleIdx];if(!q) return;
  document.getElementById('questions-container').innerHTML=renderQCard(q,true);
  document.getElementById('single-counter').textContent=(singleIdx+1)+' / '+activeQuestions.length;
  if(timerSecs>0) startTimer(q.id,timerSecs);
}
function singleNext(){clearTInterval();if(singleIdx<activeQuestions.length-1){singleIdx++;renderSingle();}}
function singlePrev(){clearTInterval();if(singleIdx>0){singleIdx--;renderSingle();}}
function startTimer(qid,secs){clearTInterval();let rem=secs;timerInterval=setInterval(()=>{rem--;const el=document.getElementById('timer-'+qid);if(el){el.textContent=rem+'с';if(rem<=5)el.classList.add('urgent');}if(rem<=0){clearTInterval();autoFail(qid);}},1000);}
function autoFail(qid){const q=getAllQ().find(x=>x.id===qid);if(!q) return;const c=document.getElementById('qcard-'+qid);if(!c||c.querySelector('.q-opt.correct-opt')) return;pick(qid,-1,q.answer);}

function renderFlashcards(qs){
  document.getElementById('questions-container').innerHTML=qs.map((q,i)=>
    '<div class="flashcard" id="fc-'+q.id+'" onclick="flipCard('+q.id+')"><div class="flashcard-inner"><div class="fc-front"><div class="q-meta" style="justify-content:center;margin-bottom:10px">'+ttag(q.topic)+ltag(q.level)+'</div><p>'+esc(q.q)+'</p><div style="margin-top:10px;font-size:11px;color:var(--text3)">Нажмите для ответа</div></div>'+
    '<div class="fc-back"><div style="font-weight:700;color:var(--primary-h);margin-bottom:8px">✅ '+esc((q.options||[])[q.answer]||'')+'</div>'+(q.explanation?'<p style="font-size:13px;color:var(--text2)">'+esc(q.explanation)+'</p>':'')+
    '</div></div></div>'
  ).join('');
}
function flipCard(id){document.getElementById('fc-'+id)?.classList.toggle('flipped');}

// ═══ FREEFORM MODE (ответ без вариантов) ═══
let freeformIdx=0, freeformQs=[], freeformAnswers={};
function renderFreeform(){
  freeformQs=filterQs();freeformIdx=0;freeformAnswers={};
  if(!freeformQs.length){document.getElementById('questions-container').innerHTML='<div class="empty-state"><div class="icon">🔍</div><p>Нет вопросов</p></div>';return;}
  renderFreeformQ();
}
function renderFreeformQ(){
  if(freeformIdx>=freeformQs.length){
    renderFreeformResults();return;
  }
  const q=freeformQs[freeformIdx];questionStartTime[q.id]=Date.now();
  document.getElementById('questions-container').innerHTML=
    '<div class="card" style="max-width:700px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
    '<div style="display:flex;gap:6px">'+ttag(q.topic)+ltag(q.level)+'</div>'+
    '<span style="font-size:13px;color:var(--text2)">'+(freeformIdx+1)+' / '+freeformQs.length+'</span>'+
    '</div>'+
    '<div class="q-text" style="font-size:16px;margin-bottom:16px">'+esc(q.q)+'</div>'+
    '<textarea class="form-input" id="ff-inp" rows="4" placeholder="Ваш ответ..." style="width:100%;margin-bottom:12px;font-size:14px" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')freeformReveal()"></textarea>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="freeformReveal()">Показать ответ</button>'+
    '<button class="btn btn-outline btn-sm" onclick="freeformSkip()">Пропустить</button>'+
    '</div>'+
    '<div id="ff-answer" style="display:none;margin-top:14px;padding:14px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--primary)">'+
    '<div style="font-weight:700;color:var(--primary-h);margin-bottom:8px">✅ Правильный ответ:</div>'+
    '<div style="font-size:14px;line-height:1.6;color:var(--text)">'+esc((q.options||[])[q.answer]||'')+'</div>'+
    (q.explanation?'<div style="margin-top:10px;font-size:13px;color:var(--text2);line-height:1.6">💡 '+esc(q.explanation)+'</div>':'')+
    '<div style="margin-top:14px;display:flex;gap:8px">'+
    '<span style="font-size:12px;color:var(--text2)">Оцените себя:</span>'+
    '<button class="btn btn-sm" style="background:var(--green-dim);color:var(--green)" onclick="freeformRate(\'good\')">✅ Знал</button>'+
    '<button class="btn btn-sm" style="background:var(--yellow-dim);color:var(--yellow)" onclick="freeformRate(\'partial\')">🤔 Частично</button>'+
    '<button class="btn btn-sm" style="background:var(--red-dim);color:var(--red)" onclick="freeformRate(\'bad\')">❌ Не знал</button>'+
    '</div></div></div>';
  setTimeout(()=>document.getElementById('ff-inp')?.focus(),100);
}
function freeformReveal(){
  document.getElementById('ff-answer').style.display='block';
  document.getElementById('ff-inp').disabled=true;
}
function freeformRate(rating){
  const q=freeformQs[freeformIdx];
  freeformAnswers[q.id]=rating;
  // Записываем в статистику
  const qprog=getQProg();if(!qprog[q.id])qprog[q.id]={correct:0,wrong:0,times:[]};
  if(rating==='good') qprog[q.id].correct++;
  else if(rating==='bad') qprog[q.id].wrong++;
  else {qprog[q.id].correct++;qprog[q.id].wrong++;} // частично = 0.5/0.5
  qprog[q.id].lastSeen=Date.now();
  const respTime=questionStartTime[q.id]?Math.round((Date.now()-questionStartTime[q.id])/1000):0;
  if(!qprog[q.id].times)qprog[q.id].times=[];
  qprog[q.id].times.push(respTime);
  if(!qprog[q.id].ease) qprog[q.id].ease=2.5;
  if(!qprog[q.id].interval) qprog[q.id].interval=0;
  if(!qprog[q.id].repetitions) qprog[q.id].repetitions=0;
  if(rating==='good'){qprog[q.id].repetitions++;qprog[q.id].interval=qprog[q.id].interval===0?1:Math.round(qprog[q.id].interval*qprog[q.id].ease);qprog[q.id].ease=Math.min(3,qprog[q.id].ease+0.1);}
  else {qprog[q.id].repetitions=0;qprog[q.id].interval=1;qprog[q.id].ease=Math.max(1.3,qprog[q.id].ease-0.2);}
  qprog[q.id].nextReviewAt=Date.now()+qprog[q.id].interval*86400000;
  lsSet('qprog',qprog);
  const stats=lsGet('stats',{total:0,correct:0});stats.total++;if(rating==='good')stats.correct++;lsSet('stats',stats);
  freeformIdx++;renderFreeformQ();
}
function freeformSkip(){freeformIdx++;renderFreeformQ();}
function renderFreeformResults(){
  const total=freeformQs.length;const good=Object.values(freeformAnswers).filter(r=>r==='good').length;
  const partial=Object.values(freeformAnswers).filter(r=>r==='partial').length;
  const bad=Object.values(freeformAnswers).filter(r=>r==='bad').length;
  const score=Math.round((good+partial*0.5)/total*100);
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:40px 20px">'+
    '<div style="font-size:60px;margin-bottom:10px">'+(score>=80?'🏆':score>=50?'🎯':'📚')+'</div>'+
    '<div style="font-size:28px;font-weight:800;margin-bottom:8px">Сессия завершена</div>'+
    '<div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:6px">'+score+'%</div>'+
    '<div style="font-size:14px;color:var(--text2);margin-bottom:16px">✅ '+good+' зная | 🤔 '+partial+' частично | ❌ '+bad+' не зная</div>'+
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="currentView=\'freeform\';renderFreeform()">🔄 Ещё раз</button>'+
    '<button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
}

// ═══ MOCK INTERVIEW ═══
let mockState={questions:[],idx:0,answers:[],timeLeft:1800,timer:null,active:false};
function startMockInterview(){
  const allQ=getAllQ();if(allQ.length<15){alert('Нужно минимум 15 вопросов');return;}
  mockState.questions=shuffle(allQ).slice(0,15);
  mockState.idx=0;mockState.answers=[];mockState.timeLeft=1800;mockState.active=true;
  nav('exam');
  document.getElementById('exam-controls').style.display='none';
  document.getElementById('progress-info').style.display='none';
  document.getElementById('seg-bar').style.display='none';
  document.getElementById('single-controls').style.display='none';
  renderMockQ();mockState.timer=setInterval(mockTick,1000);
}
function mockTick(){
  mockState.timeLeft--;
  const el=document.getElementById('mock-timer');
  if(el){const m=Math.floor(mockState.timeLeft/60),s=('0'+mockState.timeLeft%60).slice(-2);el.textContent=m+':'+s;if(mockState.timeLeft<=120)el.style.color='var(--red)';}
  if(mockState.timeLeft<=0)endMockInterview();
}
function renderMockQ(){
  if(mockState.idx>=mockState.questions.length){endMockInterview();return;}
  const q=mockState.questions[mockState.idx];
  document.getElementById('questions-container').innerHTML=
    '<div style="background:var(--bg2);border:2px solid var(--primary);border-radius:14px;padding:24px;max-width:700px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'+
    '<div style="display:flex;gap:6px">'+ttag(q.topic)+ltag(q.level)+'</div>'+
    '<div style="font-size:18px;font-weight:800" id="mock-timer">'+Math.floor(mockState.timeLeft/60)+':'+('0'+mockState.timeLeft%60).slice(-2)+'</div>'+
    '<div style="font-size:13px;color:var(--text2)">Вопрос '+(mockState.idx+1)+'/15</div></div>'+
    '<div class="q-text" style="font-size:16px;margin-bottom:20px">'+esc(q.q)+'</div>'+
    '<textarea class="form-input" id="mock-inp" rows="5" placeholder="Ваш ответ..." style="width:100%;font-size:14px;margin-bottom:12px"></textarea>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="mockNext()">Следующий →</button>'+
    '<button class="btn btn-outline btn-sm" onclick="mockSkip()">Пропустить</button>'+
    '<button class="btn btn-outline btn-sm" onclick="endMockInterview()" style="color:var(--red)">Завершить</button>'+
    '</div></div>';
  setTimeout(()=>document.getElementById('mock-inp')?.focus(),100);
}
function mockNext(){mockState.answers.push({q:mockState.questions[mockState.idx],answer:document.getElementById('mock-inp')?.value||'(пусто)'});mockState.idx++;renderMockQ();}
function mockSkip(){mockState.answers.push({q:mockState.questions[mockState.idx],answer:'(пропущено)'});mockState.idx++;renderMockQ();}
function endMockInterview(){
  clearInterval(mockState.timer);mockState.active=false;
  document.getElementById('exam-controls').style.display='';
  document.getElementById('progress-info').style.display='';
  document.getElementById('seg-bar').style.display='';
  if(mockState.idx<mockState.questions.length) mockState.answers.push({q:mockState.questions[mockState.idx],answer:document.getElementById('mock-inp')?.value||'(не закончено)'});
  // Анализ по темам
  const byTopic={};mockState.answers.forEach(a=>{const t=a.q.topic;if(!byTopic[t])byTopic[t]=[];byTopic[t].push(a);});
  const totalQ=mockState.answers.length;
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:30px 20px;max-width:800px;margin:0 auto">'+
    '<div style="font-size:48px;margin-bottom:8px">🎤</div>'+
    '<div style="font-size:24px;font-weight:800;margin-bottom:4px">Mock Interview завершён</div>'+
    '<div style="font-size:14px;color:var(--text2);margin-bottom:20px">Ответов: '+totalQ+' | Время: '+Math.floor((1800-mockState.timeLeft)/60)+' мин</div>'+
    '<div class="card" style="text-align:left;margin-bottom:14px"><div class="card-title">📊 Разбор по темам</div>'+
    Object.entries(byTopic).map(([t,as])=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:13px"><span>'+esc(t)+'</span><span style="color:var(--text2)">'+as.length+' вопр.</span></div>').join('')+'</div>'+
    '<div class="card" style="text-align:left"><div class="card-title">📝 Ваши ответы и правильные</div>'+
    mockState.answers.map(a=>'<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)"><div style="font-weight:600;margin-bottom:4px">'+esc(a.q.q)+'</div><div style="font-size:12px;color:var(--text2);margin-bottom:4px">Ваш ответ: <span style="color:var(--yellow)">'+esc(a.answer.substring(0,200))+'</span></div><div style="font-size:12px;color:var(--green)">✅ Правильный: '+esc((a.q.options||[])[a.q.answer]||'')+'</div></div>').join('')+'</div>'+
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">'+
    '<button class="btn btn-primary" onclick="startMockInterview()">🔄 Ещё интервью</button>'+
    '<button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
}

// ═══ HOME ═══
function updateStreakDisplay(){const sd=document.getElementById('streak-display');if(sd)sd.textContent='🔥 '+streak;}
function renderHome(){
  renderMasteryCards();
  const s=streak,best=lsGet('streak_best',0);
  const banner=document.getElementById('home-streak-banner');
  if(s>0||best>0){banner.style.display='flex';}
  document.getElementById('home-streak-num').textContent=streak;
  document.getElementById('home-best-streak').textContent='Лучшая серия: '+best;
  const hist=lsGet('history',[]);
  const hc=document.getElementById('home-history');
  if(!hist.length){hc.innerHTML='<p style="color:var(--text3);font-size:13px">История пуста. Начните экзамен!</p>';return;}
  hc.innerHTML=hist.slice(0,5).map(h=>'<div class="history-item"><span style="color:var(--text3);font-size:11px">'+esc(h.date)+'</span><span>'+esc(h.topic||'')+'</span><span style="color:'+(h.correct?'var(--green)':'var(--red)')+'">'+(h.correct?'✅ Верно':'❌ Неверно')+'</span></div>').join('');
}
function renderMasteryCards(){
  const qprog=getQProg(),allQ=getAllQ();
  const topics=getAllTopics();
  const icons=['⚡','🐧','🌐','📦','🐳','☸️','🔄','🔀','🔍'];
  const colors=['var(--primary)','var(--green)','var(--blue)','var(--orange)','#38bdf8','#60a5fa','#fb923c','#f59e0b','#c084fc'];
  const mc=document.getElementById('mastery-cards');
  if(!mc) return;
  mc.innerHTML=topics.slice(0,9).map((t,i)=>{
    const tqs=allQ.filter(q=>q.topic===t);
    const m=tqs.filter(q=>{const p=qprog[q.id];return p&&p.correct>p.wrong;}).length;
    const pct=tqs.length?Math.round(m/tqs.length*100):0;
    return '<div class="mastery-card" data-topic="'+t+'" onclick="currentTopic=this.getAttribute(\'data-topic\');nav(\'exam\')">'+'<div style="font-size:20px">'+(icons[i]||'📋')+'</div>'+'<div class="mastery-pct" style="color:'+(colors[i]||'var(--primary)')+'">'+pct+'%</div>'+'<div class="mastery-name">'+t+'</div>'+'<div style="font-size:11px;color:var(--text3);margin-top:2px">'+m+'/'+tqs.length+'</div>'+'<div class="mastery-bar"><div class="mastery-fill" style="width:'+pct+'%;background:'+(colors[i]||'var(--primary)')+'"></div></div></div>';
  }).join('');
}

// ═══ ANALYTICS ═══
function renderAnalytics(){
  const stats=lsGet('stats',{total:0,correct:0});const qprog=getQProg(),allQ=getAllQ(),mistakes=getMistakes();
  const pct=stats.total?Math.round(stats.correct/stats.total*100):0;
  let totalTime=0,totalCount=0;
  Object.values(qprog).forEach(p=>{if(p.times){p.times.forEach(t=>{totalTime+=t;totalCount++;});}});
  const avgTime=totalCount?Math.round(totalTime/totalCount):0;
  document.getElementById('stat-cards').innerHTML=[
    {v:stats.total,l:'Всего ответов',c:'var(--primary)'},{v:stats.correct,l:'Правильных',c:'var(--green)'},
    {v:stats.total-stats.correct,l:'Неправильных',c:'var(--red)'},{v:pct+'%',l:'Точность',c:'var(--yellow)'},
    {v:Object.keys(mistakes).length,l:'В ошибках',c:'var(--red)'},{v:lsGet('streak_best',0),l:'Лучшая серия',c:'var(--orange)'},
    {v:avgTime+'с',l:'Среднее время ответа',c:'var(--primary-h)'}
  ].map(s=>'<div class="stat-card"><div class="stat-val" style="color:'+s.c+'">'+s.v+'</div><div class="stat-label">'+s.l+'</div></div>').join('');
  const hist=lsGet('history',[]);
  document.getElementById('history-list').innerHTML=hist.length?hist.map(h=>'<div class="history-item"><span style="color:var(--text3);font-size:11px">'+esc(h.date)+'</span><span class="tag '+(TAG_MAP[h.topic]?'tag-'+(TAG_MAP[h.topic]):'tag-tf')+'">'+esc(h.topic||'')+'</span><span style="color:'+(h.correct?'var(--green)':'var(--red)')+'">'+(h.correct?'✅':'❌')+'</span></div>').join(''):'<p style="color:var(--text3);font-size:13px;padding:10px">Нет данных</p>';
  let ok=0,err=0;const tot=allQ.length;
  allQ.forEach(q=>{const p=qprog[q.id];if(p){if(p.correct>p.wrong)ok++;else if(p.wrong>0)err++;}});
  document.getElementById('analytics-seg-bar').innerHTML='<div class="seg-ok" style="width:'+(ok/tot*100)+'%"></div><div class="seg-err" style="width:'+(err/tot*100)+'%"></div><div class="seg-none" style="width:'+((tot-ok-err)/tot*100)+'%"></div>';
  document.getElementById('analytics-seg-label').textContent='✅ Изучено: '+ok+' | ❌ Ошибки: '+err+' | ⭕ Не отвечено: '+(tot-ok-err)+' из '+tot;
  drawRadar();renderTimeChart();renderCategoryStats();renderWeakSpots();renderGradeReadiness();
}
function drawRadar(){
  const canvas=document.getElementById('radarCanvas');if(!canvas) return;const ctx=canvas.getContext('2d');
  const qprog=getQProg(),allQ=getAllQ();const topics=getAllTopics().slice(0,8);const N=topics.length;
  const scores=topics.map(t=>{const tqs=allQ.filter(q=>q.topic===t);if(!tqs.length) return 0;return tqs.filter(q=>{const p=qprog[q.id];return p&&p.correct>p.wrong;}).length/tqs.length;});
  const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,R=Math.min(W,H)/2-36;
  const dark=document.documentElement.getAttribute('data-theme')!=='light';
  ctx.clearRect(0,0,W,H);
  const ang=i=>i*2*Math.PI/N-Math.PI/2;
  for(let r=1;r<=5;r++){ctx.beginPath();for(let i=0;i<N;i++){const a=ang(i),rv=r*R/5;i===0?ctx.moveTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv):ctx.lineTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv);}ctx.closePath();ctx.strokeStyle=dark?'#2e3348':'#e2e8f0';ctx.lineWidth=1;ctx.stroke();}
  for(let i=0;i<N;i++){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ang(i))*R,cy+Math.sin(ang(i))*R);ctx.strokeStyle=dark?'#2e3348':'#e2e8f0';ctx.stroke();}
  ctx.beginPath();scores.forEach((s,i)=>{const a=ang(i),r=s*R;i===0?ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r):ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);});ctx.closePath();ctx.fillStyle='rgba(99,102,241,.25)';ctx.fill();ctx.strokeStyle='#6366f1';ctx.lineWidth=2;ctx.stroke();
  ctx.textAlign='center';ctx.font='bold 10px Inter';ctx.fillStyle=dark?'#94a3b8':'#475569';
  topics.forEach((t,i)=>{const a=ang(i);ctx.fillText(t,cx+Math.cos(a)*(R+28),cy+Math.sin(a)*(R+28)+4);});
  scores.forEach((s,i)=>{const a=ang(i),r=s*R;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,4,0,Math.PI*2);ctx.fillStyle='#6366f1';ctx.fill();});
}
function renderTimeChart(){
  const daily=lsGet('daily',{});const bars=document.getElementById('act-bars');const totalEl=document.getElementById('act-total');if(!bars) return;
  const days=14;const today=new Date();let maxVal=1,total=0;const data=[];
  for(let i=days-1;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);const cnt=daily[key]||0;data.push({key,cnt,label:d.toLocaleDateString('ru',{day:'numeric',month:'numeric'})});if(cnt>maxVal)maxVal=cnt;total+=cnt;}
  bars.innerHTML=data.map(d=>{const h=Math.max(2,Math.round(d.cnt/maxVal*68));return '<div class="ab-wrap"><div class="ab-cnt">'+(d.cnt||'')+'</div><div class="ab-fill" style="height:'+h+'px"></div><div class="ab-lbl">'+d.label+'</div></div>';}).join('');
  if(totalEl) totalEl.textContent='Всего за 14 дней: '+total+' ответов';
}
function renderCategoryStats(){
  const el=document.getElementById('cat-stat-rows');if(!el) return;const qprog=getQProg(),allQ=getAllQ();
  const cats=[{id:'definition',label:'Определение'},{id:'scenario',label:'Сценарий'},{id:'tradeoff',label:'Trade-off'}];
  el.innerHTML=cats.map(c=>{const qs=allQ.filter(q=>(q.category||'definition')===c.id);if(!qs.length) return '';const ok=qs.filter(q=>{const p=qprog[q.id];return p&&p.correct>p.wrong;}).length;const pct=Math.round(ok/qs.length*100);return '<div class="cat-row"><div class="cat-row-lbl">'+c.label+' ('+qs.length+')</div><div class="cat-row-bar"><div class="cat-row-fill" style="width:'+pct+'%"></div></div><div class="cat-row-pct">'+pct+'%</div></div>';}).join('');
}
function renderWeakSpots(){
  const el=document.getElementById('weak-spots-list');if(!el) return;const qprog=getQProg(),allQ=getAllQ();
  const weak=allQ.map(q=>{const p=qprog[q.id];if(!p||p.wrong===0) return null;const total=p.correct+p.wrong;if(total<2) return null;return {q,wrong:p.wrong,total,pct:Math.round(p.wrong/total*100)};}).filter(Boolean).sort((a,b)=>b.pct-a.pct).slice(0,5);
  if(!weak.length){el.innerHTML='<p style="font-size:12px;color:var(--text3)">Ответьте хотя бы на 2 вопроса, чтобы увидеть слабые места.</p>';return;}
  el.innerHTML=weak.map(w=>'<div class="weak-item"><span class="weak-pct">'+w.pct+'%</span><span class="weak-txt" title="'+esc(w.q.q)+'">'+esc(w.q.q.slice(0,60))+(w.q.q.length>60?'…':'')+'</span><span style="font-size:10px;color:var(--text3)">'+w.wrong+'/'+w.total+'</span></div>').join('');
}

// ═══ GRADE READINESS ═══
function renderGradeReadiness(){
  const el=document.getElementById('weak-spots-list');if(!el) return;
  const qprog=getQProg(),allQ=getAllQ();
  const grades={Junior:{qs:[],ok:0},Middle:{qs:[],ok:0},Senior:{qs:[],ok:0}};
  allQ.forEach(q=>{const lvl=q.level||'Junior';if(grades[lvl]){grades[lvl].qs.push(q);const p=qprog[q.id];if(p&&p.correct>p.wrong)grades[lvl].ok++;}});
  // Добавляем карточку после weak-spots
  const card=document.getElementById('grade-readiness-card');
  const container=document.getElementById('analytics-three');
  if(!container||card) return;
  const div=document.createElement('div');div.className='card';div.id='grade-readiness-card';
  div.innerHTML='<div class="card-title">🎯 Готовность по грейдам</div>'+
    Object.entries(grades).map(([g,d])=>{
      const pct=d.qs.length?Math.round(d.ok/d.qs.length*100):0;
      const barClr=pct>=70?'var(--green)':pct>=40?'var(--yellow)':'var(--red)';
      return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">'+g+'</span><span style="color:var(--text2)">'+d.ok+'/'+d.qs.length+' ('+pct+'%)</span></div><div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+barClr+';border-radius:3px"></div></div></div>';
    }).join('')+
    '<div style="font-size:11px;color:var(--text3);margin-top:8px">Оценка: ≥70% Junior → готов к Middle, ≥70% Middle → готов к Senior</div>';
  container.appendChild(div);
}

// ═══ SUBNET ═══
let subnetDone={};
function calcSubnet(ip,prefix){
  const p=ip.split('.').map(Number);const ipN=(p[0]<<24|p[1]<<16|p[2]<<8|p[3])>>>0;
  const mask=prefix===0?0:(0xFFFFFFFF<<(32-prefix))>>>0;const net=(ipN&mask)>>>0;const bc=(net|(~mask>>>0))>>>0;
  const first=(net+1)>>>0,last=(bc-1)>>>0;const hosts=prefix>=31?(prefix===31?2:1):Math.pow(2,32-prefix)-2;
  function n2ip(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
  return{network:n2ip(net),broadcast:n2ip(bc),first:n2ip(first),last:n2ip(last),hosts:hosts,mask:n2ip(mask)};
}
function renderSubnet(){
  subnetDone=lsGet('subnet_prog',{});const cont=document.getElementById('subnet-container');
  const fieldLabels={network:'Адрес сети',broadcast:'Broadcast',first:'Первый хост',last:'Последний хост',mask:'Маска подсети'};
  cont.innerHTML=SUBNET_PROBLEMS.map((prob,idx)=>{const ans=calcSubnet(prob.ip,prob.prefix);const done=subnetDone[idx];
    return '<div class="subnet-problem" id="sp-'+idx+'"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="subnet-ip">'+prob.ip+'/'+prob.prefix+'</div><span style="font-size:12px;color:var(--text3)">'+prob.desc+'</span><span id="sp-badge-'+idx+'" style="margin-left:auto">'+(done?'<span style="color:var(--green);font-weight:700">✅ Верно!</span>':'')+'</span></div><div class="subnet-inputs">'+
    ['network','broadcast','first','last','mask'].map(f=>'<div class="subnet-input-group"><label>'+fieldLabels[f]+'</label><input class="subnet-input'+(done?' ok':'')+'" id="si-'+idx+'-'+f+'" placeholder="x.x.x.x" value="'+(done?ans[f]:'')+'" '+(done?'readonly':'')+' ></div>').join('')+
    '<div class="subnet-input-group"><label>Кол-во хостов</label><input class="subnet-input'+(done?' ok':'')+'" id="si-'+idx+'-hosts" placeholder="число" value="'+(done?ans.hosts:'')+'" '+(done?'readonly':'')+' ></div></div>'+
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="checkSubnet('+idx+')" '+(done?'disabled':'')+'>Проверить</button><button class="btn btn-outline btn-sm" onclick="showSubnetAns('+idx+')">Показать ответ</button></div>'+
    '<div class="subnet-result" id="sr-'+idx+'"></div></div>';
  }).join('');updateSubnetProg();
}
function checkSubnet(idx){
  const prob=SUBNET_PROBLEMS[idx];const ans=calcSubnet(prob.ip,prob.prefix);const fields=['network','broadcast','first','last','mask'];let allOk=true;
  fields.forEach(f=>{const el=document.getElementById('si-'+idx+'-'+f);if(!el) return;const ok=el.value.trim()===ans[f];el.classList.toggle('ok',ok);el.classList.toggle('err',!ok);if(!ok)allOk=false;});
  const he=document.getElementById('si-'+idx+'-hosts');if(he){const ok=parseInt(he.value)===ans.hosts;he.classList.toggle('ok',ok);he.classList.toggle('err',!ok);if(!ok)allOk=false;}
  if(allOk){subnetDone[idx]=1;lsSet('subnet_prog',subnetDone);document.getElementById('sp-badge-'+idx).innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно!</span>';updateSubnetProg();}
}
function showSubnetAns(idx){
  const el=document.getElementById('sr-'+idx);if(!el)return;
  if(el.style.display==='block'){el.style.display='none';return;}
  const prob=SUBNET_PROBLEMS[idx];const ans=calcSubnet(prob.ip,prob.prefix);
  const p=prob.ip.split('.').map(Number);const ipN=(p[0]<<24|p[1]<<16|p[2]<<8|p[3])>>>0;
  const mask=prob.prefix===0?0:(0xFFFFFFFF<<(32-prob.prefix))>>>0;const bits=32-prob.prefix;
  const hosts=prob.prefix>=31?(prob.prefix===31?2:1):Math.pow(2,bits)-2;
  el.innerHTML='<div style="margin-bottom:10px"><b>📐 Пошаговый расчёт '+prob.ip+'/'+prob.prefix+'</b></div><div style="font-size:12px;line-height:2;color:var(--text2)"><b>1. Маска:</b> /'+prob.prefix+' → '+prob.prefix+' бит = 1, остальные '+bits+' = 0<br>&nbsp;&nbsp;&nbsp;Двоичная: '+mask.toString(2).padStart(32,'0').replace(/(.{8})/g,'$1 ')+'<br>&nbsp;&nbsp;&nbsp;Десятичная: <b style="color:var(--primary-h)">'+ans.mask+'</b><br><b>2. IP:</b> '+ipN.toString(2).padStart(32,'0').replace(/(.{8})/g,'$1 ')+'<br><b>3. Сеть:</b> <b style="color:var(--green)">'+ans.network+'</b><br><b>4. Broadcast:</b> <b style="color:var(--red)">'+ans.broadcast+'</b><br><b>5-6. Хосты:</b> '+ans.first+' – '+ans.last+'<br><b>7. Всего:</b> 2<sup>'+bits+'</sup>-2 = <b style="color:var(--yellow)">'+hosts+'</b></div>';
  el.style.display='block';
}
function updateSubnetProg(){const done=Object.keys(subnetDone).length;document.getElementById('subnet-progress-fill').style.width=(done/SUBNET_PROBLEMS.length*100)+'%';document.getElementById('subnet-score-display').textContent=done+' / '+SUBNET_PROBLEMS.length;}

// ═══ TROUBLESHOOTING ═══
let tsState={scenarioId:null,currentNode:'start',totalPoints:0,steps:[]};let tsScores={};
function renderTsList(){
  tsScores=lsGet('ts_scores',{});document.getElementById('ts-list').style.display='block';document.getElementById('ts-game').classList.remove('active');document.getElementById('ts-end').style.display='none';
  document.getElementById('ts-cards').innerHTML=TS_SCENARIOS.map(s=>{const sc=tsScores[s.id]||0;const done=!!tsScores[s.id];
    return '<div class="ts-sc-card'+(done?' done':'')+'" onclick="tsStart('+s.id+')"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-size:13px;font-weight:700">'+s.title+'</span>'+(done?'<span class="ts-score-badge">'+sc+' очков</span>':'')+'</div><div style="font-size:12px;color:var(--text2);line-height:1.5">'+s.context+'</div></div>';
  }).join('');
}
function tsStart(id){const scen=TS_SCENARIOS.find(s=>s.id===id);if(!scen) return;tsState={scenarioId:id,currentNode:'start',totalPoints:0,steps:[]};document.getElementById('ts-list').style.display='none';document.getElementById('ts-game').classList.add('active');document.getElementById('ts-game-title').textContent=scen.title;document.getElementById('ts-context-text').textContent=scen.context;document.getElementById('ts-end').style.display='none';document.getElementById('ts-step-log').innerHTML='';tsRenderNode(scen,'start');}
function tsRenderNode(scen,nodeId){const node=scen.nodes[nodeId];if(!node) return;document.getElementById('ts-observation').textContent=node.obs;document.getElementById('ts-game-score').textContent='Очки: '+tsState.totalPoints;const ch=document.getElementById('ts-choices');if(!node.choices||!node.choices.length){ch.innerHTML='';tsEndScenario(scen);return;}ch.innerHTML=node.choices.map((c,i)=>'<div class="ts-choice" onclick="tsChoose('+i+')"><span>'+esc(c.text)+'</span></div>').join('');}
function tsChoose(i){const scen=TS_SCENARIOS.find(s=>s.id===tsState.scenarioId);const node=scen.nodes[tsState.currentNode];const choice=node.choices[i];document.querySelectorAll('.ts-choice').forEach((el,j)=>{el.classList.add(j===i?(choice.ok?'ch-ok':'ch-bad'):'disabled');el.onclick=null;});tsState.totalPoints=Math.max(0,tsState.totalPoints+(choice.pts||0));document.getElementById('ts-step-log').innerHTML+='<div class="ts-log-item">'+(choice.ok?'✅':'❌')+' '+esc(choice.text)+' ('+(choice.pts>=0?'+':'')+choice.pts+' очков)</div>';document.getElementById('ts-game-score').textContent='Очки: '+tsState.totalPoints;setTimeout(()=>{tsState.currentNode=choice.next;tsRenderNode(scen,choice.next);},900);}
function tsEndScenario(scen){document.getElementById('ts-end').style.display='block';const pts=Math.min(100,Math.max(0,tsState.totalPoints));document.getElementById('ts-end-score').textContent=pts;tsScores[scen.id]=pts;lsSet('ts_scores',tsScores);}
function tsBack(){renderTsList();}function tsRestart(){tsStart(tsState.scenarioId);}

// ═══ LABS / DEBUGGING ═══
let labsDone={};
function renderLabs(){
  labsDone=lsGet('labs_prog',{});const L=['A','B','C','D'];const icons={yaml:'📄',log:'📋',incident:'🚨'};
  document.getElementById('labs-container').innerHTML=LABS_TASKS.map(t=>{const done=labsDone[t.id];
    return '<div class="code-card" id="lab-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'+
    '<span style="font-size:16px">'+(icons[t.type]||'🔬')+'</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span>'+
    '<span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(LABS_TASKS.indexOf(t)+1)+'/15</span>'+
    (done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+
    '</div><div style="font-size:13px;color:var(--text2);margin-bottom:10px;line-height:1.5">📋 '+esc(t.scenario)+'</div>'+
    (t.code?'<div class="code-block">'+esc(t.code)+'</div>':'')+
    '<div class="code-question" style="color:var(--yellow)">'+esc(t.question)+'</div>'+
    '<div class="code-opts">'+t.opts.map((o,i)=>'<div class="code-opt'+(done!==undefined?' disabled':'')+'" id="labopt-'+t.id+'-'+i+'" onclick="pickLab('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></div>').join('')+'</div>'+
    '<div class="code-fix" id="labfix-'+t.id+'">🔧 '+esc(t.bug)+'\n\n✅ '+esc(t.fix)+'</div></div>';
  }).join('');Object.entries(labsDone).forEach(([id,chosen])=>applyLabState(parseInt(id),chosen));updateLabsProg();
}
function applyLabState(id,chosen){const t=LABS_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#lab-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('labfix-'+id).style.display='block';}
function pickLab(tid,chosen){if(labsDone[tid]!==undefined) return;labsDone[tid]=chosen;lsSet('labs_prog',labsDone);applyLabState(tid,chosen);updateLabsProg();}
function updateLabsProg(){const done=Object.keys(labsDone).length;const ok=Object.entries(labsDone).filter(([id,c])=>LABS_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('labs-pb').style.width=(done/LABS_TASKS.length*100)+'%';document.getElementById('labs-score-lbl').textContent=ok+' / '+LABS_TASKS.length+' правильно';}

// ═══ COMMAND BUILDER ═══
let cmdDone={}, cmdMuscleIdx=0, cmdMuscleQs=[];
function renderCmd(){cmdDone=lsGet('cmd_prog',{});const L=['A','B','C','D'];document.getElementById('cmd-container').innerHTML='<div style="margin-bottom:12px"><button class="btn btn-outline btn-sm" onclick="startCmdMuscle()">💪 Muscle Memory (ввод команд)</button></div>'+CMD_TASKS.map((t,idx)=>{const done=cmdDone[t.id];return '<div class="cmd-card" id="cmd-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:11px;font-weight:700;color:var(--text3)">Задача '+(idx+1)+'/40</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅ Верно':'❌ Ошибка')+'</span>':'')+'</div><div class="cmd-task-text">'+esc(t.task)+'</div><div class="cmd-opts">'+t.opts.map((o,i)=>'<div class="cmd-opt'+(done!==undefined?' disabled':'')+'" id="co-'+t.id+'-'+i+'" onclick="pickCmd('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3)">'+L[i]+'.</span><code>'+esc(o)+'</code></div>').join('')+'</div><div class="cmd-exp" id="cexp-'+t.id+'">'+esc(t.exp)+'</div></div>';}).join('');Object.entries(cmdDone).forEach(([id,chosen])=>applyCmdState(parseInt(id),chosen));updateCmdProg();}
function startCmdMuscle(){cmdMuscleQs=shuffle(CMD_TASKS).slice(0,10);cmdMuscleIdx=0;document.getElementById('cmd-container').innerHTML='<div id="muscle-area"></div>';renderMuscleQ();}
function renderMuscleQ(){if(cmdMuscleIdx>=cmdMuscleQs.length){renderCmd();return;}const t=cmdMuscleQs[cmdMuscleIdx];document.getElementById('muscle-area').innerHTML='<div class="card" style="max-width:600px;margin:0 auto;text-align:center"><div style="font-size:12px;color:var(--text3);margin-bottom:8px">'+(cmdMuscleIdx+1)+' / 10</div><div class="cmd-task-text" style="font-size:15px;margin-bottom:14px">'+esc(t.task)+'</div><input class="form-input" id="muscle-inp" style="width:100%;font-family:JetBrains Mono,monospace;font-size:14px;text-align:center;margin-bottom:10px" placeholder="Введите команду..." onkeydown="if(event.key===\'Enter\')checkMuscle()"><button class="btn btn-primary" onclick="checkMuscle()">Проверить</button><div id="muscle-fb" style="display:none;margin-top:12px"></div><div style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="cmdMuscleIdx++;renderMuscleQ()">Пропустить</button></div></div>';setTimeout(()=>document.getElementById('muscle-inp')?.focus(),100);}
function checkMuscle(){const inp=document.getElementById('muscle-inp');const fb=document.getElementById('muscle-fb');const t=cmdMuscleQs[cmdMuscleIdx];const correct=t.opts[t.answer];const userCmd=inp.value.trim();const correctParts=correct.replace(/\s+/g,' ').trim().split(' ');const userParts=userCmd.replace(/\s+/g,' ').trim().split(' ');const ok=userCmd===correct||(userParts.length>=correctParts.length*0.6&&correctParts.every(p=>userCmd.includes(p)));fb.style.display='block';if(ok){fb.innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно!</span>';if(!cmdDone[t.id]){cmdDone[t.id]=t.answer;lsSet('cmd_prog',cmdDone);}}else{fb.innerHTML='<span style="color:var(--red);font-weight:700">❌ Правильно:</span><br><code style="color:var(--green)">'+esc(correct)+'</code><br><div style="font-size:12px;color:var(--text2);margin-top:4px">💡 '+esc(t.exp)+'</div>';}inp.disabled=true;setTimeout(()=>{cmdMuscleIdx++;renderMuscleQ();},ok?800:2000);}
function applyCmdState(id,chosen){const t=CMD_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#cmd-'+id+' .cmd-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('cexp-'+id).style.display='block';}
function pickCmd(tid,chosen){if(cmdDone[tid]!==undefined) return;cmdDone[tid]=chosen;lsSet('cmd_prog',cmdDone);applyCmdState(tid,chosen);updateCmdProg();}
function updateCmdProg(){const done=Object.keys(cmdDone).length;const ok=Object.entries(cmdDone).filter(([id,c])=>CMD_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('cmd-progress-fill').style.width=(done/CMD_TASKS.length*100)+'%';document.getElementById('cmd-score-display').textContent=ok+' / '+CMD_TASKS.length+' правильно';}

// ═══ CODE REVIEWER ═══
let codeDone={};
function renderCode(){codeDone=lsGet('code_prog',{});const L=['A','B','C','D'];document.getElementById('code-container').innerHTML=CODE_TASKS.map((t,idx)=>{const done=codeDone[t.id];const tool=t.tool==='Terraform'?'tag-tf':'tag-ans';const hlCode=t.tool==='Terraform'?highlightHCL(t.code):highlightYAML(t.code);const hlFix=t.tool==='Terraform'?highlightHCL(t.fix):highlightYAML(t.fix);return '<div class="code-card" id="code-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag '+tool+'">'+t.tool+'</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(idx+1)+'/15</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-question">🔍 Найдите ошибку в этом коде:</div><div class="code-block">'+hlCode+'</div><div class="code-opts">'+t.opts.map((o,i)=>'<div class="code-opt'+(done!==undefined?' disabled':'')+'" id="codeopt-'+t.id+'-'+i+'" onclick="pickCode('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></div>').join('')+'</div><div class="code-fix" id="cfix-'+t.id+'">✅ Исправление:\n'+hlFix+'</div></div>';}).join('');Object.entries(codeDone).forEach(([id,chosen])=>applyCodeState(parseInt(id),chosen));updateCodeProg();}
function applyCodeState(id,chosen){const t=CODE_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#code-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('cfix-'+id).style.display='block';}
function pickCode(tid,chosen){if(codeDone[tid]!==undefined) return;codeDone[tid]=chosen;lsSet('code_prog',codeDone);applyCodeState(tid,chosen);updateCodeProg();}
function updateCodeProg(){const done=Object.keys(codeDone).length;const ok=Object.entries(codeDone).filter(([id,c])=>CODE_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('code-progress-fill').style.width=(done/CODE_TASKS.length*100)+'%';document.getElementById('code-score-display').textContent=ok+' / '+CODE_TASKS.length+' правильно';}

// ═══ ANSIBLE TRAINER ═══
let ansDone={};
function renderAnsible(){ansDone=lsGet('ans_prog',{});const L=['A','B','C','D'];document.getElementById('ans-container').innerHTML=ANSIBLE_PB_TASKS.map(t=>{const done=ansDone[t.id];return '<div class="code-card" id="ans-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-ans">Ansible</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(ANSIBLE_PB_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-question">📋 Задача: '+esc(t.task)+'</div><div class="code-block">'+highlightYAML(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 Найдите ошибку:</div><div class="code-opts">'+t.opts.map((o,i)=>'<div class="code-opt'+(done!==undefined?' disabled':'')+'" id="ansopt-'+t.id+'-'+i+'" onclick="pickAns('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></div>').join('')+'</div><div class="code-fix" id="afix-'+t.id+'">✅ Исправление:\n'+highlightYAML(t.fix)+'</div></div>';}).join('');Object.entries(ansDone).forEach(([id,chosen])=>applyAnsState(parseInt(id),chosen));updateAnsProg();}
function applyAnsState(id,chosen){const t=ANSIBLE_PB_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#ans-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('afix-'+id).style.display='block';}
function pickAns(tid,chosen){if(ansDone[tid]!==undefined) return;ansDone[tid]=chosen;lsSet('ans_prog',ansDone);applyAnsState(tid,chosen);updateAnsProg();}
function updateAnsProg(){const done=Object.keys(ansDone).length;const ok=Object.entries(ansDone).filter(([id,c])=>ANSIBLE_PB_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('ans-pb').style.width=(done/ANSIBLE_PB_TASKS.length*100)+'%';document.getElementById('ans-score-lbl').textContent=ok+' / '+ANSIBLE_PB_TASKS.length+' правильно';}

// ═══ DOCKERFILE TRAINER ═══
let dfDone={};
function renderDockerfile(){dfDone=lsGet('df_prog',{});const L=['A','B','C','D'];document.getElementById('df-container').innerHTML=DOCKERFILE_TASKS.map(t=>{const done=dfDone[t.id];return '<div class="code-card" id="df-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-docker">Docker</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(DOCKERFILE_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-block">'+highlightDockerfile(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 В чём проблема?</div><div class="code-opts">'+t.opts.map((o,i)=>'<div class="code-opt'+(done!==undefined?' disabled':'')+'" id="dfopt-'+t.id+'-'+i+'" onclick="pickDf('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></div>').join('')+'</div><div class="code-fix" id="dfix-'+t.id+'">✅ Правильный вариант:\n'+esc(t.fix)+'</div></div>';}).join('');Object.entries(dfDone).forEach(([id,chosen])=>applyDfState(parseInt(id),chosen));updateDfProg();}
function applyDfState(id,chosen){const t=DOCKERFILE_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#df-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('dfix-'+id).style.display='block';}
function pickDf(tid,chosen){if(dfDone[tid]!==undefined) return;dfDone[tid]=chosen;lsSet('df_prog',dfDone);applyDfState(tid,chosen);updateDfProg();}
function updateDfProg(){const done=Object.keys(dfDone).length;const ok=Object.entries(dfDone).filter(([id,c])=>DOCKERFILE_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('df-pb').style.width=(done/DOCKERFILE_TASKS.length*100)+'%';document.getElementById('df-score-lbl').textContent=ok+' / '+DOCKERFILE_TASKS.length+' правильно';}

// ═══ K8S TRAINER ═══
let k8sDone={};
function renderK8s(){k8sDone=lsGet('k8s_prog',{});const L=['A','B','C','D'];document.getElementById('k8s-container').innerHTML=K8S_TASKS.map(t=>{const done=k8sDone[t.id];return '<div class="code-card" id="k8sc-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-k8s">K8s</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(K8S_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-block">'+highlightYAML(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 В чём проблема?</div><div class="code-opts">'+t.opts.map((o,i)=>'<div class="code-opt'+(done!==undefined?' disabled':'')+'" id="k8sopt-'+t.id+'-'+i+'" onclick="pickK8s('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></div>').join('')+'</div><div class="code-fix" id="k8sfix-'+t.id+'">✅ Исправление:\n'+highlightYAML(t.fix)+'</div></div>';}).join('');Object.entries(k8sDone).forEach(([id,chosen])=>applyK8sState(parseInt(id),chosen));updateK8sProg();}
function applyK8sState(id,chosen){const t=K8S_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#k8sc-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('k8sfix-'+id).style.display='block';}
function pickK8s(tid,chosen){if(k8sDone[tid]!==undefined) return;k8sDone[tid]=chosen;lsSet('k8s_prog',k8sDone);applyK8sState(tid,chosen);updateK8sProg();}
function updateK8sProg(){const done=Object.keys(k8sDone).length;const ok=Object.entries(k8sDone).filter(([id,c])=>K8S_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('k8s-pb').style.width=(done/K8S_TASKS.length*100)+'%';document.getElementById('k8s-score-lbl').textContent=ok+' / '+K8S_TASKS.length+' правильно';}

// ═══ PORTS TRAINER ═══
let ptDone={},ptCurrent={};
function renderPorts(){ptDone=lsGet('pt_prog',{});ptCurrent={};renderPortQ();}
function renderPortQ(){const undone=PORTS_TASKS.filter(p=>!ptDone[p.id]);if(!undone.length){document.getElementById('pt-container').innerHTML='<div class="empty-state"><div class="icon">🏆</div><p>Все порты выучены!</p><button class="btn btn-primary" onclick="lsSet(\'pt_prog\',{});renderPorts();">🔄 Начать заново</button></div>';updatePtProg();return;}const q=undone[Math.floor(Math.random()*undone.length)];ptCurrent=q;document.getElementById('pt-container').innerHTML='<div class="card" style="text-align:center;max-width:450px;margin:0 auto"><div style="font-size:11px;color:var(--text3);margin-bottom:8px">Укажите порт</div><div style="font-size:28px;font-weight:800;margin-bottom:4px;color:var(--primary-h)">'+esc(q.service)+'</div><div style="font-size:12px;color:var(--text3);margin-bottom:16px">'+esc(q.proto||'TCP')+'</div><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:14px"><input class="form-input" id="pt-inp" type="number" placeholder="Порт" style="width:120px;text-align:center;font-size:18px;font-family:JetBrains Mono,monospace" onkeydown="if(event.key===\'Enter\')checkPort()"><button class="btn btn-primary" onclick="checkPort()">✓</button></div><div id="pt-feedback" style="display:none;margin-top:10px"></div><div style="margin-top:14px"><button class="btn btn-outline btn-sm" onclick="skipPort()">Пропустить</button></div></div>';setTimeout(()=>document.getElementById('pt-inp')?.focus(),100);updatePtProg();}
function checkPort(){const inp=document.getElementById('pt-inp');const fb=document.getElementById('pt-feedback');const val=parseInt(inp.value);const correct=ptCurrent.port;if(val===correct){ptDone[ptCurrent.id]=1;lsSet('pt_prog',ptDone);fb.style.display='block';fb.innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно! '+correct+'</span>';updatePtProg();setTimeout(renderPortQ,800);}else{fb.style.display='block';fb.innerHTML='<span style="color:var(--red);font-weight:700">❌ '+ptCurrent.service+' → порт <b>'+correct+'</b>, не '+val+'</span>';inp.value='';inp.focus();}}
function skipPort(){const fb=document.getElementById('pt-feedback');fb.style.display='block';fb.innerHTML='<span style="color:var(--yellow)">💡 '+ptCurrent.service+' → порт <b>'+ptCurrent.port+'</b></span>';setTimeout(renderPortQ,1200);}
function updatePtProg(){const done=Object.keys(ptDone).length;document.getElementById('pt-pb').style.width=(done/PORTS_TASKS.length*100)+'%';document.getElementById('pt-score-lbl').textContent=done+' / '+PORTS_TASKS.length+' портов';}

// ═══ GIT TRAINER ═══
let gitDone={};
function renderGit(){gitDone=lsGet('git_prog',{});const L=['A','B','C','D'];document.getElementById('git-container').innerHTML=GIT_TASKS.map(t=>{const done=gitDone[t.id];return '<div class="git-card" id="gt-'+t.id+'"><div class="git-num">Задача #'+t.id+'</div><div class="git-task">'+esc(t.task)+'</div><div class="git-opts">'+t.opts.map((o,i)=>'<div class="git-opt'+(done!==undefined?' disabled':'')+'" id="go-'+t.id+'-'+i+'" onclick="pickGit('+t.id+','+i+')"><span style="font-weight:600;margin-right:8px;color:var(--text3)">'+L[i]+')</span>'+esc(o)+'</div>').join('')+'</div><div class="git-exp" id="gexp-'+t.id+'">💡 '+esc(t.exp)+'</div></div>';}).join('');Object.entries(gitDone).forEach(([id,c])=>applyGitState(parseInt(id),c));updateGitProg();}
function applyGitState(id,chosen){const t=GIT_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#gt-'+id+' .git-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong-pick');});document.getElementById('gexp-'+id).style.display='block';}
function pickGit(tid,chosen){if(gitDone[tid]!==undefined) return;gitDone[tid]=chosen;lsSet('git_prog',gitDone);applyGitState(tid,chosen);updateGitProg();}
function updateGitProg(){const done=Object.keys(gitDone).length;const ok=Object.entries(gitDone).filter(([id,c])=>GIT_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('git-pb').style.width=(done/GIT_TASKS.length*100)+'%';document.getElementById('git-score-lbl').textContent=ok+' / '+GIT_TASKS.length+' правильно';}

// ═══ REGEX TRAINER ═══
let rxDone={};
function renderRegex(){rxDone=lsGet('regex_prog',{});const L=['A','B','C','D'];document.getElementById('rx-container').innerHTML=REGEX_TASKS.map(t=>{const done=rxDone[t.id];return '<div class="rx-card" id="rx-'+t.id+'"><div class="rx-num">Задача #'+t.id+'</div><div class="rx-task">'+esc(t.task)+'</div>'+(t.context?'<div class="rx-ctx">$ '+esc(t.context)+'</div>':'')+'<div class="rx-opts">'+t.opts.map((o,i)=>'<div class="rx-opt'+(done!==undefined?' disabled':'')+'" id="ro-'+t.id+'-'+i+'" onclick="pickRx('+t.id+','+i+')"><span style="font-weight:600;margin-right:8px;color:var(--text3)">'+L[i]+')</span>'+esc(o)+'</div>').join('')+'</div><div class="rx-exp" id="rexp-'+t.id+'">💡 '+esc(t.exp)+'</div></div>';}).join('');Object.entries(rxDone).forEach(([id,c])=>applyRxState(parseInt(id),c));updateRxProg();}
function applyRxState(id,chosen){const t=REGEX_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#rx-'+id+' .rx-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong-pick');});document.getElementById('rexp-'+id).style.display='block';}
function pickRx(tid,chosen){if(rxDone[tid]!==undefined) return;rxDone[tid]=chosen;lsSet('regex_prog',rxDone);applyRxState(tid,chosen);updateRxProg();}
function updateRxProg(){const done=Object.keys(rxDone).length;const ok=Object.entries(rxDone).filter(([id,c])=>REGEX_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('rx-pb').style.width=(done/REGEX_TASKS.length*100)+'%';document.getElementById('rx-score-lbl').textContent=ok+' / '+REGEX_TASKS.length+' правильно';}

// ═══ TIPS ═══
function renderTips(){document.getElementById('tips-container').innerHTML=TIPS.map((t,i)=>'<div class="tip-card"><div class="tip-header" onclick="toggleTip('+i+')"><span>💡 '+esc(t.title)+'</span><span id="ta-'+i+'">▼</span></div><div class="tip-body" id="tb-'+i+'">'+esc(t.body)+'</div></div>').join('');}
function toggleTip(i){const b=document.getElementById('tb-'+i);const a=document.getElementById('ta-'+i);b.classList.toggle('open');a.textContent=b.classList.contains('open')?'▲':'▼';}


// ═══ CUSTOM Q ═══
function openCustomModal(){
  document.getElementById('custom-modal').classList.add('open');
  // Заполняем список тем динамически
  const sel = document.getElementById('cq-topic');
  sel.innerHTML = getAllTopics().map(t => '<option>'+esc(t)+'</option>').join('');
}
function closeCustomModal(){document.getElementById('custom-modal').classList.remove('open');}
function saveCustomQ(){
  const q=document.getElementById('cq-q').value.trim();
  const a=document.getElementById('cq-a').value.trim();
  const b=document.getElementById('cq-b').value.trim();
  if(!q||!a||!b){alert('Заполните вопрос и хотя бы два варианта (A и B)');return;}
  const c=document.getElementById('cq-c').value.trim();
  const d=document.getElementById('cq-d').value.trim();
  const ansIdx=parseInt(document.getElementById('cq-ans').value)||0;
  // Валидация: правильный ответ должен указывать на непустой вариант
  const opts=[a,b,c,d].filter(Boolean);
  if(ansIdx >= opts.length){alert('Правильный ответ ('+ansIdx+') указывает на несуществующий вариант. Вариантов: '+opts.length);return;}
  const customs=getCustomQ();
  // Используем max(id)+1 вместо фиксированного 10000
  const maxId = customs.reduce((max, q) => Math.max(max, q.id||0), 0);
  const newId = Math.max(maxId + 1, 10001);
  customs.push({
    id: newId,
    topic: document.getElementById('cq-topic').value,
    level: document.getElementById('cq-level').value,
    q, options: opts,
    answer: ansIdx,
    explanation: document.getElementById('cq-exp').value.trim(),
    category: document.getElementById('cq-category').value
  });
  lsSet('custom',customs);
  closeCustomModal();
  renderQuestions();
  // Очищаем форму
  ['cq-q','cq-a','cq-b','cq-c','cq-d','cq-exp'].forEach(id => document.getElementById(id).value='');
  document.getElementById('cq-ans').value='0';
}
document.getElementById('custom-modal').addEventListener('click',function(e){if(e.target===this)closeCustomModal();});

// ═══ CHEAT SHEETS ═══
const CHEAT_SHEETS = {
  linux:{title:"Linux",icon:"🐧",content:'<table style="width:100%;border-collapse:collapse"><tr style="color:var(--primary-h);font-weight:700"><td style="padding:4px 8px">Команда</td><td style="padding:4px 8px">Что делает</td></tr><tr><td style="padding:4px 8px;font-family:monospace">ss -tlnp</td><td style="padding:4px 8px">Все TCP сокеты LISTEN + процессы</td></tr><tr><td style="padding:4px 8px;font-family:monospace">lsof -i :443</td><td style="padding:4px 8px">Процесс на порту 443</td></tr><tr><td style="padding:4px 8px;font-family:monospace">df -h / -i</td><td style="padding:4px 8px">Место на дисках / inode</td></tr><tr><td style="padding:4px 8px;font-family:monospace">du -sh /* | sort -rh</td><td style="padding:4px 8px">Что занимает место</td></tr><tr><td style="padding:4px 8px;font-family:monospace">free -m</td><td style="padding:4px 8px">RAM</td></tr><tr><td style="padding:4px 8px;font-family:monospace">journalctl -u svc -n 50</td><td style="padding:4px 8px">Логи systemd-сервиса</td></tr><tr><td style="padding:4px 8px;font-family:monospace">dmesg | grep -i oom</td><td style="padding:4px 8px">Лог OOM killer</td></tr><tr><td style="padding:4px 8px;font-family:monospace">find / -mmin -30</td><td style="padding:4px 8px">Файлы за 30 мин</td></tr><tr><td style="padding:4px 8px;font-family:monospace">chmod 755 file</td><td style="padding:4px 8px">rwxr-xr-x</td></tr><tr><td style="padding:4px 8px;font-family:monospace">kill -9/-15 PID</td><td style="padding:4px 8px">SIGKILL/SIGTERM</td></tr></table>'},
  docker:{title:"Docker",icon:"🐳",content:'<table style="width:100%;border-collapse:collapse"><tr style="color:var(--primary-h);font-weight:700"><td style="padding:4px 8px">Команда</td><td style="padding:4px 8px">Что делает</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker ps -a</td><td style="padding:4px 8px">Все контейнеры</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker build -t name .</td><td style="padding:4px 8px">Собрать образ</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker run -d -p 80:80 name</td><td style="padding:4px 8px">Запустить с пробросом порта</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker logs -f --tail 50 cid</td><td style="padding:4px 8px">Логи контейнера</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker exec -it cid sh</td><td style="padding:4px 8px">Зайти в контейнер</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker-compose up -d</td><td style="padding:4px 8px">Поднять сервисы</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker stats</td><td style="padding:4px 8px">Мониторинг</td></tr><tr><td style="padding:4px 8px;font-family:monospace">docker system prune -a</td><td style="padding:4px 8px">Очистить всё</td></tr></table>'},
  git:{title:"Git",icon:"🔀",content:'<table style="width:100%;border-collapse:collapse"><tr style="color:var(--primary-h);font-weight:700"><td style="padding:4px 8px">Команда</td><td style="padding:4px 8px">Что делает</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git rebase main</td><td style="padding:4px 8px">Перебазировать на main</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git rebase -i HEAD~4</td><td style="padding:4px 8px">Интерактивный rebase</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git cherry-pick A..B</td><td style="padding:4px 8px">Диапазон коммитов</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git bisect start/good/bad</td><td style="padding:4px 8px">Бинарный поиск бага</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git stash / stash pop</td><td style="padding:4px 8px">Спрятать изменения</td></tr><tr><td style="padding:4px 8px;font-family:monospace">git reset --soft HEAD~1</td><td style="padding:4px 8px">Отменить коммит</td></tr></table>'},
  ports:{title:"Порты",icon:"🔌",content:'<table style="width:100%;border-collapse:collapse"><tr style="color:var(--primary-h);font-weight:700"><td style="padding:4px 8px">Порт</td><td style="padding:4px 8px">Сервис</td></tr>'+PORTS_TASKS.map(p=>'<tr><td style="padding:4px 8px;font-family:monospace;font-weight:700">'+p.port+'</td><td style="padding:4px 8px">'+p.service+'</td></tr>').join('')+'</table>'}
};
let cheatTab='linux';
function openCheatSheet(){
  const tabs=Object.keys(CHEAT_SHEETS);
  document.getElementById('cheat-tabs').innerHTML=tabs.map(k=>'<span class="chip'+(k===cheatTab?' active':'')+'" onclick="cheatTab=\''+k+'\';openCheatSheet()">'+CHEAT_SHEETS[k].icon+' '+CHEAT_SHEETS[k].title+'</span>').join('');
  document.getElementById('cheat-content').innerHTML=CHEAT_SHEETS[cheatTab].content;
  document.getElementById('cheatsheet-modal').classList.add('open');
}
function closeCheatSheet(){document.getElementById('cheatsheet-modal').classList.remove('open');}
document.getElementById('cheatsheet-modal').addEventListener('click',function(e){if(e.target===this)closeCheatSheet();});

// ═══ BLITZ MODE (с data-атрибутами вместо regex) ═══
let blitzState={questions:[],idx:0,score:0,timeLeft:300,timer:null,active:false};
function startBlitz(){
  const allQ=getAllQ();if(allQ.length<20){alert('Нужно минимум 20 вопросов');return;}
  blitzState.questions=shuffle(allQ).slice(0,20);blitzState.idx=0;blitzState.score=0;blitzState.timeLeft=300;blitzState.active=true;
  nav('exam');
  document.getElementById('exam-controls').style.display='none';
  document.getElementById('progress-info').style.display='none';
  document.getElementById('seg-bar').style.display='none';
  renderBlitzQ();blitzState.timer=setInterval(blitzTick,1000);
}
function blitzTick(){blitzState.timeLeft--;const tEl=document.getElementById('blitz-timer');if(tEl){tEl.textContent=Math.floor(blitzState.timeLeft/60)+':'+('0'+(blitzState.timeLeft%60)).slice(-2);if(blitzState.timeLeft<=30)tEl.style.color='var(--red)';}if(blitzState.timeLeft<=0)endBlitz();}
function renderBlitzQ(){
  if(blitzState.idx>=blitzState.questions.length){endBlitz();return;}
  const q=blitzState.questions[blitzState.idx];const L=['A','B','C','D'];const opts=q.options||[];
  const order=[...Array(opts.length).keys()];for(let i=order.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[order[i],order[j]]=[order[j],order[i]];}
  questionStartTime[q.id]=Date.now();
  document.getElementById('questions-container').innerHTML=
    '<div style="background:var(--bg2);border:2px solid var(--primary);border-radius:14px;padding:24px;max-width:700px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'+
    '<div style="display:flex;gap:6px">'+ttag(q.topic)+ltag(q.level)+'</div>'+
    '<div style="font-size:18px;font-weight:800" id="blitz-timer">'+Math.floor(blitzState.timeLeft/60)+':'+('0'+(blitzState.timeLeft%60)).slice(-2)+'</div>'+
    '<div style="font-size:13px;color:var(--text2)">Вопрос '+(blitzState.idx+1)+'/20</div></div>'+
    '<div class="q-text" style="font-size:16px;margin-bottom:20px">'+esc(q.q)+'</div>'+
    '<div class="q-options">'+
    order.map((origIdx,visPos)=>'<div class="q-opt" id="blitz-opt-'+visPos+'" data-orig-idx="'+origIdx+'" data-answer="'+q.answer+'" onclick="blitzPick('+q.id+','+origIdx+','+q.answer+')"><span class="opt-letter">'+L[visPos]+'</span><span>'+esc(opts[origIdx])+'</span></div>').join('')+
    '</div>'+
    '<div id="blitz-exp-'+q.id+'" style="display:none" class="q-explanation"></div>'+
    '<div style="text-align:center;margin-top:14px;display:none" id="blitz-next-btn"><button class="btn btn-primary" onclick="blitzNext()">Следующий →</button></div></div>';
  document.getElementById('single-controls').style.display='none';
}
function blitzPick(qid,chosen,correct){
  if(!blitzState.active) return;
  blitzState.active=false;
  const q=blitzState.questions[blitzState.idx];const ok=chosen===correct;
  if(ok) blitzState.score++;
  // Раскрашиваем опции через data-атрибуты (без regex-парсинга onclick!)
  document.querySelectorAll('#questions-container .q-opt').forEach(el=>{
    el.classList.add('disabled');
    const origIdx=parseInt(el.getAttribute('data-orig-idx'));
    const ans=parseInt(el.getAttribute('data-answer'));
    if(origIdx===ans) el.classList.add('correct-opt');
    else if(origIdx===chosen) el.classList.add('wrong-opt');
  });
  if(q&&q.explanation){const exp=document.getElementById('blitz-exp-'+qid);if(exp){exp.innerHTML='💡 '+esc(q.explanation);exp.style.display='block';}}
  document.getElementById('blitz-next-btn').style.display='block';
  // Статистика
  const qprog=getQProg();if(!qprog[qid])qprog[qid]={correct:0,wrong:0,times:[]};if(!qprog[qid].times)qprog[qid].times=[];
  qprog[qid][ok?'correct':'wrong']++;qprog[qid].lastSeen=Date.now();
  const respTime=questionStartTime[qid]?Math.round((Date.now()-questionStartTime[qid])/1000):0;
  qprog[qid].times.push(respTime);
  // SRS update
  if(!qprog[qid].ease) qprog[qid].ease=2.5;if(!qprog[qid].interval) qprog[qid].interval=0;if(!qprog[qid].repetitions) qprog[qid].repetitions=0;
  if(ok){qprog[qid].repetitions++;qprog[qid].interval=qprog[qid].interval===0?1:qprog[qid].interval===1?3:Math.round(qprog[qid].interval*qprog[qid].ease);qprog[qid].ease=Math.min(3,qprog[qid].ease+0.1);}
  else{qprog[qid].repetitions=0;qprog[qid].interval=1;qprog[qid].ease=Math.max(1.3,qprog[qid].ease-0.2);}
  qprog[qid].nextReviewAt=Date.now()+qprog[qid].interval*86400000;
  lsSet('qprog',qprog);
  const stats=lsGet('stats',{total:0,correct:0});stats.total++;if(ok)stats.correct++;lsSet('stats',stats);
}
function blitzNext(){blitzState.idx++;blitzState.active=true;if(blitzState.idx>=blitzState.questions.length){endBlitz();return;}renderBlitzQ();}
function endBlitz(){
  clearInterval(blitzState.timer);blitzState.active=false;
  document.getElementById('exam-controls').style.display='';
  document.getElementById('progress-info').style.display='';
  document.getElementById('seg-bar').style.display='';
  const s=blitzState.score,total=blitzState.questions.length;
  const grade=s>=18?'🏆 Отлично!':s>=14?'👍 Хорошо':s>=10?'📚 Удовлетворительно':'💪 Нужно подтянуть';
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:40px 20px"><div style="font-size:60px;margin-bottom:10px">'+(s>=18?'🏆':s>=14?'🎯':s>=10?'📚':'💪')+'</div><div style="font-size:28px;font-weight:800;margin-bottom:8px">Блиц завершён!</div><div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:12px">'+s+' / '+total+'</div><div style="font-size:16px;color:var(--text2);margin-bottom:20px">'+grade+'</div><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" onclick="startBlitz()">🔄 Ещё блиц</button><button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
  document.getElementById('single-controls').style.display='none';
}

// ═══ EXPORT / IMPORT (с APP_VERSION) ═══
function exportProgress(){
  const data={
    version: APP_VERSION, exportDate: new Date().toISOString(),
    mistakes:lsGet('mistakes',{}),stats:lsGet('stats',{}),history:lsGet('history',[]),
    qprog:lsGet('qprog',{}),streak_best:lsGet('streak_best',0),custom:lsGet('custom',[]),
    ts_scores:lsGet('ts_scores',{}),cmd_prog:lsGet('cmd_prog',{}),code_prog:lsGet('code_prog',{}),
    subnet_prog:lsGet('subnet_prog',{}),git_prog:lsGet('git_prog',{}),regex_prog:lsGet('regex_prog',{}),
    ans_prog:lsGet('ans_prog',{}),df_prog:lsGet('df_prog',{}),k8s_prog:lsGet('k8s_prog',{}),pt_prog:lsGet('pt_prog',{}),labs_prog:lsGet('labs_prog',{}),
    daily:lsGet('daily',{})
  };
  const text=JSON.stringify(data,null,2);
  // Файл
  const blob=new Blob([text],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ipmax_'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);
  // Буфер обмена
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(()=>{}).catch(()=>{});}
  else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
  alert('✅ Прогресс скопирован в буфер обмена и сохранён в файл!');
}
function importProgress(inp){
  const file=inp.files[0];if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{try{importProgressData(JSON.parse(e.target.result));}catch(err){alert('Ошибка: '+err.message);}};
  reader.readAsText(file);inp.value='';
}
function pasteProgressFromClipboard(){
  if(!navigator.clipboard||!navigator.clipboard.readText){const text=prompt('Вставьте JSON прогресса:');if(text){try{importProgressData(JSON.parse(text));}catch(e){alert('Ошибка JSON: '+e.message);}}return;}
  navigator.clipboard.readText().then(text=>{importProgressData(JSON.parse(text));}).catch(()=>{const text=prompt('Не удалось прочитать буфер. Вставьте JSON:');if(text){try{importProgressData(JSON.parse(text));}catch(e){alert('Ошибка JSON: '+e.message);}}});
}
function importProgressData(data){
  if(!data.version){alert('⚠️ Старый формат (без версии). Импортирую что есть...');}
  // Миграции для старых версий
  if(!data.ans_prog) data.ans_prog={};
  if(!data.df_prog) data.df_prog={};
  if(!data.k8s_prog) data.k8s_prog={};
  if(!data.pt_prog) data.pt_prog={};
  if(data.mistakes) lsSet('mistakes',data.mistakes);
  if(data.stats) lsSet('stats',data.stats);
  if(data.history) lsSet('history',data.history);
  if(data.qprog) lsSet('qprog',data.qprog);
  if(data.streak_best!==undefined) lsSet('streak_best',data.streak_best);
  if(data.custom) lsSet('custom',data.custom);
  if(data.ts_scores) lsSet('ts_scores',data.ts_scores);
  if(data.cmd_prog) lsSet('cmd_prog',data.cmd_prog);
  if(data.code_prog) lsSet('code_prog',data.code_prog);
  if(data.subnet_prog) lsSet('subnet_prog',data.subnet_prog);
  if(data.git_prog) lsSet('git_prog',data.git_prog);
  if(data.regex_prog) lsSet('regex_prog',data.regex_prog);
  if(data.ans_prog) lsSet('ans_prog',data.ans_prog);
  if(data.df_prog) lsSet('df_prog',data.df_prog);
  if(data.k8s_prog) lsSet('k8s_prog',data.k8s_prog);
  if(data.pt_prog) lsSet('pt_prog',data.pt_prog);
  if(data.labs_prog) lsSet('labs_prog',data.labs_prog);
  if(data.daily) lsSet('daily',data.daily);
  streak=lsGet('streak_best',0);
  alert('✅ Прогресс импортирован v'+(data.version||'?')+'!');
  nav('home');
}

// ═══ INIT ═══
async function initApp(){
  await loadAllData();

  // Обновляем счётчик вопросов динамически
  document.getElementById('sb-counter').textContent = 'DevOps Edition · '+getAllQ().length+' вопросов';

  // Строим UI с динамическими темами
  buildTopicFilters();

  // Тема
  const t=lsGet('theme','dark');if(t==='light'){
    document.documentElement.setAttribute('data-theme','light');
    document.getElementById('theme-icon').textContent='🌙';
    document.getElementById('theme-label').textContent='Тёмная тема';
  }

  // Скрываем загрузчик и обновляем заголовок
  document.getElementById('app-loading').style.display='none';
  document.getElementById('page-title').textContent = 'Главная';

  // Рендерим
  renderHome();
  renderQuestions();

  // Блиц-кнопка
  setTimeout(()=>{
    const qa=document.querySelector('.quick-actions');
    if(qa){const btn=document.createElement('button');btn.className='btn btn-outline';btn.style.cssText='background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)';btn.textContent='⚡ Блиц (5 мин)';btn.onclick=startBlitz;qa.appendChild(btn);
      const mockBtn=document.createElement('button');mockBtn.className='btn btn-outline';
      mockBtn.style.cssText='background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)';
      mockBtn.textContent='🎤 Mock Interview (30 мин)';mockBtn.onclick=startMockInterview;qa.appendChild(mockBtn);}
  },200);
}

function buildTopicFilters(){
  const topics = getAllTopics();
  const topicChips = document.getElementById('topic-chips');
  if(topicChips){
    topicChips.innerHTML='<span class="chip active" data-topic="all">Все</span>';
    topics.forEach(t=>{const chip=document.createElement('span');chip.className='chip';chip.textContent=t;chip.setAttribute('data-topic',t);chip.onclick=function(){setTopic(t,this);};topicChips.appendChild(chip);});
  }
  const allChip=document.querySelector('#mode-chips .chip:first-child');
  if(allChip) allChip.textContent='Все '+getAllQ().length;
}

// ═══ HOTKEYS ═══
document.addEventListener('keydown',function(e){
  if(e.key==='?'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();document.getElementById('cheatsheet-modal').classList.contains('open')?closeCheatSheet():openCheatSheet();return;}
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const page=document.querySelector('.page.active');if(!page) return;
  if(page.id==='page-exam'){
    if(['1','2','3','4'].includes(e.key)){const idx=parseInt(e.key)-1;const q=activeQuestions[currentView==='single'?singleIdx:0];if(q){const opt=document.getElementById('opt-'+q.id+'-'+idx);if(opt&&!opt.classList.contains('disabled')) opt.click();}}
    if(e.key==='ArrowRight'&&currentView==='single') singleNext();
    if(e.key==='ArrowLeft'&&currentView==='single') singlePrev();
    if(e.key===' '&&currentView==='flashcard'){e.preventDefault();const fc=document.querySelector('.flashcard');if(fc) fc.click();}
  }
});

// ═══ OFFLINE READINESS CHECK ═══
async function checkOfflineReady(){
  const files=['./','./index.html','./styles.css','./app.js','./interview-prep-max.webmanifest'];
  const tasks=['base_questions','subnet','ts','cmd','code','git','regex','ansible_pb','dockerfile','k8s','ports','labs','tips'];
  tasks.forEach(t=>files.push('./tasks/'+t+'.json'));
  let ok=0,fail=0;const results=[];
  for(const f of files){
    try{
      const r=await fetch(f,{cache:'only-if-cached',mode:'same-origin'});
      if(r.ok){ok++;results.push('✅ '+f);}
      else{fail++;results.push('⚠️ '+f);}
    }catch(e){fail++;results.push('❌ '+f);}
  }
  alert('📶 Оффлайн: '+Math.round(ok/files.length*100)+'% ('+ok+'/'+files.length+')\n\n'+results.slice(0,10).join('\n')+'\n...\n'+(ok===files.length?'🎉 Полный оффлайн!':'💡 Откройте разделы при интернете.'));
}

// ═══ PWA ═══
if ('serviceWorker' in navigator) {
  // Сначала удаляем все старые Service Workers (миграция с v8)
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  }).then(() => {
    navigator.serviceWorker.register('./sw.js').then(reg => console.log('SW v9:', reg.scope)).catch(err => console.log('SW error:', err));
  });
}

// Запуск
initApp();
