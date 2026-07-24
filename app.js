/**
 * Interview Prep Max — Application Logic
 */
const APP_VERSION = self.IPMAX_VERSION || 'dev';
if (typeof IPMaxDate === 'undefined') throw new Error('IPMaxDate is required');

// ═══ DATA LOADING ═══
var BASE_QUESTIONS = [], SUBNET_PROBLEMS = [], TS_SCENARIOS = [], CMD_TASKS = [],
    CODE_TASKS = [], GIT_TASKS = [], REGEX_TASKS = [], ANSIBLE_PB_TASKS = [],
    DOCKERFILE_TASKS = [], K8S_TASKS = [], PORTS_TASKS = [], LABS_TASKS = [], TIPS = [],
    INCIDENTS = [],
    STUDY_MAP = null, STUDY_TESTS = null, SENIOR_CASES = [], BEST_PRACTICES = null;

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
  tips: 'tasks/tips.json',
  incidents: 'tasks/incidents.json',
  study_map: 'tasks/study_map.json',
  study_tests: 'tasks/study_tests.json',
  senior_cases: 'tasks/senior_cases.json',
  best_practices: 'tasks/best_practices.json'
};

const DATA_VARS = {
  base_questions: 'BASE_QUESTIONS', subnet: 'SUBNET_PROBLEMS', ts: 'TS_SCENARIOS',
  cmd: 'CMD_TASKS', code: 'CODE_TASKS', git: 'GIT_TASKS', regex: 'REGEX_TASKS',
  ansible_pb: 'ANSIBLE_PB_TASKS', dockerfile: 'DOCKERFILE_TASKS', k8s: 'K8S_TASKS',
  ports: 'PORTS_TASKS', labs: 'LABS_TASKS', tips: 'TIPS', incidents: 'INCIDENTS', study_map: 'STUDY_MAP',
  study_tests: 'STUDY_TESTS', senior_cases: 'SENIOR_CASES', best_practices: 'BEST_PRACTICES'
};

function dataSize(data){
  if(Array.isArray(data)) return data.length;
  if(data&&Array.isArray(data.weeks)) return data.weeks.length+' недель';
  if(data&&Array.isArray(data.miniTests)) return data.miniTests.length+' мини-тестов';
  if(data&&Array.isArray(data.cases)) return data.cases.length+' кейсов';
  if(data&&Array.isArray(data.topics)) return data.topics.length+' тем';
  return 'object';
}

function renderLoadFailure(errors, loadedCount, totalCount) {
  const box = document.getElementById('app-loading');
  const pct = totalCount ? Math.round(loadedCount / totalCount * 100) : 0;
  box.innerHTML =
    '<div style="font-size:48px;margin-bottom:16px">⚠️</div>'+
    '<div style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--red)">Не удалось загрузить данные</div>'+
    '<div style="font-size:12px;color:var(--text2);max-width:520px;margin:0 auto;line-height:1.7">'+
    '<div>APP_VERSION: <b>'+APP_VERSION+'</b> · пакеты: <b>'+loadedCount+'/'+totalCount+'</b> · '+pct+'%</div>'+
    '<div style="margin-top:8px;text-align:left;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px">'+
    errors.map(e => '<div>• '+esc(e)+'</div>').join('')+
    '</div>'+
    '<div style="margin-top:8px">Если проблема повторяется, очистите кэш сайта или проверьте доступность JSON-файлов.</div>'+
    '</div>'+
    '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="location.reload()">🔄 Повторить загрузку</button>'+
    '<button class="btn btn-outline" onclick="checkOfflineReady()">📶 Проверить оффлайн</button>'+
    '</div>';
}

async function loadAllData() {
  const status = document.getElementById('load-status');
  const totalCount = Object.keys(DATA_FILES).length;
  const errors = [];
  let loadedCount = 0;
  let lastProgressAt = Date.now();
  const watchdog = setInterval(() => {
    const elapsed = Math.round((Date.now() - lastProgressAt) / 1000);
    if (elapsed >= 8 && status) {
      status.textContent = `Загрузка данных... ${loadedCount}/${totalCount}. Нет ответа ${elapsed}с. APP_VERSION ${APP_VERSION}`;
    }
  }, 1000);
  const promises = Object.entries(DATA_FILES).map(async ([key, url]) => {
    try {
      const resp = await fetch(url, {cache:'no-cache'});
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      window[DATA_VARS[key]] = data;
      loadedCount++;
      lastProgressAt = Date.now();
      status.textContent = `Загружено: ${key} (${dataSize(data)}) · ${loadedCount}/${totalCount}`;
    } catch (e) {
      console.error(`Failed to load ${url}:`, e);
      errors.push(`${key}: ${url} — ${e.message}`);
      status.textContent = `Ошибка загрузки ${key} · ${loadedCount}/${totalCount}`;
    }
  });
  await Promise.all(promises);
  clearInterval(watchdog);
  if (errors.length > 0) {
    renderLoadFailure(errors, loadedCount, totalCount);
    throw new Error('Data loading failed: '+errors.join(', '));
  }
  status.textContent = `Инициализация... APP_VERSION ${APP_VERSION}`;
}

// ═══ STORAGE ═══
const LS=typeof IPMaxStorage!=='undefined'?IPMaxStorage.DEFAULT_KEYS:{};
const appStorage=typeof IPMaxStorage!=='undefined'?IPMaxStorage.create(localStorage):null;
function lsGet(k,def){return appStorage?appStorage.get(k,def):def;}
function lsSet(k,v){return appStorage?appStorage.set(k,v):false;}
function getCustomQ(){return lsGet('custom',[]);}
function getAllQ(){return [...BASE_QUESTIONS,...getCustomQ()];}
function getMistakes(){return lsGet('mistakes',{});}
function getQProg(){return lsGet('qprog',{});}
function getSkillEvents(){
  const events=lsGet('skill_events',[]);
  return Array.isArray(events)&&typeof ProgressTracker!=='undefined'?events.filter(ProgressTracker.isSkillEvent):[];
}
function recordSkillEvent(input){
  if(typeof ProgressTracker==='undefined') return;
  lsSet('skill_events',ProgressTracker.appendSkillEvent(getSkillEvents(),input));
}
function recordQuestionResult(question,input){
  if(!question||typeof ProgressTracker==='undefined') return null;
  const now=Number.isFinite(input?.now)?input.now:Date.now();
  const result=ProgressTracker.recordQuestionAttempt(getQProg(),question.id,{outcome:input?.outcome,source:input?.source,now,responseSeconds:input?.responseSeconds});
  lsSet('qprog',result.progress);
  if(input?.syncMistakes){
    const mistakes=getMistakes();
    if(result.outcome==='pass') delete mistakes[question.id];else mistakes[question.id]=1;
    lsSet('mistakes',mistakes);
  }
  const stats=lsGet('stats',{total:0,correct:0});
  stats.total=(Number.isFinite(stats.total)?stats.total:0)+1;
  stats.correct=(Number.isFinite(stats.correct)?stats.correct:0)+result.score;
  lsSet('stats',stats);
  if(input?.history){
    const hist=lsGet('history',[]);hist.unshift({date:new Date(now).toLocaleString('ru'),topic:question.topic,correct:result.score>=0.5});if(hist.length>20)hist.pop();lsSet('history',hist);
  }
  if(input?.daily!==false){const today=IPMaxDate.localDateKey(now);const daily=lsGet('daily',{});daily[today]=(daily[today]||0)+1;lsSet('daily',daily);}
  recordSkillEvent({source:input?.source||'exam',topic:question.topic,skill:question.topic,score:result.score,possible:1,durationSeconds:input?.responseSeconds,at:now});
  recordCoachControlAttempt(question,result,input,now);
  return result;
}
function recordTrainerResult(source,topic,correct,skill){recordSkillEvent({source,topic,skill:skill||topic,score:correct?1:0,possible:1});}
const ONBOARDING_ROLES=['DevOps','SRE','Platform','Cloud'];
const ONBOARDING_LEVELS=['Junior','Middle','Senior'];
function isValidOnboardingDate(date){
  if(date==='') return true;
  return IPMaxDate.isValidDateKey(date);
}
function normalizeOnboardingProfile(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!ONBOARDING_ROLES.includes(value.role)||!ONBOARDING_LEVELS.includes(value.level)) return null;
  const date=value.date===undefined?'':value.date;
  if(!isValidOnboardingDate(date)) return null;
  return {role:value.role,level:value.level,date,completedAt:typeof value.completedAt==='string'?value.completedAt:''};
}
function getOnboardingProfile(){
  const stored=normalizeOnboardingProfile(lsGet('onboarding',null));
  if(stored) return stored;
  try{
    const legacy=normalizeOnboardingProfile(JSON.parse(localStorage.getItem('undefined')||'null'));
    if(legacy){
      lsSet('onboarding',legacy);
      lsSet('onboarding_complete',true);
      localStorage.removeItem('undefined');
      return legacy;
    }
  }catch(e){console.warn('onboarding migration error:',e);}
  return null;
}
function getCoachPlan(){
  const profile=getOnboardingProfile();
  if(!profile||typeof InterviewCoach==='undefined'||typeof InterviewCoach.buildPlan!=='function') return null;
  return InterviewCoach.buildPlan({questions:getAllQ(),progress:getQProg(),skillEvents:getSkillEvents(),profile,now:Date.now()});
}
function getCoachJournal(){
  const notes=lsGet('coach_journal',[]);
  return Array.isArray(notes)&&typeof InterviewCoach!=='undefined'?notes.filter(InterviewCoach.isJournalEntry):[];
}
function getCoachControlSession(){
  if(typeof IPMaxAICoach==='undefined'||typeof IPMaxAICoach.normaliseControlSession!=='function') return null;
  return IPMaxAICoach.normaliseControlSession(lsGet('coach_control',null));
}
function recordCoachControlAttempt(question,result,input,now){
  if(input?.source!=='exam'||!Array.isArray(coachQuestionIds)||!coachQuestionIds.map(String).includes(String(question.id))) return;
  const session=getCoachControlSession();
  if(!session||session.attempts.some(attempt=>attempt.questionId===String(question.id))) return;
  session.attempts.push({questionId:String(question.id),topic:question.topic,score:result.score,responseSeconds:input?.responseSeconds||0,at:now});
  if(session.attempts.length>=session.questionIds.length) session.completedAt=now;
  lsSet('coach_control',session);
}
function requestCoachAIReview(){
  if(typeof IPMaxAICoach==='undefined') return Promise.reject(new Error('Модуль AI-разбора не загружен.'));
  const payload=IPMaxAICoach.buildReviewPayload({plan:getCoachPlan(),profile:getOnboardingProfile(),session:getCoachControlSession()});
  return IPMaxAICoach.review(payload,{url:'./api/ai/review',timeoutMs:15000});
}
function setCoachProfile(profile){
  if(!appStorage||typeof appStorage.setMany!=='function') return false;
  return appStorage.setMany({onboarding:profile,onboarding_complete:true}).ok;
}
function configureCoachUI(){
  if(typeof InterviewCoachUI==='undefined'||typeof InterviewCoach==='undefined') return false;
  InterviewCoachUI.configure({
    coach:InterviewCoach,escape:esc,getPlan:getCoachPlan,getProfile:getOnboardingProfile,
    normaliseProfile:normalizeOnboardingProfile,setProfile:setCoachProfile,
    getJournal:getCoachJournal,setJournal:notes=>lsSet('coach_journal',notes),getTopics:getAllTopics,
    getControlSession:getCoachControlSession,requestAiReview:requestCoachAIReview,
    openModal:openAccessibleModal,closeModal:closeAccessibleModal,refresh:renderHome,
    startFocus:startCoachFocus,startReview:startCoachReviewMode,startControl:startCoachControlMode,
    now:()=>Date.now(),alert:message=>alert(message),confirm:message=>confirm(message)
  });
  return true;
}

// Динамический список тем (из данных, а не захардкожен)
function getAllTopics(){const topics=new Set();getAllQ().forEach(q=>topics.add(q.topic));return [...topics].sort();}

// ═══ STATE ═══
let currentMode='all',currentView='standard',currentTopic='all',currentLevel='all',currentCategory='all';
let timerSecs=0,timerInterval=null,timerDeadline=0;
let activeQuestions=[],singleIdx=0;
let streak=0;
let questionStartTime={};
let cmdMuscleActive=false;
let interviewMode=false;
let cameFromStudy=false;
let updateReloadPending=false;
let coachSessionLimit=0;
let coachQuestionIds=null;
let currentPracticeTopic='';
const QUESTION_BATCH_SIZE=60;
let questionRenderLimit=QUESTION_BATCH_SIZE;

// ═══ NAV ═══
const PAGE_TITLES={home:'Главная',study:'Учёба',practices:'Best Practices',exam:'Экзамен',analytics:'Аналитика',
  subnet:'Тренажёр подсетей',ts:'Troubleshooting-симулятор',
  cmd:'Command Builder',code:'Code Reviewer',
  ansible:'Ansible Playbook',dockerfile:'Dockerfile',k8s:'K8s YAML',ports:'Порты TCP',labs:'Debugging',
  git:'Git-тренажёр',regex:'Regex-тренажёр',tips:'Советы'};
function nav(page){
  stopActiveSessions();
  if(page!=='exam') coachQuestionIds=null;
  if(page!=='exam'&&page!=='study'){cameFromStudy=false;interviewMode=false;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>{i.classList.remove('active');i.removeAttribute('aria-current');});
  const pg=document.getElementById('page-'+page);
  const sb=document.querySelector('[data-page="'+page+'"]');
  if(pg) pg.classList.add('active');
  if(sb){sb.classList.add('active');sb.setAttribute('aria-current','page');}
  document.getElementById('page-title').textContent=PAGE_TITLES[page]||page;
  closeSidebar();
  if(page==='home') renderHome();
  if(page==='study'){cameFromStudy=false;interviewMode=false;renderStudy();}
  if(page==='practices') renderBestPractices();
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
  if(page==='exam'){resetQuestionRenderLimit();restoreExamControls();renderQuestions();}
  if(page==='git') renderGit();
  if(page==='regex') renderRegex();
}
function resetCoachSelection(){coachSessionLimit=0;coachQuestionIds=null;}
function startMode(m){resetCoachSelection();currentMode=m;document.querySelectorAll('#mode-chips .chip').forEach(c=>c.classList.remove('active'));nav('exam');}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('open');}
document.getElementById('sidebar-overlay').onclick=closeSidebar;

function stopActiveSessions(){
  if(blitzState.timer){clearInterval(blitzState.timer);blitzState.timer=null;}
  blitzState.active=false;blitzState.deadline=0;
  if(mockState.timer){clearInterval(mockState.timer);mockState.timer=null;}
  mockState.active=false;mockState.deadline=0;mockState.questionDeadline=0;
  if(cmdMuscleActive){cmdMuscleActive=false;renderCmd();}
}

function restoreExamControls(){
  ['exam-controls','progress-info','seg-bar'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display='';
  });
  const singleControls=document.getElementById('single-controls');
  if(singleControls) singleControls.style.display=currentView==='single'?'':'none';
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
function secondsUntil(deadline){return deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):0;}

const MODAL_FOCUSABLE='button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
let activeModalOverlay=null,modalReturnFocus=null;
function getModalFocusable(overlay){
  return [...overlay.querySelectorAll(MODAL_FOCUSABLE)].filter(el=>el.getClientRects().length>0&&el.getAttribute('aria-hidden')!=='true');
}
function openAccessibleModal(id,initialFocusSelector){
  const overlay=document.getElementById(id);if(!overlay) return;
  const alreadyOpen=overlay.classList.contains('open');
  if(activeModalOverlay&&activeModalOverlay!==overlay) closeAccessibleModal(activeModalOverlay.id,false);
  if(!alreadyOpen) modalReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');activeModalOverlay=overlay;
  if(!alreadyOpen){
    requestAnimationFrame(()=>{
      const target=(initialFocusSelector&&overlay.querySelector(initialFocusSelector))||getModalFocusable(overlay)[0]||overlay.querySelector('[role="dialog"]');
      target?.focus();
    });
  }
}
function closeAccessibleModal(id,restoreFocus=true){
  const overlay=document.getElementById(id);if(!overlay) return;
  overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
  if(activeModalOverlay!==overlay) return;
  const returnFocus=modalReturnFocus;
  activeModalOverlay=null;modalReturnFocus=null;document.body.classList.remove('modal-open');
  if(restoreFocus){
    requestAnimationFrame(()=>{
      const target=returnFocus?.isConnected?returnFocus:document.querySelector('[data-modal-trigger="'+id+'"]');
      target?.focus();
    });
  }
}
document.addEventListener('keydown',function(e){
  const overlay=activeModalOverlay;
  if(!overlay||!overlay.classList.contains('open')) return;
  if(e.key==='Escape'){
    e.preventDefault();e.stopImmediatePropagation();closeAccessibleModal(overlay.id);return;
  }
  if(e.key!=='Tab') return;
  const focusable=getModalFocusable(overlay);
  if(!focusable.length){e.preventDefault();overlay.querySelector('[role="dialog"]')?.focus();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});

// ═══ TAGS ═══
const TAG_MAP={Terraform:'tf',Linux:'lx','Сети':'net',Ansible:'ans',Docker:'docker',Kubernetes:'k8s','CI/CD':'cicd',Git:'git',Regex:'rx',Monitoring:'mon',Cloud:'cloud',Security:'sec'};
function ttag(t){return '<span class="tag tag-'+(TAG_MAP[t]||'tf')+'">'+esc(t)+'</span>';}
function ltag(l){const m={Junior:'jr',Middle:'md',Senior:'sr'};return '<span class="tag tag-'+(m[l]||'jr')+'">'+esc(l)+'</span>';}
function ctag(c){if(!c||c==='definition') return '';const lbl={scenario:'Сценарий',tradeoff:'Trade-off',output:'Анализ вывода'};const cls={scenario:'sc',tradeoff:'tr',output:'out'};return '<span class="tag tag-'+(cls[c]||'sc')+'">'+esc(lbl[c]||c)+'</span>';}

// ═══ SYNTAX HIGHLIGHTING ═══
function highlightDockerfile(code){return esc(code).replace(/^(FROM\s+.+)$/gm,'<span style="color:#c084fc">$1</span>').replace(/^(RUN\s+.+)$/gm,'<span style="color:#fbbf24">$1</span>').replace(/^(COPY|ADD)\s+(.+)$/gm,'<span style="color:#38bdf8">$1</span> <span style="color:#a5b4fc">$2</span>').replace(/^(CMD|ENTRYPOINT)\s+(.+)$/gm,'<span style="color:#4ade80">$1</span> <span style="color:#fde68a">$2</span>').replace(/^(WORKDIR|EXPOSE|ENV|USER|HEALTHCHECK)\s+(.+)$/gm,'<span style="color:#fb923c">$1</span> <span style="color:#cbd5e1">$2</span>').replace(/^(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/--([a-z-]+)/g,'<span style="color:#f59e0b">--$1</span>');}
function highlightYAML(code){return esc(code).replace(/^(\s*)([a-z_][a-z_0-9]*):/gm,'$1<span style="color:#c084fc">$2</span>:').replace(/:\s+(true|false|yes|no)$/gm,': <span style="color:#f59e0b">$1</span>').replace(/:\s+(\d+)$/gm,': <span style="color:#38bdf8">$1</span>').replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span style="color:#4ade80">$1</span>').replace(/^(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/\{\{\s*(\S+)\s*\}\}/g,'<span style="color:#fb923c">{{ $1 }}</span>');}
function highlightHCL(code){return esc(code).replace(/(resource|data|variable|output|provider|module|terraform)\s+"([^"]+)"/g,'<span style="color:#c084fc">$1</span> <span style="color:#4ade80">"$2"</span>').replace(/(resource|data|variable|output|provider|module|terraform)\s+/g,'<span style="color:#c084fc">$1</span> ').replace(/=\s*(true|false)/g,'= <span style="color:#f59e0b">$1</span>').replace(/(#.+)$/gm,'<span style="color:#64748b">$1</span>').replace(/"([^"]*)"/g,'<span style="color:#4ade80">"$1"</span>');}

// ═══ EXAM ═══
function resetQuestionRenderLimit(){questionRenderLimit=QUESTION_BATCH_SIZE;}
function setMode(m,el){resetCoachSelection();currentMode=m;resetQuestionRenderLimit();setChip('mode-chips',el);clearTInterval();renderQuestions();}
function setView(v,el){currentView=v;resetQuestionRenderLimit();setChip('view-chips',el);clearTInterval();renderQuestions();}
function setTopic(t,el){resetCoachSelection();currentTopic=t;resetQuestionRenderLimit();setChip('topic-chips',el);renderQuestions();}
function setLevel(l,el){resetCoachSelection();currentLevel=l;resetQuestionRenderLimit();setChip('level-chips',el);renderQuestions();}
function setCategory(c,el){resetCoachSelection();currentCategory=c;resetQuestionRenderLimit();setChip('cat-chips',el);renderQuestions();}
function setTimer(s,el){timerSecs=s;setChip('timer-chips',el);}
function setChip(groupId,el){document.querySelectorAll('#'+groupId+' .chip').forEach(c=>{c.classList.remove('active');c.removeAttribute('aria-pressed');});if(el){el.classList.add('active');el.setAttribute('aria-pressed','true');}}
function clearMistakes(){if(confirm('Сбросить все ошибки?')){lsSet('mistakes',{});resetQuestionRenderLimit();renderQuestions();}}
function clearTInterval(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}timerDeadline=0;}

function toggleInterviewMode(){
  interviewMode=!interviewMode;
  if(interviewMode){cameFromStudy=false;document.getElementById('study-mode-cb').checked=false;}
  const chip=document.getElementById('interview-chip');
  if(chip){if(interviewMode){chip.classList.add('active');chip.setAttribute('aria-pressed','true');}else{chip.classList.remove('active');chip.removeAttribute('aria-pressed');}}
  resetQuestionRenderLimit();renderQuestions();
}

function filterQs(){
  let qs=getAllQ();
  if(Array.isArray(coachQuestionIds)&&coachQuestionIds.length){const ids=new Set(coachQuestionIds.map(String));qs=qs.filter(q=>ids.has(String(q.id)));}
  if(currentTopic!=='all') qs=qs.filter(q=>q.topic===currentTopic);
  if(currentLevel!=='all') qs=qs.filter(q=>q.level===currentLevel);
  if(currentCategory!=='all') qs=qs.filter(q=>(q.category||'definition')===currentCategory);
  const s=document.getElementById('exam-search')?.value?.toLowerCase()||'';
  if(s) qs=qs.filter(q=>q.q.toLowerCase().includes(s)||(q.options||[]).some(o=>o.toLowerCase().includes(s)));
  const mistakes=getMistakes();const qprog=getQProg();
  if(currentMode==='mistakes'){
    qs=qs.filter(q=>mistakes[q.id]);
    if(!qs.length){document.getElementById('questions-container').innerHTML='<div class="empty-state"><div class="icon">✅</div><p>Ошибок нет — отличная работа!</p><button class="btn btn-primary btn-sm" onclick="currentMode=\'all\';renderQuestions()">Показать все вопросы</button></div>';return qs;}
  }
  if(currentMode==='smart'||currentMode==='srs'){
    const now=Date.now();
    if(currentMode==='srs'){
      // Только вопросы, которые пора повторить
      qs=qs.filter(q=>{const p=qprog[q.id];return p&&p.nextReviewAt&&p.nextReviewAt<=now;});
    } else {
      // Умный: ошибки + давно не видел + низкий процент
      qs=qs.filter(q=>{const p=qprog[q.id];if(!p) return true;const r=p.correct/(p.correct+p.wrong);const age=(now-(p.lastSeen||0))/3600000;return r<0.7||age>24;});
    }
  }
  if(coachSessionLimit>0&&(currentMode==='smart'||currentMode==='srs')) qs=shuffle(qs).slice(0,coachSessionLimit);
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
  const visible=qs.slice(0,questionRenderLimit);
  questionRenderLimit=visible.length;
  cont.innerHTML=visible.map(q=>renderQCard(q,false)).join('')+renderLoadMoreQuestions(qs.length);
  bindLoadMoreQuestions();
}

function renderLoadMoreQuestions(total){
  if(questionRenderLimit>=total) return '';
  return '<div id="questions-load-more" style="text-align:center;padding:18px"><button type="button" class="btn btn-outline">Показать ещё '+Math.min(QUESTION_BATCH_SIZE,total-questionRenderLimit)+' · '+questionRenderLimit+'/'+total+'</button></div>';
}
function bindLoadMoreQuestions(){
  document.querySelector('#questions-load-more button')?.addEventListener('click',loadMoreQuestions);
}
function loadMoreQuestions(){
  const cont=document.getElementById('questions-container');
  if(!cont) return;
  document.getElementById('questions-load-more')?.remove();
  const start=questionRenderLimit;
  const end=Math.min(start+QUESTION_BATCH_SIZE,activeQuestions.length);
  const questions=activeQuestions.slice(start,end);
  questionRenderLimit=end;
  const html=currentView==='flashcard'?renderFlashcardMarkup(questions):questions.map(q=>renderQCard(q,false)).join('');
  cont.insertAdjacentHTML('beforeend',html+renderLoadMoreQuestions(activeQuestions.length));
  bindLoadMoreQuestions();
}

function updateQuestionProgressSummary(){
  const pi=document.getElementById('progress-info');
  const sb=document.getElementById('seg-bar');
  if(!pi||!sb||!activeQuestions.length||sb.style.display==='none') return;
  const qprog=getQProg();const total=activeQuestions.length;
  let ok=0,err=0;
  activeQuestions.forEach(q=>{const p=qprog[q.id];if(p){if(p.correct>p.wrong)ok++;else if(p.wrong>0)err++;}});
  sb.innerHTML='<div class="seg-ok" style="width:'+(ok/total*100)+'%"></div><div class="seg-err" style="width:'+(err/total*100)+'%"></div><div class="seg-none" style="width:'+((total-ok-err)/total*100)+'%"></div>';
  pi.innerHTML='<span style="font-size:12px;color:var(--text2)">Показано: <b>'+total+'</b> | ✅ '+ok+' | ❌ '+err+' | ⭕ '+(total-ok-err)+'</span>';
}

function renderQCard(q,sMode){
  const mistakes=getMistakes();const qprog=getQProg();const qp=qprog[q.id]||{correct:0,wrong:0};
  const L=['A','B','C','D','E'];const opts=(q.options||[]);
  const order=[...Array(opts.length).keys()];
  for(let i=order.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[order[i],order[j]]=[order[j],order[i]];}
  const studyMode=document.getElementById('study-mode-cb')?.checked||cameFromStudy;
  const isInterview=interviewMode&&!studyMode&&!cameFromStudy;
  questionStartTime[q.id]=Date.now();
  return '<div class="q-card" id="qcard-'+q.id+'">'+
    '<div class="q-meta">'+ttag(q.topic)+ltag(q.level)+ctag(q.category)+
    '<span class="q-num">#'+q.id+(mistakes[q.id]?' ❌':'')+
    ' <span style="color:var(--text3)">✅'+qp.correct+' ❌'+qp.wrong+'</span></span>'+
    (sMode&&timerSecs?'<span class="q-timer" id="timer-'+q.id+'">'+timerSecs+'с</span>':'')+
    '</div>'+
    '<div class="q-text">'+esc(q.q)+'</div>'+
    '<div class="q-options">'+
    order.map((origIdx,visPos)=>'<button type="button" class="q-opt" id="opt-'+q.id+'-'+visPos+'" data-orig-idx="'+origIdx+'" data-answer="'+q.answer+'" onclick="pick('+q.id+','+origIdx+','+q.answer+')"><span class="opt-letter">'+L[visPos]+'</span><span>'+esc(opts[origIdx])+'</span></button>').join('')+
    '</div>'+
    (q.explanation&&studyMode?'<div class="q-explanation">💡 '+esc(q.explanation)+buildWhyWrong(q,opts)+'</div>':'')+
    '<div id="qexpl-'+q.id+'" style="display:none" class="q-explanation"></div>'+
    (isInterview?'<div class="q-interview-note">🎤 Режим собеседования — отвечайте развёрнуто, без подсказок</div>':'')+
    '</div>';
}

function buildWhyWrong(q,opts){
  if(!q.explanation||!opts) return '';
  const correctIdx=q.answer;
  const wrongOpts=opts.filter((_,i)=>i!==correctIdx);
  if(!wrongOpts.length) return '';
  return '<div class="q-why-wrong"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-top:8px;margin-bottom:4px">❓ Почему остальные варианты неверны:</div>'+
    wrongOpts.map(o=>'<div style="font-size:12px;color:var(--text2);margin-bottom:2px">• '+esc(o.slice(0,80))+(o.length>80?'…':'')+'</div>').join('')+'</div>';
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
  const respTime=questionStartTime[qid]?Math.round((Date.now()-questionStartTime[qid])/1000):0;
  recordQuestionResult(q,{outcome:ok?'pass':'fail',source:'exam',responseSeconds:respTime,syncMistakes:true,history:true});
  if(q&&q.explanation&&!interviewMode){const el=document.getElementById('qexpl-'+qid);if(el){el.innerHTML='💡 '+esc(q.explanation);el.style.display='block';}}
  updateQuestionProgressSummary();
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
function startTimer(qid,secs){
  clearTInterval();timerDeadline=Date.now()+secs*1000;
  const tick=()=>{
    const rem=secondsUntil(timerDeadline);const el=document.getElementById('timer-'+qid);
    if(el){el.textContent=rem+'с';el.classList.toggle('urgent',rem<=5);}
    if(rem<=0){clearTInterval();autoFail(qid);}
  };
  tick();timerInterval=setInterval(tick,1000);
}
function autoFail(qid){const q=getAllQ().find(x=>x.id===qid);if(!q) return;const c=document.getElementById('qcard-'+qid);if(!c||c.querySelector('.q-opt.correct-opt')) return;pick(qid,-1,q.answer);}

function renderFlashcardMarkup(qs){
  return qs.map(q=>
    '<div class="flashcard" id="fc-'+q.id+'" onclick="flipCard('+q.id+')"><div class="flashcard-inner"><div class="fc-front"><div class="q-meta" style="justify-content:center;margin-bottom:10px">'+ttag(q.topic)+ltag(q.level)+'</div><p>'+esc(q.q)+'</p><div style="margin-top:10px;font-size:11px;color:var(--text3)">Нажмите для ответа</div></div>'+
    '<div class="fc-back"><div style="font-weight:700;color:var(--primary-h);margin-bottom:8px">✅ '+esc((q.options||[])[q.answer]||'')+'</div>'+(q.explanation?'<p style="font-size:13px;color:var(--text2)">'+esc(q.explanation)+'</p>':'')+
    '</div></div></div>'
  ).join('');
}
function renderFlashcards(qs){
  const visible=qs.slice(0,questionRenderLimit);
  questionRenderLimit=visible.length;
  document.getElementById('questions-container').innerHTML=renderFlashcardMarkup(visible)+renderLoadMoreQuestions(qs.length);
  bindLoadMoreQuestions();
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
  const respTime=questionStartTime[q.id]?Math.round((Date.now()-questionStartTime[q.id])/1000):0;
  const outcome=rating==='good'?'pass':rating==='partial'?'partial':'fail';
  recordQuestionResult(q,{outcome,source:'freeform',responseSeconds:respTime,history:true});
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
let mockState={questions:[],idx:0,answers:[],timeLeft:1800,timer:null,active:false,qTimeLeft:120,deadline:0,questionDeadline:0,level:'all'};
function startMockInterview(){
  const allQ=getAllQ();if(allQ.length<10){alert('Нужно минимум 10 вопросов');return;}
  mockState.questions=shuffle(allQ).slice(0,12);
  nav('exam');
  mockState.idx=0;mockState.answers=[];mockState.timeLeft=1800;mockState.active=true;mockState.qTimeLeft=120;mockLastRating=0;
  mockState.deadline=Date.now()+1800*1000;
  document.getElementById('exam-controls').style.display='none';
  document.getElementById('progress-info').style.display='none';
  document.getElementById('seg-bar').style.display='none';
  document.getElementById('single-controls').style.display='none';
  renderMockQ();mockState.timer=setInterval(mockTick,1000);
}
function mockTick(){
  if(!mockState.active) return;
  mockState.timeLeft=secondsUntil(mockState.deadline);mockState.qTimeLeft=secondsUntil(mockState.questionDeadline);
  const el=document.getElementById('mock-timer');
  if(el){const m=Math.floor(mockState.timeLeft/60),s=('0'+mockState.timeLeft%60).slice(-2);el.textContent=m+':'+s;if(mockState.timeLeft<=120)el.style.color='var(--red)';}
  const qel=document.getElementById('mock-q-timer');
  if(qel){qel.textContent=Math.max(0,mockState.qTimeLeft)+'с';if(mockState.qTimeLeft<=30)qel.style.color='var(--red)';else if(mockState.qTimeLeft<=60)qel.style.color='var(--yellow)';}
  if(mockState.timeLeft<=0){endMockInterview();return;}
  if(mockState.qTimeLeft<=0)mockNext();
}
function renderMockQ(){
  if(mockState.idx>=mockState.questions.length){endMockInterview();return;}
  const q=mockState.questions[mockState.idx];
  mockState.timeLeft=secondsUntil(mockState.deadline);
  mockState.questionDeadline=Math.min(mockState.deadline,Date.now()+120*1000);
  mockState.qTimeLeft=secondsUntil(mockState.questionDeadline);questionStartTime[q.id]=Date.now();
  document.getElementById('questions-container').innerHTML=
    '<div style="background:var(--bg2);border:2px solid var(--primary);border-radius:14px;padding:24px;max-width:700px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'+
    '<div style="display:flex;gap:6px">'+ttag(q.topic)+ltag(q.level)+'</div>'+
    '<div style="font-size:18px;font-weight:800" id="mock-timer" role="timer" aria-label="Осталось времени на интервью">'+Math.floor(mockState.timeLeft/60)+':'+('0'+mockState.timeLeft%60).slice(-2)+'</div>'+
    '<div style="font-size:13px;color:var(--text2)">Вопрос '+(mockState.idx+1)+'/12</div></div>'+
    '<div class="q-text" style="font-size:16px;margin-bottom:8px">'+esc(q.q)+'</div>'+
    '<div style="font-size:12px;color:var(--yellow);margin-bottom:12px">⏱ На этот вопрос: <b id="mock-q-timer" role="timer" aria-label="Осталось времени на вопрос">'+mockState.qTimeLeft+'с</b></div>'+
    '<textarea class="form-input" id="mock-inp" rows="5" placeholder="Ваш ответ... (можно кратко, как на собеседовании)" style="width:100%;font-size:14px;margin-bottom:12px"></textarea>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">👎 1 — совсем не знаю · 2 — смутно · 3 — частично · 4 — хорошо · 5 👍 — отлично</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'+
    [1,2,3,4,5].map(n=>'<button type="button" class="btn btn-outline btn-sm mock-rate-btn" onclick="mockRateQuestion('+n+')">'+n+'</button>').join('')+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btn-primary" id="mock-next-btn" style="display:none" onclick="mockNext()">Следующий →</button>'+
    '<button class="btn btn-outline btn-sm" onclick="mockSkip()">Пропустить</button>'+
    '<button class="btn btn-outline btn-sm" onclick="endMockInterview()" style="color:var(--red)">Завершить</button>'+
    '</div></div>';
  setTimeout(()=>document.getElementById('mock-inp')?.focus(),100);
}

let mockLastRating=0;
function recordMockAttempt(question,rating){
  const outcome=rating>=4?'pass':rating===3?'partial':'fail';
  const responseSeconds=questionStartTime[question.id]?Math.round((Date.now()-questionStartTime[question.id])/1000):0;
  recordQuestionResult(question,{outcome,source:'mock',responseSeconds,history:false});
}
function mockRateQuestion(n){
  mockLastRating=n;
  document.querySelectorAll('.mock-rate-btn').forEach((b,i)=>{if(i+1===n)b.style.background='var(--primary-dim)';else b.style.background='';});
  document.getElementById('mock-next-btn').style.display='';
  document.getElementById('mock-next-btn').textContent='Следующий → (оценка: '+n+'/5)';
}

function mockNext(){
  if(!mockState.active||mockState.idx>=mockState.questions.length) return;
  const answer=document.getElementById('mock-inp')?.value||'(пусто)';
  recordMockAttempt(mockState.questions[mockState.idx],mockLastRating);
  mockState.answers.push({q:mockState.questions[mockState.idx],answer:answer,rating:mockLastRating});
  mockLastRating=0;mockState.idx++;renderMockQ();
}
function mockSkip(){
  if(!mockState.active||mockState.idx>=mockState.questions.length) return;
  recordMockAttempt(mockState.questions[mockState.idx],0);
  mockState.answers.push({q:mockState.questions[mockState.idx],answer:'(пропущено)',rating:0});
  mockLastRating=0;mockState.idx++;renderMockQ();
}
function endMockInterview(){
  if(mockState.deadline) mockState.timeLeft=secondsUntil(mockState.deadline);
  clearInterval(mockState.timer);mockState.timer=null;mockState.active=false;mockState.deadline=0;mockState.questionDeadline=0;
  restoreExamControls();
  if(mockState.idx<mockState.questions.length){recordMockAttempt(mockState.questions[mockState.idx],0);mockState.answers.push({q:mockState.questions[mockState.idx],answer:document.getElementById('mock-inp')?.value||'(не закончено)',rating:0});}
  const byTopic={};mockState.answers.forEach(a=>{const t=a.q.topic;if(!byTopic[t])byTopic[t]=[];byTopic[t].push(a);});
  const totalQ=mockState.answers.length;
  const rated=Object.values(mockState.answers).filter(a=>a.rating>0);
  const avgRating=rated.length?Math.round(rated.reduce((s,a)=>s+a.rating,0)/rated.length*10)/10:0;
  const level=avgRating>=4.0?'Senior':avgRating>=3.0?'Middle+':'Junior+';
  const levelColor=avgRating>=4.0?'var(--green)':avgRating>=3.0?'var(--yellow)':'var(--orange)';
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:30px 20px;max-width:800px;margin:0 auto">'+
    '<div style="font-size:48px;margin-bottom:8px">🎤</div>'+
    '<div style="font-size:24px;font-weight:800;margin-bottom:4px">Mock Interview завершён</div>'+
    '<div style="font-size:14px;color:var(--text2);margin-bottom:8px">Ответов: '+totalQ+' | Время: '+Math.floor((1800-mockState.timeLeft)/60)+' мин</div>'+
    '<div style="font-size:36px;font-weight:800;margin-bottom:4px" style="color:'+levelColor+'">'+level+'</div>'+
    '<div style="font-size:13px;color:var(--text2);margin-bottom:16px">Средняя самооценка: '+avgRating+'/5</div>'+
    '<div class="card" style="text-align:left;margin-bottom:14px"><div class="card-title">📊 Разбор по темам</div>'+
    Object.entries(byTopic).map(([t,as])=>{const tr=Math.round(as.filter(a=>a.rating>0).reduce((s,a)=>s+a.rating,0)/Math.max(1,as.filter(a=>a.rating>0).length)*10)/10;return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:13px"><span>'+esc(t)+' ('+as.length+' вопр.)</span><span style="color:'+(tr>=4?'var(--green)':tr>=2.5?'var(--yellow)':'var(--red)')+'">'+tr+'/5</span></div>';}).join('')+'</div>'+
    '<div class="card" style="text-align:left"><div class="card-title">📝 Ваши ответы и правильные</div>'+
    mockState.answers.map(a=>'<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)"><div style="font-weight:600;margin-bottom:4px">'+esc(a.q.q)+'</div><div style="font-size:12px;color:var(--text2);margin-bottom:4px">Ваш ответ: <span style="color:var(--yellow)">'+esc(a.answer.substring(0,200))+'</span></div><div style="font-size:12px;color:var(--green)">✅ Правильный: '+esc((a.q.options||[])[a.q.answer]||'')+'</div>'+(a.rating?'<div style="font-size:11px;color:var(--primary-h);margin-top:2px">⭐ Самооценка: '+a.rating+'/5</div>':'')+'</div>').join('')+'</div>'+
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">'+
    '<button class="btn btn-primary" onclick="startMockInterview()">🔄 Ещё интервью</button>'+
    '<button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
}

// ═══ STUDY TAB ═══
function getStudyPosition(){return lsGet('study_position',{week:1,day:1});}
function setStudyPosition(week,day){lsSet('study_position',{week:week,day:day});renderStudy();}
function getStudyProgress(){return lsGet('study_progress',{});}
function setStudyDayStatus(week,day,status){const p=getStudyProgress();p['w'+week+'d'+day]=status;lsSet('study_progress',p);renderStudy();}
function getStudyWeek(week){return (STUDY_MAP?.weeks||[]).find(w=>w.week===week);}
function getStudyDay(week,day){const w=getStudyWeek(week);return w?(w.days||[]).find(d=>d.day===day):null;}
function getMiniTest(week,day){return (STUDY_TESTS?.miniTests||[]).find(t=>t.week===week&&t.day===day);}
function getWeeklyTest(week){return (STUDY_TESTS?.weeklyTests||[]).find(t=>t.week===week);}
function getSeniorCaseList(){return Array.isArray(SENIOR_CASES)?SENIOR_CASES:(SENIOR_CASES?.cases||[]);}
function getSeniorCasesForDay(week,day){return getSeniorCaseList().filter(c=>c.week===week&&(!c.day||c.day===day));}
function statusLabel(s){return {locked:'закрыт',todo:'к изучению',in_progress:'в процессе',review:'повторить',done:'готово'}[s||'todo']||s;}
function escAttr(s){return esc(s).replace(/'/g,'&#39;');}
function renderStudy(){
  if(!STUDY_MAP||!STUDY_TESTS){return;}
  const pos=getStudyPosition();
  const week=getStudyWeek(pos.week)||getStudyWeek(1);
  if(!week){document.getElementById('study-current').innerHTML='<div class="empty-state"><p>Учебный план не найден</p></div>';return;}
  const day=getStudyDay(week.week,pos.day)||week.days[0];
  const actualPos={week:week.week,day:day.day};
  const mini=getMiniTest(actualPos.week,actualPos.day);
  const weekly=getWeeklyTest(actualPos.week);
  const cases=getSeniorCasesForDay(actualPos.week,actualPos.day);
  renderStudyCurrent(week,day);
  renderStudyDays(week,day.day);
  renderStudyToday(day);
  renderStudyMiniTest(mini,weekly,day.day===5);
  renderStudyProgress(week);
  renderStudyTrainers(week);
  renderStudySeniorCase(cases[0]);
}
function renderStudyCurrent(week,day){
  document.getElementById('study-current').innerHTML=
    '<section class="study-hero"><div class="study-kicker">Неделя '+week.week+' · '+esc(week.targetLevel||'')+'</div>'+
    '<div class="study-title">'+esc(week.title)+'</div>'+
    '<div class="study-goal">'+esc(week.goal||'')+'</div>'+
    '<div class="study-meta"><span class="tag tag-lx">День '+day.day+'</span><span class="tag tag-sc">'+esc(day.title)+'</span><span class="tag tag-tr">Production-слой</span></div></section>';
}
function renderStudyDays(week,activeDay){
  const prog=getStudyProgress();
  document.getElementById('study-days').innerHTML='<div class="study-days">'+(week.days||[]).map(d=>{
    const st=prog['w'+week.week+'d'+d.day]||(d.day===1?'todo':'locked');
    return '<button type="button" class="study-day '+(d.day===activeDay?'active ':'')+esc(st)+'" onclick="setStudyPosition('+week.week+','+d.day+')"><div class="study-day-num">День '+d.day+' · '+statusLabel(st)+'</div><div class="study-day-title">'+esc(d.title)+'</div></button>';
  }).join('')+'</div>';
}
function renderStudyToday(day){
  document.getElementById('study-today').innerHTML=
    '<section class="study-card"><h3>Сегодня</h3><div class="study-goal">'+esc(day.objective||'')+'</div>'+
    '<h4>Практика</h4><div class="study-command-list">'+(day.practice||[]).map(c=>'<span class="study-command">'+esc(c)+'</span>').join('')+'</div>'+
    '<h4>Типовые ошибки</h4><ul class="study-list">'+(day.pitfalls||[]).map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>'+
    '<div class="study-actions"><button class="btn btn-outline btn-sm" onclick="setStudyDayStatus(getStudyPosition().week,getStudyPosition().day,\'in_progress\')">Начал</button>'+
    '<button class="btn btn-primary btn-sm" onclick="setStudyDayStatus(getStudyPosition().week,getStudyPosition().day,\'done\')">Отметить готово</button>'+
    '<button class="btn btn-outline btn-sm" onclick="setStudyDayStatus(getStudyPosition().week,getStudyPosition().day,\'review\')">На повтор</button></div></section>';
}
function renderStudyMiniTest(test,weekly,showWeekly){
  const el=document.getElementById('study-test');
  if(!test){el.innerHTML='<section class="study-card"><h3>Мини-тест</h3><p style="color:var(--text2);font-size:13px">Для этого дня тест пока не задан.</p></section>';return;}
  const saved=lsGet('study_answers',{})[test.id]||{};
  const qScores=saved.qScores||[];
  const total=qScores.reduce((s,v)=>s+(v||0),0);
  el.innerHTML='<section class="study-card"><h3>Мини-тест: '+esc(test.title)+'</h3><div style="font-size:12px;color:var(--text2);margin-bottom:10px">Оценка: '+total+' / 5</div>'+
    (test.questions||[]).map((q,i)=>'<div class="study-question"><div class="study-question-text">'+(i+1)+'. '+esc(q.q)+'</div>'+
      '<textarea class="study-answer" id="study-answer-'+test.id+'-'+i+'" placeholder="Ответ своими словами...">'+esc((saved.answers||[])[i]||'')+'</textarea>'+
      '<div class="study-score-row"><button class="btn btn-outline btn-sm" onclick="toggleStudyRef(\''+escAttr(test.id)+'-'+i+'\')">Показать эталон</button>'+
      '<button class="btn btn-outline btn-sm" onclick="scoreStudyQuestion(\''+escAttr(test.id)+'\','+i+',0)">0</button>'+
      '<button class="btn btn-primary btn-sm" onclick="scoreStudyQuestion(\''+escAttr(test.id)+'\','+i+',1)">1</button><span class="study-status '+(qScores[i]?'done':'')+'">'+(qScores[i]?'1':'0')+' балл</span></div>'+
      '<div class="study-reference" id="study-ref-'+test.id+'-'+i+'">'+esc(q.expected)+'</div></div>').join('')+
    '<div class="study-actions"><button class="btn btn-primary btn-sm" onclick="saveStudyAnswers(\''+escAttr(test.id)+'\')">Сохранить ответы</button></div></section>'+
    (showWeekly&&weekly?renderWeeklyTest(weekly):'');
}
function renderWeeklyTest(test){
  const parts=test.parts||{};
  const theory=(parts.theory?.questions||[]).map(q=>'<li>'+esc(q)+'</li>').join('');
  const must=(parts.practice?.mustInclude||[]).map(q=>'<li>'+esc(q)+'</li>').join('');
  return '<section class="study-card"><h3>Пятничный тест: '+esc(test.title)+'</h3>'+
    '<h4>Практика · '+(parts.practice?.score||0)+' баллов</h4><p class="study-goal">'+esc(parts.practice?.task||'')+'</p><ul class="study-list">'+must+'</ul>'+
    '<h4>Теория · '+(parts.theory?.score||0)+' баллов</h4><ul class="study-list">'+theory+'</ul>'+
    '<h4>Debug · '+(parts.debug?.score||0)+' баллов</h4><p class="study-goal">'+esc(parts.debug?.task||'')+'</p>'+
    '<button class="btn btn-outline btn-sm" onclick="toggleStudyRef(\''+escAttr(test.id)+'-debug\')">Показать ожидаемый ответ</button>'+
    '<div class="study-reference" id="study-ref-'+test.id+'-debug">'+esc(parts.debug?.expected||'')+'</div>'+
    '<h4>Senior Challenge · '+(parts.seniorChallenge?.score||0)+' баллов</h4><p class="study-goal">Кейс: '+esc(parts.seniorChallenge?.caseId||'')+'. '+esc(parts.seniorChallenge?.task||'')+'</p></section>';
}
function saveStudyAnswers(testId,silent){
  const test=(STUDY_TESTS?.miniTests||[]).find(t=>t.id===testId);if(!test)return;
  const store=lsGet('study_answers',{});const cur=store[testId]||{};
  cur.answers=(test.questions||[]).map((q,i)=>document.getElementById('study-answer-'+testId+'-'+i)?.value||'');
  cur.completedAt=new Date().toISOString();store[testId]=cur;lsSet('study_answers',store);if(!silent)alert('Ответы сохранены');
}
function scoreStudyQuestion(testId,idx,score){
  saveStudyAnswers(testId,true);
  const store=lsGet('study_answers',{});if(!store[testId])store[testId]={};
  const qScores=store[testId].qScores||[];qScores[idx]=score;store[testId].qScores=qScores;store[testId].score=qScores.reduce((s,v)=>s+(v||0),0);store[testId].completedAt=new Date().toISOString();lsSet('study_answers',store);
  const pos=getStudyPosition();if(store[testId].score>=4)setStudyDayStatus(pos.week,pos.day,'done');else renderStudy();
}
function toggleStudyRef(id){const el=document.getElementById('study-ref-'+id);if(el)el.classList.toggle('open');}
function renderStudyProgress(week){
  const prog=getStudyProgress();
  document.getElementById('study-progress').innerHTML='<section class="study-card"><h3>Прогресс недели</h3>'+
    (week.days||[]).map(d=>{const st=prog['w'+week.week+'d'+d.day]||(d.day===1?'todo':'locked');return '<div class="study-progress-row"><span>День '+d.day+'</span><span class="study-status '+esc(st)+'">'+statusLabel(st)+'</span></div>';}).join('')+'</section>';
}
function renderStudyTrainers(week){
  const trainers=(week.interviewPrepMax?.trainers||[]);
  const labels={exam:'Экзамен',cmd:'Команды',labs:'Debugging',subnet:'Подсети',ts:'Диагностика',git:'Git',ports:'Порты',tips:'Советы'};
  document.getElementById('study-trainers').innerHTML='<section class="study-card"><h3>Связанные тренажёры</h3><div class="study-trainer-grid">'+
    trainers.map(t=>'<button class="btn btn-outline btn-sm" onclick="startStudyTrainer(\''+t+'\','+week.week+')">'+esc(labels[t]||t)+'</button>').join('')+'</div></section>';
}
function startStudyTrainer(trainerId,weekNum){
  const week=getStudyWeek(weekNum);const filters=week?.interviewPrepMax?.questionFilters||{};
  if(trainerId==='exam'){
    const topics=filters.topic||[],levels=filters.level||[];
    currentTopic=topics.length===1?topics[0]:'all';currentLevel=levels.length===1?levels[0]:'all';currentCategory='all';currentMode='all';currentView='standard';
    cameFromStudy=true;interviewMode=false;
    nav('exam');
    return;
  }
  nav(trainerId);
}
function renderStudySeniorCase(c){
  const el=document.getElementById('study-senior-case');
  if(!c){el.innerHTML='<section class="study-card"><h3>Senior Challenge</h3><p style="font-size:13px;color:var(--text2)">Для этого дня отдельный кейс не задан.</p></section>';return;}
  const prog=lsGet('senior_case_prog',{})[c.id]||{};
  el.innerHTML='<section class="study-card"><h3>Senior Challenge</h3><div class="study-meta"><span class="tag tag-sr">'+esc(c.level)+'</span><span class="tag tag-tr">'+esc(c.type)+'</span></div>'+
    '<h4>'+esc(c.title)+'</h4><p class="study-goal">'+esc(c.context)+'</p><h4>Evidence</h4><pre class="study-evidence">'+esc((c.evidence||[]).join('\n'))+'</pre>'+
    '<h4>Задача</h4><p class="study-goal">'+esc(c.task)+'</p><div class="study-case-actions"><button class="btn btn-outline btn-sm" onclick="toggleStudyRef(\''+escAttr(c.id)+'-actions\')">Показать ожидаемые действия</button>'+
    '<button class="btn btn-primary btn-sm" onclick="markSeniorCaseDone(\''+escAttr(c.id)+'\')">Отметить кейс готовым</button></div>'+
    '<div class="study-reference" id="study-ref-'+c.id+'-actions"><b>Ожидаемые действия:</b><ul class="study-list">'+(c.expectedActions||[]).map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul><b>Частые ошибки:</b><ul class="study-list">'+(c.commonMistakes||[]).map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul></div>'+
    '<div style="font-size:12px;color:var(--text2);margin-top:10px">Статус: '+esc(prog.status||'не пройден')+'</div></section>';
}
function markSeniorCaseDone(id){const p=lsGet('senior_case_prog',{});p[id]={status:'done',completedAt:new Date().toISOString()};lsSet('senior_case_prog',p);renderStudy();}

// ═══ HOME ═══
function updateStreakDisplay(){const sd=document.getElementById('streak-display');if(sd)sd.textContent='🔥 '+streak;}
function renderHome(){
  if(typeof InterviewCoachUI!=='undefined') InterviewCoachUI.render();
  renderReadinessHome();
  renderMasteryCards();
  const s=streak,best=lsGet('streak_best',0);
  const banner=document.getElementById('home-streak-banner');
  if(s>0||best>0){banner.style.display='flex';}
  document.getElementById('home-streak-num').textContent=streak;
  document.getElementById('home-best-streak').textContent='Лучшая серия: '+best;
  const hist=lsGet('history',[]);
  const hc=document.getElementById('home-history');
  if(!hist.length){hc.innerHTML='<p style="color:var(--text3);font-size:13px">История пуста. Начните экзамен!</p>';}else{
  hc.innerHTML=hist.slice(0,5).map(h=>'<div class="history-item"><span style="color:var(--text3);font-size:11px">'+esc(h.date)+'</span><span>'+esc(h.topic||'')+'</span><span style="color:'+(h.correct?'var(--green)':'var(--red)')+'">'+(h.correct?'✅ Верно':'❌ Неверно')+'</span></div>').join('');}
  // Пересоздаём Блиц и Mock Interview (чтобы не пропадали при перерендере)
  setTimeout(()=>{
    const qa=document.querySelector('.quick-actions');
    if(!qa) return;
    if(!document.getElementById('blitz-btn')){
      const btn=document.createElement('button');btn.id='blitz-btn';btn.className='btn btn-outline';btn.style.cssText='background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)';btn.textContent='⚡ Блиц (5 мин)';btn.onclick=startBlitz;btn.setAttribute('aria-label','Блиц-опрос на 5 минут');qa.appendChild(btn);
    }
    if(!document.getElementById('mock-btn')){
      const mockBtn=document.createElement('button');mockBtn.id='mock-btn';mockBtn.className='btn btn-outline';mockBtn.style.cssText='background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)';mockBtn.textContent='🎤 Mock Interview (30 мин)';mockBtn.onclick=startMockInterview;mockBtn.setAttribute('aria-label','Mock интервью на 30 минут');qa.appendChild(mockBtn);
    }
    if(!document.getElementById('diag-btn')){
      const diagBtn=document.createElement('button');diagBtn.id='diag-btn';diagBtn.className='btn btn-outline';diagBtn.style.cssText='background:var(--yellow-dim);color:var(--yellow);border-color:var(--yellow)';diagBtn.textContent='🔬 Диагностика';diagBtn.onclick=startDiagnostic;diagBtn.setAttribute('aria-label','Диагностический тест на 15 вопросов');qa.appendChild(diagBtn);
    }
    if(!document.getElementById('inc-btn')){
      const incBtn=document.createElement('button');incBtn.id='inc-btn';incBtn.className='btn btn-outline';incBtn.style.cssText='background:var(--red-dim);color:var(--red);border-color:var(--red)';incBtn.textContent='🚨 Инцидент';incBtn.onclick=startIncidentSim;incBtn.setAttribute('aria-label','Симуляция инцидента');qa.appendChild(incBtn);
    }
  },100);
}
function startCoachFocus(topic,trainerPage,plan){
  if(!plan) return;
  resetCoachSelection();
  if(trainerPage){nav(trainerPage);return;}
  if(!getAllQ().some(q=>q.topic===topic)){alert('Для выбранной темы пока нет вопросов.');return;}
  coachSessionLimit=plan.sessionSize;
  currentTopic=topic;currentLevel='all';currentCategory='all';currentMode='smart';currentView='standard';interviewMode=false;cameFromStudy=false;
  nav('exam');
}
function startCoachReviewMode(plan){
  if(!plan||!plan.dueCount){alert('На сегодня нет запланированных повторений.');return;}
  resetCoachSelection();
  coachSessionLimit=Math.min(plan.sessionSize,plan.dueCount);
  currentTopic='all';currentLevel='all';currentCategory='all';currentMode='srs';currentView='standard';interviewMode=false;cameFromStudy=false;
  nav('exam');
}
function startCoachControlMode(plan){
  const ids=plan?.controlSession?.questionIds;
  if(!Array.isArray(ids)||!ids.length){alert('Пока недостаточно вопросов для контрольной сессии.');return;}
  resetCoachSelection();
  coachQuestionIds=ids;
  lsSet('coach_control',{
    id:'control-'+Date.now(),startedAt:Date.now(),completedAt:null,
    questionIds:ids.map(String),topics:Array.isArray(plan.controlSession.topics)?plan.controlSession.topics:[],attempts:[]
  });
  currentTopic='all';currentLevel='all';currentCategory='all';currentMode='all';currentView='standard';interviewMode=true;cameFromStudy=false;
  nav('exam');
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
    return '<button type="button" class="mastery-card" data-topic="'+t+'" onclick="currentTopic=this.getAttribute(\'data-topic\');nav(\'exam\')">'+'<div style="font-size:20px">'+(icons[i]||'📋')+'</div>'+'<div class="mastery-pct" style="color:'+(colors[i]||'var(--primary)')+'">'+pct+'%</div>'+'<div class="mastery-name">'+t+'</div>'+'<div style="font-size:11px;color:var(--text3);margin-top:2px">'+m+'/'+tqs.length+'</div>'+'<div class="mastery-bar"><div class="mastery-fill" style="width:'+pct+'%;background:'+(colors[i]||'var(--primary)')+'"></div></div></button>';
  }).join('');
}

// ═══ ANALYTICS ═══
const analyticsUI=typeof IPMaxAnalyticsUI!=='undefined'?IPMaxAnalyticsUI.create({
  get:(key,fallback)=>lsGet(key,fallback),getQuestionProgress:getQProg,getQuestions:getAllQ,getMistakes,getTopics:getAllTopics,
  escape:esc,tagMap:TAG_MAP,localDateKey:timestamp=>IPMaxDate.localDateKey(timestamp),
  startExam:()=>nav('exam'),startDiagnostic,
  startQuestion:question=>startAnalyticsQuestions([question]),
  startQuestions:startAnalyticsQuestions
}):null;
function requireAnalyticsUI(){if(!analyticsUI) throw new Error('Модуль аналитики не загружен.');return analyticsUI;}
function startAnalyticsQuestions(questions){
  const ids=(Array.isArray(questions)?questions:[]).map(question=>question&&question.id).filter(id=>id!==undefined&&id!==null);
  if(!ids.length) return;
  resetCoachSelection();coachQuestionIds=ids;
  currentTopic='all';currentLevel='all';currentCategory='all';currentMode='all';currentView='standard';interviewMode=false;cameFromStudy=false;
  nav('exam');
}
function renderAnalytics(){return requireAnalyticsUI().renderAnalytics();}
function renderReadinessHome(){return requireAnalyticsUI().renderReadinessHome();}
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
  if(allOk){subnetDone[idx]=1;lsSet('subnet_prog',subnetDone);recordTrainerResult('subnet','Сети',true);document.getElementById('sp-badge-'+idx).innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно!</span>';updateSubnetProg();}
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
    return '<button type="button" class="ts-sc-card'+(done?' done':'')+'" onclick="tsStart('+s.id+')"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="font-size:13px;font-weight:700">'+s.title+'</span>'+(done?'<span class="ts-score-badge">'+sc+' очков</span>':'')+'</div><div style="font-size:12px;color:var(--text2);line-height:1.5">'+s.context+'</div></button>';
  }).join('');
}
function tsStart(id){const scen=TS_SCENARIOS.find(s=>s.id===id);if(!scen) return;tsState={scenarioId:id,currentNode:'start',totalPoints:0,steps:[]};document.getElementById('ts-list').style.display='none';document.getElementById('ts-game').classList.add('active');document.getElementById('ts-game-title').textContent=scen.title;document.getElementById('ts-context-text').textContent=scen.context;document.getElementById('ts-end').style.display='none';document.getElementById('ts-step-log').innerHTML='';tsRenderNode(scen,'start');}
function tsRenderNode(scen,nodeId){const node=scen.nodes[nodeId];if(!node) return;document.getElementById('ts-observation').textContent=node.obs;document.getElementById('ts-game-score').textContent='Очки: '+tsState.totalPoints;const ch=document.getElementById('ts-choices');if(!node.choices||!node.choices.length){ch.innerHTML='';tsEndScenario(scen);return;}ch.innerHTML=node.choices.map((c,i)=>'<button type=\"button\" class=\"ts-choice\" onclick=\"tsChoose('+i+')\"><span>'+esc(c.text)+'</span></button>').join('');}
function tsChoose(i){const scen=TS_SCENARIOS.find(s=>s.id===tsState.scenarioId);const node=scen.nodes[tsState.currentNode];const choice=node.choices[i];document.querySelectorAll('.ts-choice').forEach((el,j)=>{el.classList.add(j===i?(choice.ok?'ch-ok':'ch-bad'):'disabled');el.onclick=null;});tsState.totalPoints=Math.max(0,tsState.totalPoints+(choice.pts||0));document.getElementById('ts-step-log').innerHTML+='<div class="ts-log-item">'+(choice.ok?'✅':'❌')+' '+esc(choice.text)+' ('+(choice.pts>=0?'+':'')+choice.pts+' очков)</div>';document.getElementById('ts-game-score').textContent='Очки: '+tsState.totalPoints;setTimeout(()=>{tsState.currentNode=choice.next;tsRenderNode(scen,choice.next);},900);}
function tsEndScenario(scen){document.getElementById('ts-end').style.display='block';const pts=Math.min(100,Math.max(0,tsState.totalPoints));document.getElementById('ts-end-score').textContent=pts;tsScores[scen.id]=pts;lsSet('ts_scores',tsScores);recordSkillEvent({source:'troubleshooting',topic:scen.topic||'',skill:'Troubleshooting',score:pts,possible:100});}
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
    '<div class="code-opts">'+t.opts.map((o,i)=>'<button type="button" class="code-opt'+(done!==undefined?' disabled':'')+'" id="labopt-'+t.id+'-'+i+'" onclick="pickLab('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></button>').join('')+'</div>'+
    '<div class="code-fix" id="labfix-'+t.id+'">🔧 '+esc(t.bug)+'\n\n✅ '+esc(t.fix)+'</div></div>';
  }).join('');Object.entries(labsDone).forEach(([id,chosen])=>applyLabState(parseInt(id),chosen));updateLabsProg();
}
function applyLabState(id,chosen){const t=LABS_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#lab-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('labfix-'+id).style.display='block';}
function pickLab(tid,chosen){if(labsDone[tid]!==undefined) return;const task=LABS_TASKS.find(t=>t.id===tid);labsDone[tid]=chosen;lsSet('labs_prog',labsDone);recordTrainerResult('lab',task?.topic||'',!!task&&task.answer===chosen,'Debugging');applyLabState(tid,chosen);updateLabsProg();}
function updateLabsProg(){const done=Object.keys(labsDone).length;const ok=Object.entries(labsDone).filter(([id,c])=>LABS_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('labs-pb').style.width=(done/LABS_TASKS.length*100)+'%';document.getElementById('labs-score-lbl').textContent=ok+' / '+LABS_TASKS.length+' правильно';}

// ═══ COMMAND BUILDER ═══
let cmdDone={}, cmdMuscleIdx=0, cmdMuscleQs=[];
function renderCmd(){cmdDone=lsGet('cmd_prog',{});const L=['A','B','C','D'];document.getElementById('cmd-container').innerHTML='<div style="margin-bottom:12px"><button class="btn btn-outline btn-sm" onclick="startCmdMuscle()">💪 Muscle Memory (ввод команд)</button></div>'+CMD_TASKS.map((t,idx)=>{const done=cmdDone[t.id];return '<div class="cmd-card" id="cmd-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:11px;font-weight:700;color:var(--text3)">Задача '+(idx+1)+'/40</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅ Верно':'❌ Ошибка')+'</span>':'')+'</div><div class="cmd-task-text">'+esc(t.task)+'</div><div class="cmd-opts">'+t.opts.map((o,i)=>'<button type="button" class="cmd-opt'+(done!==undefined?' disabled':'')+'" id="co-'+t.id+'-'+i+'" onclick="pickCmd('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3)">'+L[i]+'.</span><code>'+esc(o)+'</code></button>').join('')+'</div><div class="cmd-exp" id="cexp-'+t.id+'">'+esc(t.exp)+'</div></div>';}).join('');Object.entries(cmdDone).forEach(([id,chosen])=>applyCmdState(parseInt(id),chosen));updateCmdProg();}
function startCmdMuscle(){cmdMuscleActive=true;cmdMuscleQs=shuffle(CMD_TASKS).slice(0,10);cmdMuscleIdx=0;document.getElementById('cmd-container').innerHTML='<div id="muscle-area"></div>';renderMuscleQ();}
function renderMuscleQ(){if(cmdMuscleIdx>=cmdMuscleQs.length){cmdMuscleActive=false;renderCmd();return;}const t=cmdMuscleQs[cmdMuscleIdx];document.getElementById('muscle-area').innerHTML='<div class="card" style="max-width:600px;margin:0 auto;text-align:center"><div style="font-size:12px;color:var(--text3);margin-bottom:8px">'+(cmdMuscleIdx+1)+' / 10</div><div class="cmd-task-text" style="font-size:15px;margin-bottom:14px">'+esc(t.task)+'</div><input class="form-input" id="muscle-inp" style="width:100%;font-family:JetBrains Mono,monospace;font-size:14px;text-align:center;margin-bottom:10px" placeholder="Введите команду..." onkeydown="if(event.key===\'Enter\')checkMuscle()"><button class="btn btn-primary" onclick="checkMuscle()">Проверить</button><div id="muscle-fb" style="display:none;margin-top:12px"></div><div style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="cmdMuscleIdx++;renderMuscleQ()">Пропустить</button></div></div>';setTimeout(()=>document.getElementById('muscle-inp')?.focus(),100);}
function normalizeCommand(command){return command.trim().replace(/\s+/g,' ');}
function checkMuscle(){const inp=document.getElementById('muscle-inp');const fb=document.getElementById('muscle-fb');const t=cmdMuscleQs[cmdMuscleIdx];const correct=t.opts[t.answer];const userCmd=normalizeCommand(inp.value);const ok=userCmd===normalizeCommand(correct);fb.style.display='block';if(ok){fb.innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно!</span>';if(cmdDone[t.id]===undefined){cmdDone[t.id]=t.answer;lsSet('cmd_prog',cmdDone);}}else{fb.innerHTML='<span style="color:var(--red);font-weight:700">❌ Правильно:</span><br><code style="color:var(--green)">'+esc(correct)+'</code><br><div style="font-size:12px;color:var(--text2);margin-top:4px">💡 '+esc(t.exp)+'</div>';}recordTrainerResult('command-muscle','Linux',ok,'Commands');inp.disabled=true;setTimeout(()=>{cmdMuscleIdx++;renderMuscleQ();},ok?800:2000);}
function applyCmdState(id,chosen){const t=CMD_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#cmd-'+id+' .cmd-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('cexp-'+id).style.display='block';}
function pickCmd(tid,chosen){if(cmdDone[tid]!==undefined) return;const task=CMD_TASKS.find(t=>t.id===tid);cmdDone[tid]=chosen;lsSet('cmd_prog',cmdDone);recordTrainerResult('command','Linux',!!task&&task.answer===chosen,'Commands');applyCmdState(tid,chosen);updateCmdProg();}
function updateCmdProg(){const done=Object.keys(cmdDone).length;const ok=Object.entries(cmdDone).filter(([id,c])=>CMD_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('cmd-progress-fill').style.width=(done/CMD_TASKS.length*100)+'%';document.getElementById('cmd-score-display').textContent=ok+' / '+CMD_TASKS.length+' правильно';}

// ═══ CODE REVIEWER ═══
let codeDone={};
function renderCode(){codeDone=lsGet('code_prog',{});const L=['A','B','C','D'];document.getElementById('code-container').innerHTML=CODE_TASKS.map((t,idx)=>{const done=codeDone[t.id];const tool=t.tool==='Terraform'?'tag-tf':'tag-ans';const hlCode=t.tool==='Terraform'?highlightHCL(t.code):highlightYAML(t.code);const hlFix=t.tool==='Terraform'?highlightHCL(t.fix):highlightYAML(t.fix);return '<div class="code-card" id="code-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag '+tool+'">'+t.tool+'</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(idx+1)+'/15</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-question">🔍 Найдите ошибку в этом коде:</div><div class="code-block">'+hlCode+'</div><div class="code-opts">'+t.opts.map((o,i)=>'<button type="button" class="code-opt'+(done!==undefined?' disabled':'')+'" id="codeopt-'+t.id+'-'+i+'" onclick="pickCode('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></button>').join('')+'</div><div class="code-fix" id="cfix-'+t.id+'">✅ Исправление:\n'+hlFix+'</div></div>';}).join('');Object.entries(codeDone).forEach(([id,chosen])=>applyCodeState(parseInt(id),chosen));updateCodeProg();}
function applyCodeState(id,chosen){const t=CODE_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#code-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('cfix-'+id).style.display='block';}
function pickCode(tid,chosen){if(codeDone[tid]!==undefined) return;const task=CODE_TASKS.find(t=>t.id===tid);codeDone[tid]=chosen;lsSet('code_prog',codeDone);recordTrainerResult('code',task?.tool||'',!!task&&task.answer===chosen,'Code review');applyCodeState(tid,chosen);updateCodeProg();}
function updateCodeProg(){const done=Object.keys(codeDone).length;const ok=Object.entries(codeDone).filter(([id,c])=>CODE_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('code-progress-fill').style.width=(done/CODE_TASKS.length*100)+'%';document.getElementById('code-score-display').textContent=ok+' / '+CODE_TASKS.length+' правильно';}

// ═══ ANSIBLE TRAINER ═══
let ansDone={};
function renderAnsible(){ansDone=lsGet('ans_prog',{});const L=['A','B','C','D'];document.getElementById('ans-container').innerHTML=ANSIBLE_PB_TASKS.map(t=>{const done=ansDone[t.id];return '<div class="code-card" id="ans-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-ans">Ansible</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(ANSIBLE_PB_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-question">📋 Задача: '+esc(t.task)+'</div><div class="code-block">'+highlightYAML(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 Найдите ошибку:</div><div class="code-opts">'+t.opts.map((o,i)=>'<button type="button" class="code-opt'+(done!==undefined?' disabled':'')+'" id="ansopt-'+t.id+'-'+i+'" onclick="pickAns('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></button>').join('')+'</div><div class="code-fix" id="afix-'+t.id+'">✅ Исправление:\n'+highlightYAML(t.fix)+'</div></div>';}).join('');Object.entries(ansDone).forEach(([id,chosen])=>applyAnsState(parseInt(id),chosen));updateAnsProg();}
function applyAnsState(id,chosen){const t=ANSIBLE_PB_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#ans-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('afix-'+id).style.display='block';}
function pickAns(tid,chosen){if(ansDone[tid]!==undefined) return;const task=ANSIBLE_PB_TASKS.find(t=>t.id===tid);ansDone[tid]=chosen;lsSet('ans_prog',ansDone);recordTrainerResult('ansible','Ansible',!!task&&task.answer===chosen,'Code review');applyAnsState(tid,chosen);updateAnsProg();}
function updateAnsProg(){const done=Object.keys(ansDone).length;const ok=Object.entries(ansDone).filter(([id,c])=>ANSIBLE_PB_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('ans-pb').style.width=(done/ANSIBLE_PB_TASKS.length*100)+'%';document.getElementById('ans-score-lbl').textContent=ok+' / '+ANSIBLE_PB_TASKS.length+' правильно';}

// ═══ DOCKERFILE TRAINER ═══
let dfDone={};
function renderDockerfile(){dfDone=lsGet('df_prog',{});const L=['A','B','C','D'];document.getElementById('df-container').innerHTML=DOCKERFILE_TASKS.map(t=>{const done=dfDone[t.id];return '<div class="code-card" id="df-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-docker">Docker</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(DOCKERFILE_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-block">'+highlightDockerfile(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 В чём проблема?</div><div class="code-opts">'+t.opts.map((o,i)=>'<button type="button" class="code-opt'+(done!==undefined?' disabled':'')+'" id="dfopt-'+t.id+'-'+i+'" onclick="pickDf('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></button>').join('')+'</div><div class="code-fix" id="dfix-'+t.id+'">✅ Правильный вариант:\n'+esc(t.fix)+'</div></div>';}).join('');Object.entries(dfDone).forEach(([id,chosen])=>applyDfState(parseInt(id),chosen));updateDfProg();}
function applyDfState(id,chosen){const t=DOCKERFILE_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#df-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('dfix-'+id).style.display='block';}
function pickDf(tid,chosen){if(dfDone[tid]!==undefined) return;const task=DOCKERFILE_TASKS.find(t=>t.id===tid);dfDone[tid]=chosen;lsSet('df_prog',dfDone);recordTrainerResult('dockerfile','Docker',!!task&&task.answer===chosen,'Code review');applyDfState(tid,chosen);updateDfProg();}
function updateDfProg(){const done=Object.keys(dfDone).length;const ok=Object.entries(dfDone).filter(([id,c])=>DOCKERFILE_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('df-pb').style.width=(done/DOCKERFILE_TASKS.length*100)+'%';document.getElementById('df-score-lbl').textContent=ok+' / '+DOCKERFILE_TASKS.length+' правильно';}

// ═══ K8S TRAINER ═══
let k8sDone={};
function renderK8s(){k8sDone=lsGet('k8s_prog',{});const L=['A','B','C','D'];document.getElementById('k8s-container').innerHTML=K8S_TASKS.map(t=>{const done=k8sDone[t.id];return '<div class="code-card" id="k8sc-'+t.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap"><span class="tag tag-k8s">K8s</span><span style="font-size:14px;font-weight:700">'+esc(t.title)+'</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">'+(K8S_TASKS.indexOf(t)+1)+'/10</span>'+(done!==undefined?'<span style="color:'+(done===t.answer?'var(--green)':'var(--red)')+'">'+(done===t.answer?'✅':'❌')+'</span>':'')+'</div><div class="code-block">'+highlightYAML(t.code)+'</div><div class="code-question" style="color:var(--red)">🔍 В чём проблема?</div><div class="code-opts">'+t.opts.map((o,i)=>'<button type="button" class="code-opt'+(done!==undefined?' disabled':'')+'" id="k8sopt-'+t.id+'-'+i+'" onclick="pickK8s('+t.id+','+i+')"><span style="font-weight:700;color:var(--text3);flex-shrink:0">'+L[i]+'.</span><span>'+esc(o)+'</span></button>').join('')+'</div><div class="code-fix" id="k8sfix-'+t.id+'">✅ Исправление:\n'+highlightYAML(t.fix)+'</div></div>';}).join('');Object.entries(k8sDone).forEach(([id,chosen])=>applyK8sState(parseInt(id),chosen));updateK8sProg();}
function applyK8sState(id,chosen){const t=K8S_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#k8sc-'+id+' .code-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong');});document.getElementById('k8sfix-'+id).style.display='block';}
function pickK8s(tid,chosen){if(k8sDone[tid]!==undefined) return;const task=K8S_TASKS.find(t=>t.id===tid);k8sDone[tid]=chosen;lsSet('k8s_prog',k8sDone);recordTrainerResult('k8s','Kubernetes',!!task&&task.answer===chosen,'Code review');applyK8sState(tid,chosen);updateK8sProg();}
function updateK8sProg(){const done=Object.keys(k8sDone).length;const ok=Object.entries(k8sDone).filter(([id,c])=>K8S_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('k8s-pb').style.width=(done/K8S_TASKS.length*100)+'%';document.getElementById('k8s-score-lbl').textContent=ok+' / '+K8S_TASKS.length+' правильно';}

// ═══ PORTS TRAINER ═══
let ptDone={},ptCurrent={};
function renderPorts(){ptDone=lsGet('pt_prog',{});ptCurrent={};renderPortQ();}
function renderPortQ(){const undone=PORTS_TASKS.filter(p=>!ptDone[p.id]);if(!undone.length){document.getElementById('pt-container').innerHTML='<div class="empty-state"><div class="icon">🏆</div><p>Все порты выучены!</p><button class="btn btn-primary" onclick="lsSet(\'pt_prog\',{});renderPorts();">🔄 Начать заново</button></div>';updatePtProg();return;}const q=undone[Math.floor(Math.random()*undone.length)];ptCurrent=q;document.getElementById('pt-container').innerHTML='<div class="card" style="text-align:center;max-width:450px;margin:0 auto"><div style="font-size:11px;color:var(--text3);margin-bottom:8px">Укажите порт</div><div style="font-size:28px;font-weight:800;margin-bottom:4px;color:var(--primary-h)">'+esc(q.service)+'</div><div style="font-size:12px;color:var(--text3);margin-bottom:16px">'+esc(q.proto||'TCP')+'</div><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:14px"><input class="form-input" id="pt-inp" type="number" placeholder="Порт" style="width:120px;text-align:center;font-size:18px;font-family:JetBrains Mono,monospace" onkeydown="if(event.key===\'Enter\')checkPort()"><button class="btn btn-primary" onclick="checkPort()">✓</button></div><div id="pt-feedback" style="display:none;margin-top:10px"></div><div style="margin-top:14px"><button class="btn btn-outline btn-sm" onclick="skipPort()">Пропустить</button></div></div>';setTimeout(()=>document.getElementById('pt-inp')?.focus(),100);updatePtProg();}
function checkPort(){const inp=document.getElementById('pt-inp');const fb=document.getElementById('pt-feedback');const val=parseInt(inp.value);const correct=ptCurrent.port;const ok=val===correct;recordTrainerResult('ports','Сети',ok,'Ports');if(ok){ptDone[ptCurrent.id]=1;lsSet('pt_prog',ptDone);fb.style.display='block';fb.innerHTML='<span style="color:var(--green);font-weight:700">✅ Верно! '+correct+'</span>';updatePtProg();setTimeout(renderPortQ,800);}else{fb.style.display='block';fb.innerHTML='<span style="color:var(--red);font-weight:700">❌ '+ptCurrent.service+' → порт <b>'+correct+'</b>, не '+val+'</span>';inp.value='';inp.focus();}}
function skipPort(){const fb=document.getElementById('pt-feedback');fb.style.display='block';fb.innerHTML='<span style="color:var(--yellow)">💡 '+ptCurrent.service+' → порт <b>'+ptCurrent.port+'</b></span>';setTimeout(renderPortQ,1200);}
function updatePtProg(){const done=Object.keys(ptDone).length;document.getElementById('pt-pb').style.width=(done/PORTS_TASKS.length*100)+'%';document.getElementById('pt-score-lbl').textContent=done+' / '+PORTS_TASKS.length+' портов';}

// ═══ GIT TRAINER ═══
let gitDone={};
function renderGit(){gitDone=lsGet('git_prog',{});const L=['A','B','C','D'];document.getElementById('git-container').innerHTML=GIT_TASKS.map(t=>{const done=gitDone[t.id];return '<div class="git-card" id="gt-'+t.id+'"><div class="git-num">Задача #'+t.id+'</div><div class="git-task">'+esc(t.task)+'</div><div class="git-opts">'+t.opts.map((o,i)=>'<button type="button" class="git-opt'+(done!==undefined?' disabled':'')+'" id="go-'+t.id+'-'+i+'" onclick="pickGit('+t.id+','+i+')"><span style="font-weight:600;margin-right:8px;color:var(--text3)">'+L[i]+')</span>'+esc(o)+'</button>').join('')+'</div><div class="git-exp" id="gexp-'+t.id+'">💡 '+esc(t.exp)+'</div></div>';}).join('');Object.entries(gitDone).forEach(([id,c])=>applyGitState(parseInt(id),c));updateGitProg();}
function applyGitState(id,chosen){const t=GIT_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#gt-'+id+' .git-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong-pick');});document.getElementById('gexp-'+id).style.display='block';}
function pickGit(tid,chosen){if(gitDone[tid]!==undefined) return;const task=GIT_TASKS.find(t=>t.id===tid);gitDone[tid]=chosen;lsSet('git_prog',gitDone);recordTrainerResult('git','Git',!!task&&task.answer===chosen);applyGitState(tid,chosen);updateGitProg();}
function updateGitProg(){const done=Object.keys(gitDone).length;const ok=Object.entries(gitDone).filter(([id,c])=>GIT_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('git-pb').style.width=(done/GIT_TASKS.length*100)+'%';document.getElementById('git-score-lbl').textContent=ok+' / '+GIT_TASKS.length+' правильно';}

// ═══ REGEX TRAINER ═══
let rxDone={};
function renderRegex(){rxDone=lsGet('regex_prog',{});const L=['A','B','C','D'];document.getElementById('rx-container').innerHTML=REGEX_TASKS.map(t=>{const done=rxDone[t.id];return '<div class="rx-card" id="rx-'+t.id+'"><div class="rx-num">Задача #'+t.id+'</div><div class="rx-task">'+esc(t.task)+'</div>'+(t.context?'<div class="rx-ctx">$ '+esc(t.context)+'</div>':'')+'<div class="rx-opts">'+t.opts.map((o,i)=>'<button type="button" class="rx-opt'+(done!==undefined?' disabled':'')+'" id="ro-'+t.id+'-'+i+'" onclick="pickRx('+t.id+','+i+')"><span style="font-weight:600;margin-right:8px;color:var(--text3)">'+L[i]+')</span>'+esc(o)+'</button>').join('')+'</div><div class="rx-exp" id="rexp-'+t.id+'">💡 '+esc(t.exp)+'</div></div>';}).join('');Object.entries(rxDone).forEach(([id,c])=>applyRxState(parseInt(id),c));updateRxProg();}
function applyRxState(id,chosen){const t=REGEX_TASKS.find(x=>x.id===id);if(!t) return;document.querySelectorAll('#rx-'+id+' .rx-opt').forEach((el,i)=>{el.classList.add('disabled');if(i===t.answer)el.classList.add('correct');else if(i===chosen)el.classList.add('wrong-pick');});document.getElementById('rexp-'+id).style.display='block';}
function pickRx(tid,chosen){if(rxDone[tid]!==undefined) return;const task=REGEX_TASKS.find(t=>t.id===tid);rxDone[tid]=chosen;lsSet('regex_prog',rxDone);recordTrainerResult('regex','Regex',!!task&&task.answer===chosen);applyRxState(tid,chosen);updateRxProg();}
function updateRxProg(){const done=Object.keys(rxDone).length;const ok=Object.entries(rxDone).filter(([id,c])=>REGEX_TASKS.find(t=>t.id===parseInt(id))?.answer===c).length;document.getElementById('rx-pb').style.width=(done/REGEX_TASKS.length*100)+'%';document.getElementById('rx-score-lbl').textContent=ok+' / '+REGEX_TASKS.length+' правильно';}

// ═══ TIPS ═══
function renderTips(){document.getElementById('tips-container').innerHTML=TIPS.map((t,i)=>'<div class="tip-card"><button type="button" class="tip-header" onclick="toggleTip('+i+')"><span>💡 '+esc(t.title)+'</span><span id="ta-'+i+'">▼</span></button><div class="tip-body" id="tb-'+i+'">'+esc(t.body)+'</div></div>').join('');}
function toggleTip(i){const b=document.getElementById('tb-'+i);const a=document.getElementById('ta-'+i);b.classList.toggle('open');a.textContent=b.classList.contains('open')?'▲':'▼';}

// ═══ BEST PRACTICES ═══
function getBestPracticeTopics(){return Array.isArray(BEST_PRACTICES?.topics)?BEST_PRACTICES.topics:[];}
function renderBestPractices(requestedTopic,restoreFocus){
  const topics=getBestPracticeTopics();
  const tabs=document.getElementById('practice-tabs');
  const panel=document.getElementById('practice-panel');
  if(!tabs||!panel) return;
  if(!topics.length){panel.innerHTML='<div class="empty-state"><p>Раздел пока недоступен.</p></div>';return;}
  const selected=topics.find(topic=>topic.topic===(requestedTopic||currentPracticeTopic))||topics[0];
  currentPracticeTopic=selected.topic;
  document.getElementById('practice-topic-count').textContent=topics.length;
  document.getElementById('practice-card-count').textContent=topics.reduce((sum,topic)=>sum+topic.practices.length,0);
  document.getElementById('practice-reviewed-date').textContent=BEST_PRACTICES.updated||'—';
  tabs.innerHTML=topics.map(topic=>{
    const active=topic.topic===selected.topic;
    return '<button type="button" class="practice-tab" role="tab" id="practice-tab-'+escAttr(topic.slug)+'" aria-controls="practice-panel" aria-selected="'+active+'" tabindex="'+(active?'0':'-1')+'" data-practice-topic="'+escAttr(topic.topic)+'"><span aria-hidden="true">'+esc(topic.icon)+'</span><span>'+esc(topic.topic)+'</span></button>';
  }).join('');
  tabs.querySelectorAll('[data-practice-topic]').forEach(button=>{
    button.addEventListener('click',()=>renderBestPractices(button.dataset.practiceTopic,true));
    button.addEventListener('keydown',movePracticeTab);
  });

  panel.setAttribute('aria-labelledby','practice-tab-'+selected.slug);
  panel.innerHTML='<div class="practice-panel-head"><div class="practice-topic-icon" aria-hidden="true">'+esc(selected.icon)+'</div><div><div class="practice-kicker">Проверенный рабочий подход</div><h2>'+esc(selected.topic)+'</h2><p>'+esc(selected.summary)+'</p></div></div>'+
    '<div class="practice-grid">'+selected.practices.map((practice,index)=>
      '<article class="practice-card"><div class="practice-card-number">'+String(index+1).padStart(2,'0')+'</div><h3>'+esc(practice.title)+'</h3><p class="practice-why">'+esc(practice.why)+'</p><div class="practice-action"><span>Применить</span><p>'+esc(practice.action)+'</p></div></article>'
    ).join('')+'</div>'+
    '<div class="practice-footer"><div><strong>'+selected.practices.length+' практик</strong><span> · ревизия '+esc(BEST_PRACTICES.updated||'—')+'</span></div><button type="button" class="btn btn-primary" id="practice-trainer" data-topic="'+escAttr(selected.topic)+'" data-page="'+escAttr(selected.trainer||'exam')+'">Перейти к практике →</button></div>';
  document.getElementById('practice-trainer').addEventListener('click',startPracticeTraining);
  if(restoreFocus) requestAnimationFrame(()=>document.getElementById('practice-tab-'+selected.slug)?.focus());
}
function movePracticeTab(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const buttons=[...document.querySelectorAll('#practice-tabs [role="tab"]')];
  const current=buttons.indexOf(event.currentTarget);
  let next=event.key==='Home'?0:event.key==='End'?buttons.length-1:current+(event.key==='ArrowRight'?1:-1);
  next=(next+buttons.length)%buttons.length;
  buttons[next].click();
}
function startPracticeTraining(event){
  const topic=event.currentTarget.dataset.topic;
  const page=event.currentTarget.dataset.page;
  if(page!=='exam'){nav(page);return;}
  currentTopic=topic;currentLevel='all';currentCategory='all';currentMode='all';currentView='standard';
  nav('exam');
}


// ═══ CUSTOM Q ═══
function openCustomModal(){
  // Заполняем список тем динамически
  const sel = document.getElementById('cq-topic');
  sel.innerHTML = getAllTopics().map(t => '<option>'+esc(t)+'</option>').join('');
  openAccessibleModal('custom-modal','#cq-topic');
}
function closeCustomModal(){closeAccessibleModal('custom-modal');}
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
  // ID по всей базе (не только custom), уводим custom в диапазон 900000+
  const allQ=getAllQ();
  const maxId = allQ.reduce((max, q) => Math.max(max, q.id||0), 900000);
  const newId = maxId + 1;
  customs.push({
    id: newId,
    topic: document.getElementById('cq-topic').value,
    level: document.getElementById('cq-level').value,
    q, options: opts,
    answer: ansIdx,
    explanation: document.getElementById('cq-exp').value.trim(),
    category: document.getElementById('cq-category').value
  });
  if(!lsSet('custom',customs)){alert('Не удалось сохранить вопрос: хранилище браузера недоступно или заполнено.');return;}
  closeCustomModal();
  buildTopicFilters();
  document.getElementById('sb-counter').textContent='DevOps Edition · '+getAllQ().length+' вопросов';
  if(pageActive('exam')){resetQuestionRenderLimit();renderQuestions();}else renderHome();
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
function renderCheatSheet(){
  const tabs=Object.keys(CHEAT_SHEETS);
  const tabList=document.getElementById('cheat-tabs');
  tabList.innerHTML=tabs.map(k=>'<button type="button" class="chip'+(k===cheatTab?' active':'')+'" data-cheat-tab="'+k+'" aria-pressed="'+(k===cheatTab)+'">'+CHEAT_SHEETS[k].icon+' '+CHEAT_SHEETS[k].title+'</button>').join('');
  tabList.querySelectorAll('[data-cheat-tab]').forEach(button=>button.addEventListener('click',()=>{
    cheatTab=button.dataset.cheatTab;renderCheatSheet();
    requestAnimationFrame(()=>document.querySelector('[data-cheat-tab="'+cheatTab+'"]')?.focus());
  }));
  document.getElementById('cheat-content').innerHTML=CHEAT_SHEETS[cheatTab].content;
}
function openCheatSheet(){renderCheatSheet();openAccessibleModal('cheatsheet-modal','.btn-icon');}
function closeCheatSheet(){closeAccessibleModal('cheatsheet-modal');}
document.getElementById('cheatsheet-modal').addEventListener('click',function(e){if(e.target===this)closeCheatSheet();});

// ═══ BLITZ MODE (с data-атрибутами вместо regex) ═══
let blitzState={questions:[],idx:0,score:0,timeLeft:300,timer:null,active:false,deadline:0};
function startBlitz(){
  const allQ=getAllQ();if(allQ.length<20){alert('Нужно минимум 20 вопросов');return;}
  blitzState.questions=shuffle(allQ).slice(0,20);
  nav('exam');
  blitzState.idx=0;blitzState.score=0;blitzState.timeLeft=300;blitzState.active=true;blitzState.deadline=Date.now()+300*1000;
  document.getElementById('exam-controls').style.display='none';
  document.getElementById('progress-info').style.display='none';
  document.getElementById('seg-bar').style.display='none';
  renderBlitzQ();blitzState.timer=setInterval(blitzTick,1000);
}
function blitzTick(){
  if(!blitzState.active) return;
  blitzState.timeLeft=secondsUntil(blitzState.deadline);
  const tEl=document.getElementById('blitz-timer');
  if(tEl){tEl.textContent=Math.floor(blitzState.timeLeft/60)+':'+('0'+(blitzState.timeLeft%60)).slice(-2);if(blitzState.timeLeft<=30)tEl.style.color='var(--red)';}
  if(blitzState.timeLeft<=0)endBlitz();
}
function renderBlitzQ(){
  if(blitzState.idx>=blitzState.questions.length){endBlitz();return;}
  const q=blitzState.questions[blitzState.idx];const L=['A','B','C','D'];const opts=q.options||[];
  const order=[...Array(opts.length).keys()];for(let i=order.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[order[i],order[j]]=[order[j],order[i]];}
  questionStartTime[q.id]=Date.now();
  document.getElementById('questions-container').innerHTML=
    '<div style="background:var(--bg2);border:2px solid var(--primary);border-radius:14px;padding:24px;max-width:700px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'+
    '<div style="display:flex;gap:6px">'+ttag(q.topic)+ltag(q.level)+'</div>'+
    '<div style="font-size:18px;font-weight:800" id="blitz-timer" role="timer" aria-label="Осталось времени на блиц">'+Math.floor(blitzState.timeLeft/60)+':'+('0'+(blitzState.timeLeft%60)).slice(-2)+'</div>'+
    '<div style="font-size:13px;color:var(--text2)">Вопрос '+(blitzState.idx+1)+'/20</div></div>'+
    '<div class="q-text" style="font-size:16px;margin-bottom:20px">'+esc(q.q)+'</div>'+
    '<div class="q-options">'+
    order.map((origIdx,visPos)=>'<button type="button" class="q-opt" id="blitz-opt-'+visPos+'" data-orig-idx="'+origIdx+'" data-answer="'+q.answer+'" onclick="blitzPick('+q.id+','+origIdx+','+q.answer+')"><span class="opt-letter">'+L[visPos]+'</span><span>'+esc(opts[origIdx])+'</span></button>').join('')+
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
  const respTime=questionStartTime[qid]?Math.round((Date.now()-questionStartTime[qid])/1000):0;
  recordQuestionResult(q,{outcome:ok?'pass':'fail',source:'blitz',responseSeconds:respTime,history:true});
}
function blitzNext(){blitzState.idx++;blitzState.active=true;if(blitzState.idx>=blitzState.questions.length){endBlitz();return;}renderBlitzQ();}
function endBlitz(){
  clearInterval(blitzState.timer);blitzState.timer=null;blitzState.active=false;blitzState.deadline=0;
  restoreExamControls();
  const s=blitzState.score,total=blitzState.questions.length;
  const grade=s>=18?'🏆 Отлично!':s>=14?'👍 Хорошо':s>=10?'📚 Удовлетворительно':'💪 Нужно подтянуть';
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:40px 20px"><div style="font-size:60px;margin-bottom:10px">'+(s>=18?'🏆':s>=14?'🎯':s>=10?'📚':'💪')+'</div><div style="font-size:28px;font-weight:800;margin-bottom:8px">Блиц завершён!</div><div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:12px">'+s+' / '+total+'</div><div style="font-size:16px;color:var(--text2);margin-bottom:20px">'+grade+'</div><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" onclick="startBlitz()">🔄 Ещё блиц</button><button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
  document.getElementById('single-controls').style.display='none';
}

// ═══ DIAGNOSTIC TEST ═══
let diagnosticState={questions:[], idx:0, answers:[], active:false};
function startDiagnostic(){
  const allQ=getAllQ();
  const topics=['Linux','Docker','Kubernetes','CI/CD','Terraform','Ansible','Сети','Monitoring','Security'];
  const perTopic=[];topics.forEach(t=>{const qs=allQ.filter(q=>q.topic===t);for(let i=0;i<Math.min(3,qs.length);i++)perTopic.push(qs[Math.floor(Math.random()*qs.length)]);});
  diagnosticState.questions=shuffle(perTopic).slice(0,15);
  diagnosticState.idx=0;diagnosticState.answers=[];diagnosticState.active=true;
  nav('exam');
  document.getElementById('exam-controls').style.display='none';
  document.getElementById('progress-info').style.display='block';
  document.getElementById('seg-bar').style.display='none';
  document.getElementById('single-controls').style.display='none';
  renderDiagnosticQ();
}
function renderDiagnosticQ(){
  if(diagnosticState.idx>=diagnosticState.questions.length){endDiagnostic();return;}
  const q=diagnosticState.questions[diagnosticState.idx];questionStartTime[q.id]=Date.now();
  const opts=(q.options||[]);const L=['A','B','C','D','E'];
  const order=[...Array(opts.length).keys()];
  for(let i=order.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[order[i],order[j]]=[order[j],order[i]];}
  document.getElementById('progress-info').innerHTML='<span style="font-size:12px;color:var(--text2)">🔬 Диагностика: вопрос <b>'+(diagnosticState.idx+1)+'</b> / 15</span>';
  document.getElementById('questions-container').innerHTML=
    '<div class="q-card" style="border:2px solid var(--primary);max-width:700px;margin:0 auto">'+
    '<div class="q-meta">'+ttag(q.topic)+ltag(q.level||'Middle')+'<span class="q-num">#'+q.id+'</span></div>'+
    '<div class="q-text">'+esc(q.q)+'</div>'+
    '<div class="q-options">'+
    order.map((origIdx,visPos)=>'<button type="button" class="q-opt" id="dx-opt-'+visPos+'" data-orig-idx="'+origIdx+'" data-answer="'+q.answer+'" onclick="diagnosticPick('+q.id+','+origIdx+','+q.answer+')"><span class="opt-letter">'+L[visPos]+'</span><span>'+esc(opts[origIdx])+'</span></button>').join('')+
    '</div><div id="dx-exp-'+q.id+'" style="display:none" class="q-explanation"></div>'+
    '<div style="text-align:center;margin-top:14px;display:none" id="dx-next-btn"><button class="btn btn-primary" onclick="diagnosticNext()">Следующий →</button></div></div>';
}
function diagnosticPick(qid,chosen,correct){
  const ok=chosen===correct;diagnosticState.answers.push({qid,ok,topic:diagnosticState.questions[diagnosticState.idx].topic});
  const opts=document.querySelectorAll('#questions-container .q-opt');
  opts.forEach(o=>{o.classList.add('disabled');const oi=parseInt(o.getAttribute('data-orig-idx'));if(oi===correct)o.classList.add('correct-opt');else if(oi===chosen)o.classList.add('wrong-opt');});
  const q=diagnosticState.questions[diagnosticState.idx];
  const el=document.getElementById('dx-exp-'+qid);
  if(el&&q.explanation){el.innerHTML='💡 '+esc(q.explanation);el.style.display='block';}
  const nextBtn=document.getElementById('dx-next-btn');if(nextBtn)nextBtn.style.display='block';
  const responseSeconds=questionStartTime[qid]?Math.round((Date.now()-questionStartTime[qid])/1000):0;
  recordQuestionResult(q,{outcome:ok?'pass':'fail',source:'diagnostic',responseSeconds,history:false});
}
function diagnosticNext(){diagnosticState.idx++;renderDiagnosticQ();}
function endDiagnostic(){
  diagnosticState.active=false;
  restoreExamControls();
  const total=diagnosticState.answers.length;
  const ok=diagnosticState.answers.filter(a=>a.ok).length;
  const pct=Math.round(ok/total*100);
  const byTopic={};diagnosticState.answers.forEach(a=>{if(!byTopic[a.topic])byTopic[a.topic]={total:0,ok:0};byTopic[a.topic].total++;if(a.ok)byTopic[a.topic].ok++;});
  const level=pct>=80?'Middle+ / Senior':pct>=50?'Middle':'Junior+';
  lsSet('diagnostic_result',{date:new Date().toISOString(),total,ok,pct,byTopic,level});
  document.getElementById('questions-container').innerHTML=
    '<div style="text-align:center;padding:30px 20px;max-width:800px;margin:0 auto">'+
    '<div style="font-size:48px;margin-bottom:8px">🔬</div>'+
    '<div style="font-size:24px;font-weight:800;margin-bottom:4px">Диагностика завершена</div>'+
    '<div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:6px">'+pct+'%</div>'+
    '<div style="font-size:18px;font-weight:700;margin-bottom:16px;color:'+(pct>=80?'var(--green)':pct>=50?'var(--yellow)':'var(--red)')+'">Уровень: '+level+'</div>'+
    '<div class="card" style="text-align:left;margin-bottom:14px"><div class="card-title">📊 Профиль по темам</div>'+
    Object.entries(byTopic).sort((a,b)=>a[1].ok/a[1].total-b[1].ok/b[1].total).map(([t,d])=>{
      const tp=Math.round(d.ok/d.total*100);const barClr=tp>=80?'var(--green)':tp>=50?'var(--yellow)':'var(--red)';
      return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">'+esc(t)+'</span><span style="color:var(--text2)">'+d.ok+'/'+d.total+' ('+tp+'%)</span></div><div style="height:6px;background:var(--bg3);border-radius:3px"><div style="height:100%;width:'+tp+'%;background:'+barClr+';border-radius:3px"></div></div></div>';
    }).join('')+'</div>'+
    '<div style="font-size:13px;color:var(--text2);margin-bottom:16px">Рекомендация: '+(pct>=80?'Пробуйте Mock Interview на Middle+/Senior.':pct>=50?'Сфокусируйтесь на слабых темах через вкладку «Учёба».':'Начните с Недели 1 учебного плана и пройдите базовые темы.')+'</div>'+
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="startDiagnostic()">🔄 Пройти заново</button>'+
    '<button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
}

// ═══ EXPORT / IMPORT ═══
const progressIO=typeof IPMaxProgressIO!=='undefined'?IPMaxProgressIO.create({
  version:APP_VERSION,now:()=>Date.now(),dateKey:()=>IPMaxDate.localDateKey(),
  get:(key,fallback)=>lsGet(key,fallback),setMany:entries=>appStorage&&typeof appStorage.setMany==='function'?appStorage.setMany(entries):{ok:false},
  getBaseQuestions:()=>BASE_QUESTIONS,getOnboardingProfile,getSkillEvents,getCoachJournal,getCoachControlSession,
  normaliseProfile:normalizeOnboardingProfile,isSkillEvent:ProgressTracker.isSkillEvent,eventLimit:ProgressTracker.EVENT_LIMIT,
  isJournalEntry:InterviewCoach.isJournalEntry,journalLimit:InterviewCoach.JOURNAL_LIMIT,
  normaliseControlSession:IPMaxAICoach.normaliseControlSession,alert:message=>alert(message),prompt:message=>prompt(message),
  onImported:()=>{
    streak=lsGet('streak_best',0);buildTopicFilters();
    document.getElementById('sb-counter').textContent='DevOps Edition · '+getAllQ().length+' вопросов';nav('home');
  }
}):null;
function requireProgressIO(){if(!progressIO) throw new Error('Модуль импорта и экспорта не загружен.');return progressIO;}
function exportProgress(){return requireProgressIO().exportProgress();}
function importProgress(input){return requireProgressIO().importProgress(input);}
function importProgressText(text){return requireProgressIO().importProgressText(text);}
function importProgressData(data){return requireProgressIO().importProgressData(data);}
function validateProgressImport(data){return requireProgressIO().validateProgressImport(data);}
function pasteProgressFromClipboard(){return requireProgressIO().pasteProgressFromClipboard();}

// ═══ INIT ═══
async function initApp(){
  await loadAllData();

  configureCoachUI();

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

  // Слушаем обновления Service Worker
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(!reg) return;
      reg.addEventListener('updatefound',()=>{
        const newWorker=reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange',()=>{
          if(newWorker.state==='installed'&&navigator.serviceWorker.controller){
            const banner=document.getElementById('update-banner');
            if(banner) banner.style.display='block';
          }
        });
      });
      // Проверяем, есть ли ожидающее обновление
      if(reg.waiting){const banner=document.getElementById('update-banner');if(banner)banner.style.display='block';}
    });
  }

  // Рендерим
  renderHome();

  // Онбординг
  if(!getOnboardingProfile()){
    setTimeout(()=>openAccessibleModal('onboarding-modal','#onb-role'),500);
  }

}

function buildTopicFilters(){
  const topics = getAllTopics();
  const topicChips = document.getElementById('topic-chips');
  if(topicChips){
    topicChips.innerHTML='';
    const allChip=document.createElement('button');allChip.type='button';allChip.className='chip active';allChip.textContent='Все';allChip.onclick=function(){setTopic('all',this);};
    topicChips.appendChild(allChip);
    topics.forEach(t=>{const chip=document.createElement('button');chip.type='button';chip.className='chip';chip.textContent=t;chip.setAttribute('data-topic',t);chip.setAttribute('aria-pressed','false');chip.onclick=function(){setTopic(t,this);};topicChips.appendChild(chip);});
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
  const files=['./','./index.html','./styles.css','./version.js','./date.js','./storage.js','./progress.js','./coach.js','./ai-coach.js','./progress-io.js','./analytics-ui.js','./coach-ui.js','./app.js','./interview-prep-max.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
  const tasks=['base_questions','subnet','ts','cmd','code','git','regex','ansible_pb','dockerfile','k8s','ports','labs','tips','incidents','study_map','study_tests','senior_cases','best_practices'];
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
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(updateReloadPending) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(reg => console.log('SW '+APP_VERSION+':', reg.scope)).catch(err => console.log('SW error:', err));
}

function applyAppUpdate(){
  if(!('serviceWorker' in navigator)){location.reload();return;}
  updateReloadPending=true;
  navigator.serviceWorker.getRegistration().then(reg=>{
    if(reg&&reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    else location.reload();
  }).catch(()=>location.reload());
}

// Запуск
initApp();

function toggleMasteryGrid(){
  const grid=document.getElementById('mastery-cards');
  const btn=document.getElementById('toggle-mastery-btn');
  if(!grid||!btn) return;
  if(grid.style.display==='none'){grid.style.display='';btn.textContent='📋 Скрыть все темы ▲';}
  else{grid.style.display='none';btn.textContent='📋 Все темы ▼';}
}

// ═══ INCIDENT SIMULATION ═══
let incState={incident:null,phase:0,score:0,answers:[]};
function startIncidentSim(){
  if(!INCIDENTS.length){alert("Нет сценариев инцидентов");return;}
  incState.incident=INCIDENTS[Math.floor(Math.random()*INCIDENTS.length)];
  incState.phase=0;incState.score=0;incState.answers=[];
  nav("exam");
  document.getElementById("exam-controls").style.display="none";
  document.getElementById("progress-info").style.display="none";
  document.getElementById("seg-bar").style.display="none";
  document.getElementById("single-controls").style.display="none";
  renderIncidentPhase();
}
function renderIncidentPhase(){
  const inc=incState.incident;if(!inc) return;
  const ph=inc.phases[incState.phase];
  if(!ph){endIncidentSim();return;}
  const L=["A","B","C","D"];const opts=ph.options||[];
  document.getElementById("questions-container").innerHTML=
    '<div class="q-card" style="border:2px solid var(--red);max-width:700px;margin:0 auto">'+
    '<div class="q-meta">'+ttag(inc.topic)+'<span class="tag tag-sr">'+esc(inc.level)+'</span><span class="tag tag-sc">Фаза '+(incState.phase+1)+'/'+inc.phases.length+'</span></div>'+
    '<div style="font-size:14px;font-weight:700;margin-bottom:10px">'+esc(ph.title)+'</div>'+
    '<div class="q-text">'+esc(ph.question)+'</div>'+
    '<div class="q-options">'+
    opts.map((o,i)=>'<button type="button" class="q-opt" id="inc-opt-'+i+'" onclick="incPick('+i+','+ph.answer+')"><span class="opt-letter">'+L[i]+'</span><span>'+esc(o)+'</span></button>').join('')+
    '</div><div id="inc-exp" style="display:none" class="q-explanation"></div>'+
    '<div style="text-align:center;margin-top:14px;display:none" id="inc-next-btn"><button class="btn btn-primary" onclick="incState.phase++;renderIncidentPhase();">Следующая фаза →</button></div></div>';
}
function incPick(chosen,correct){
  const ok=chosen===correct;incState.answers.push({phase:incState.phase,ok});
  if(ok) incState.score++;
  const opts=document.querySelectorAll("#questions-container .q-opt");
  opts.forEach(o=>{o.classList.add("disabled");const oi=parseInt(o.id.split("-").pop());if(oi===correct)o.classList.add("correct-opt");else if(oi===chosen)o.classList.add("wrong-opt");});
  const ph=incState.incident.phases[incState.phase];
  const el=document.getElementById("inc-exp");
  if(el&&ph.explanation){el.innerHTML="💡 "+esc(ph.explanation);el.style.display="block";}
  recordTrainerResult('incident',incState.incident.topic,ok,'Incident response');
  document.getElementById("inc-next-btn").style.display="block";
}
function endIncidentSim(){
  restoreExamControls();
  const total=incState.incident.phases.length;const s=incState.score;
  const grade=s===total?"🏆 Отлично!":s>=total*0.7?"👍 Хорошо":"📚 Нужно подтянуть";
  const phases=["triage","diagnosis","remediation","postmortem"];
  document.getElementById("questions-container").innerHTML=
    '<div style="text-align:center;padding:30px 20px;max-width:700px;margin:0 auto">'+
    '<div style="font-size:48px;margin-bottom:8px">🚨</div>'+
    '<div style="font-size:24px;font-weight:800;margin-bottom:4px">Инцидент разобран</div>'+
    '<div style="font-size:14px;color:var(--text2);margin-bottom:12px">'+esc(incState.incident.title)+'</div>'+
    '<div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:6px">'+s+' / '+total+'</div>'+
    '<div style="font-size:16px;color:var(--text2);margin-bottom:20px">'+grade+'</div>'+
    phases.map((p,i)=>{const a=incState.answers[i];return '<div style="font-size:13px;padding:4px 0">'+(a&&a.ok?"✅":"❌")+' '+p+'</div>';}).join('')+
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">'+
    '<button class="btn btn-primary" onclick="startIncidentSim()">🔄 Другой инцидент</button>'+
    '<button class="btn btn-outline" onclick="nav(\'home\')">🏠 На главную</button></div></div>';
}
