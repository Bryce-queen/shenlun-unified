// ============================================================
// SPACED REPETITION ENGINE (SM-2)
// ============================================================
const SR = {
  KEY:'sl_unified_sr',
  load(){ try{ return JSON.parse(localStorage.getItem(this.KEY))||{}; }catch(e){ return {}; } },
  save(d){ localStorage.setItem(this.KEY,JSON.stringify(d)); },
  initCard(id){
    const d=this.load();
    if(!d[id]){ d[id]={id,ease:2.5,interval:0,repetitions:0,nextReview:0,lastReview:null,totalReviews:0,correctCount:0}; this.save(d); }
    return d[id];
  },
  rate(id,rating){
    const d=this.load(); if(!d[id]) this.initCard(id);
    const c=d[id]; const now=Date.now();
    c.totalReviews++; c.lastReview=now;
    if(rating===1){ c.repetitions=0; c.interval=0; c.ease=Math.max(1.3,c.ease-0.3); c.nextReview=now+10*60*1000; }
    else if(rating===2){ c.repetitions++; c.correctCount++; if(c.repetitions===1)c.interval=1; else if(c.repetitions===2)c.interval=3; else c.interval=Math.round(c.interval*1.2); c.ease=Math.max(1.3,c.ease-0.15); c.nextReview=now+c.interval*24*60*60*1000; }
    else{ c.repetitions++; c.correctCount++; if(c.repetitions===1)c.interval=1; else if(c.repetitions===2)c.interval=6; else c.interval=Math.round(c.interval*c.ease); c.ease+=0.1; c.nextReview=now+c.interval*24*60*60*1000; }
    this.save(d); return c;
  },
  getDueCards(deckFilter){
    const d=this.load(); const now=Date.now();
    return Object.keys(d).filter(id=>{
      if(deckFilter && !deckFilter.some(f=>id.startsWith(f))) return false;
      return d[id].nextReview>0 && d[id].nextReview<=now;
    });
  },
  getNewCards(deckFilter){
    const d=this.load();
    return Object.keys(d).filter(id=>{
      if(deckFilter && !deckFilter.some(f=>id.startsWith(f))) return false;
      return d[id].nextReview===0;
    });
  },
  getMasteredCount(deckFilter){
    const d=this.load();
    return Object.keys(d).filter(id=>{
      if(deckFilter && !deckFilter.some(f=>id.startsWith(f))) return false;
      return d[id].repetitions>=4;
    }).length;
  },
  getStats(deckFilter){
    const d=this.load();
    const cards=Object.keys(d).filter(id=>!deckFilter||deckFilter.some(f=>id.startsWith(f)));
    return {
      total:cards.length,
      mastered:cards.filter(id=>d[id].repetitions>=4).length,
      learning:cards.filter(id=>d[id].repetitions>0&&d[id].repetitions<4).length,
      newCount:cards.filter(id=>d[id].repetitions===0).length
    };
  }
};

// ============================================================
// APP STATE & STORAGE
// ============================================================
const STORE_KEY = 'sl_unified_state';
const BACKUP_VERSION = 1;
const STATE_VERSION = 2;
function loadState(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY))||{}; }catch(e){ return {}; }
}
function saveState(s){ localStorage.setItem(STORE_KEY,JSON.stringify(s)); }

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, char=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[char]));
}

let state = loadState();
state = migrateState(state);
if(!state.studyDates) state.studyDates=[];
if(!state.exerciseResults) state.exerciseResults={};
if(!state.exerciseDrafts) state.exerciseDrafts={};
if(!state.reviewNotes) state.reviewNotes=[];
if(!state.vocabTrainer) state.vocabTrainer={done:0,correct:0,history:{}};
if(!state.materialTrainer) state.materialTrainer={done:0,correct:0,history:{}};
if(!state.mockExams) state.mockExams=[];
if(!state.errors) state.errors=[];
if(!state.dailyTime) state.dailyTime={};
if(state.timerEnabled === undefined) state.timerEnabled=true;
if(!state.startDate) state.startDate=new Date().toISOString().slice(0,10);
state.version = STATE_VERSION;
saveState(state);

function migrateState(nextState){
  const migrated = nextState && typeof nextState === 'object' ? nextState : {};
  if(!migrated.version) migrated.version = 1;
  if(migrated.version < 2){
    if(!migrated.reviewNotes) migrated.reviewNotes=[];
    if(!migrated.vocabTrainer) migrated.vocabTrainer={done:0,correct:0,history:{}};
    if(!migrated.materialTrainer) migrated.materialTrainer={done:0,correct:0,history:{}};
    if(!migrated.mockExams) migrated.mockExams=[];
  }
  migrated.version = STATE_VERSION;
  return migrated;
}

// ============================================================
// VIEW NAVIGATION
// ============================================================
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.tab-bar .tab').forEach(t=>{
    t.classList.toggle('active',t.dataset.view===name);
  });
  // Refresh view content
  if(name==='home') renderHome();
  else if(name==='review') renderReview();
  else if(name==='practice') renderPractice();
  else if(name==='errors') renderErrors();
  else if(name==='stats') renderStats();
}

// ============================================================
// HOME VIEW
// ============================================================
function getCurrentWeek(){
  const start = new Date(state.startDate);
  const now = new Date();
  const diff = Math.floor((now-start)/(7*24*60*60*1000));
  return Math.min(Math.max(diff+1,1),12);
}

function recordStudyDay(){
  const today = new Date().toISOString().slice(0,10);
  if(!state.studyDates.includes(today)){
    state.studyDates.push(today);
    saveState(state);
  }
}

function getStreak(){
  const dates = [...state.studyDates].sort().reverse();
  if(!dates.length) return 0;
  let streak=0;
  const today = new Date().toISOString().slice(0,10);
  let check = new Date();
  // Allow today or yesterday as start
  if(dates[0]!==today && dates[0]!==new Date(check.getTime()-86400000).toISOString().slice(0,10)) return 0;
  for(let i=0;i<365;i++){
    const ds = new Date(check.getTime()-i*86400000).toISOString().slice(0,10);
    if(dates.includes(ds)) streak++;
    else break;
  }
  return streak;
}

function getTodayStudyMinutes(){
  const today = new Date().toISOString().slice(0,10);
  return Math.round((state.dailyTime[today]||0)/60000);
}

function addStudyTime(ms){
  const today = new Date().toISOString().slice(0,10);
  if(!state.dailyTime[today]) state.dailyTime[today]=0;
  state.dailyTime[today]+=ms;
  saveState(state);
}

function renderHome(){
  const week = getCurrentWeek();
  const plan = WEEK_PLAN[week-1];
  const today = new Date().toISOString().slice(0,10);

  // Week card
  const weekCard = document.getElementById('home-week-card');
  weekCard.innerHTML = `
    <div class="week-card">
      <div class="week-label">第 ${week} 周 / 共 12 周</div>
      <div class="week-title">${plan.title}</div>
      <div class="week-phase">${plan.phase==='基础期'?'🟢 基础期':plan.phase==='强化期'?'🟡 强化期':'🔴 冲刺期'}</div>
      <div class="progress-bar"><div class="fill" style="width:${(week/12*100).toFixed(1)}%"></div></div>
    </div>
  `;

  // Quick stats
  const dueCards = SR.getDueCards().length;
  const streak = getStreak();
  const studyMin = getTodayStudyMinutes();
  const errors = state.errors.filter(e=>!e.cleared).length;
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-box"><div class="stat-num">${dueCards}</div><div class="stat-label">待复习卡片</div></div>
    <div class="stat-box"><div class="stat-num">${streak}</div><div class="stat-label">连续天数🔥</div></div>
    <div class="stat-box"><div class="stat-num">${studyMin}</div><div class="stat-label">今日(分钟)</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--danger)">${errors}</div><div class="stat-label">错题数</div></div>
  `;

  // Today's tasks
  const tasks = [];
  plan.skills.forEach(sid=>{
    const skill = findSkill(sid);
    if(skill){
      const done = countSkillDone(sid);
      tasks.push({type:'练习',name:skill.name,desc:`${done}/${skill.exercises.length} 已完成`,sid,kind:'skill'});
    }
  });
  plan.decks.forEach(dk=>{
    const deck = CARD_DB[dk];
    if(deck){
      const stats = SR.getStats([deck.cards[0]?.id?.replace(/\d+$/,'')]);
      const due = SR.getDueCards([deck.cards[0]?.id?.replace(/\d+$/,'')]).length;
      tasks.push({type:'复习',name:deck.name,desc:`${due} 张待复习`,deck:dk,kind:'card'});
    }
  });

  const taskHtml = tasks.map(t=>`
    <div class="task-item" onclick="${t.kind==='skill'?`goToSkill('${t.sid}')`:`goToDeckReview('${t.deck}')`}">
      <div class="task-check ${t.desc.includes('0/') && t.type==='练习' ? '' : 'done'}">${t.desc.includes('0/') && t.type==='练习' ? '' : '✓'}</div>
      <div class="task-info">
        <div class="task-name">${t.name}</div>
        <div class="task-desc">${t.desc}</div>
      </div>
      <span class="tag ${t.type==='练习'?'tag-blue':'tag-yellow'}">${t.type}</span>
    </div>
  `).join('');
  document.getElementById('home-tasks').innerHTML = `<div class="task-list">${taskHtml}</div>`;

  // Start button
  const firstPending = tasks.find(t=>t.type==='练习' && t.desc.includes('0/'));
  document.getElementById('home-start-btn').innerHTML = firstPending
    ? `<button class="btn btn-primary btn-block" onclick="goToSkill('${firstPending.sid}')">▶ 开始今日练习</button>`
    : (tasks.find(t=>t.type==='复习' && !t.desc.includes('0 张'))
      ? `<button class="btn btn-accent btn-block" onclick="switchView('review')">📖 去复习卡片</button>`
      : `<button class="btn btn-primary btn-block" onclick="switchView('practice')">✏️ 开始练习</button>`);
}

function findSkill(sid){
  for(const t of SKILL_DATA) for(const s of t.skills) if(s.id===sid) return s;
  return null;
}
function countSkillDone(sid){
  let c=0;
  const s=findSkill(sid); if(!s)return 0;
  s.exercises.forEach((_,i)=>{
    const k=sid+'-'+i;
    if(state.exerciseResults[k] && state.exerciseResults[k].rate>=2) c++;
  });
  return c;
}
function goToSkill(sid){
  switchView('practice');
  openSkill(sid);
}
function goToDeckReview(dk){
  switchView('review');
  startDeckReview(dk);
}

// ============================================================
// REVIEW VIEW
// ============================================================
let reviewCards = [];
let reviewIdx = 0;
let reviewTimer = null;
let reviewTimerStart = 0;
const REVIEW_CARD_TIME = 10; // seconds

function renderReview(){
  const grid = document.getElementById('deck-grid');
  const decks = Object.keys(CARD_DB);
  let html = '';
  decks.forEach(dk=>{
    const deck = CARD_DB[dk];
    const prefix = deck.cards[0]?.id?.replace(/\d+$/,'') || dk.charAt(0);
    const due = SR.getDueCards([prefix]).length;
    const newC = SR.getNewCards([prefix]).length;
    const total = deck.cards.length;
    html += `
      <div class="deck-card" onclick="startDeckReview('${dk}')">
        <div class="deck-icon">${deck.icon}</div>
        <div class="deck-name">${deck.name}</div>
        <div class="deck-stats">
          ${due>0?`<span class="deck-due">${due} 待复习</span> · `:''}
          ${newC>0?`${newC} 新 · `:''}
          ${total} 张
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;

  const allDue = SR.getDueCards().length;
  document.getElementById('review-due-count').textContent = allDue + ' 张卡片';

  // Show decks, hide session
  document.getElementById('review-decks').classList.remove('hidden');
  document.getElementById('review-session').classList.add('hidden');
}

function startDeckReview(dk){
  const deck = CARD_DB[dk];
  const prefix = deck.cards[0]?.id?.replace(/\d+$/,'') || dk.charAt(0);
  const dueIds = SR.getDueCards([prefix]);
  const newIds = SR.getNewCards([prefix]);

  // Build card list: due first, then new (limit 20 total)
  const allIds = [...dueIds, ...newIds].slice(0,20);
  if(allIds.length===0){ alert('当前没有待复习的卡片！'); return; }

  reviewCards = allIds.map(id=>{
    const card = findCardById(id);
    return card;
  }).filter(Boolean);

  reviewIdx = 0;
  document.getElementById('review-decks').classList.add('hidden');
  document.getElementById('review-session').classList.remove('hidden');
  showReviewCard();
  recordStudyDay();
}

function startDailyReview(){
  const dueIds = SR.getDueCards();
  const newIds = SR.getNewCards();
  const allIds = [...dueIds, ...newIds].slice(0,30);
  if(allIds.length===0){ alert('今日没有待复习的卡片！'); return; }

  reviewCards = allIds.map(id=>findCardById(id)).filter(Boolean);
  reviewIdx = 0;
  document.getElementById('review-decks').classList.add('hidden');
  document.getElementById('review-session').classList.remove('hidden');
  showReviewCard();
  recordStudyDay();
}

function findCardById(id){
  for(const dk of Object.keys(CARD_DB)){
    const deck = CARD_DB[dk];
    for(const c of deck.cards){
      if(c.id===id) return {...c, _deck:dk};
    }
  }
  return null;
}

function showReviewCard(){
  if(reviewIdx >= reviewCards.length){
    exitReview();
    alert('🎉 本次复习完成！');
    return;
  }
  const card = reviewCards[reviewIdx];
  document.getElementById('fc-tag').textContent = card.tag;
  document.getElementById('fc-front-text').textContent = card.front;
  document.getElementById('fc-back-text').textContent = card.back;
  document.getElementById('fc-example').textContent = card.example ? '💡 '+card.example : '';
  document.getElementById('flashcard').classList.remove('flipped');
  document.getElementById('review-progress').textContent = `${reviewIdx+1}/${reviewCards.length}`;

  // Timer
  if(state.timerEnabled) startReviewTimer();
  else {
    document.getElementById('review-timer-bar').classList.add('hidden');
  }
}

function flipCard(){
  document.getElementById('flashcard').classList.toggle('flipped');
  if(reviewTimer) clearInterval(reviewTimer);
}

function rateCard(rating){
  if(reviewIdx >= reviewCards.length) return;
  const card = reviewCards[reviewIdx];
  SR.rate(card.id, rating);

  // Add to errors if forgot
  if(rating===1){
    addError(card.front, '', card.back, '卡片复习-忘了', 'card', card.id);
  }

  reviewIdx++;
  addStudyTime(15000); // ~15s per card
  showReviewCard();
}

function startReviewTimer(){
  const bar = document.getElementById('review-timer-bar');
  const fill = document.getElementById('review-timer-fill');
  bar.classList.remove('hidden','warning','danger');
  reviewTimerStart = Date.now();
  const total = REVIEW_CARD_TIME * 1000;
  if(reviewTimer) clearInterval(reviewTimer);
  reviewTimer = setInterval(()=>{
    const elapsed = Date.now() - reviewTimerStart;
    const pct = Math.max(0, 1 - elapsed/total);
    fill.style.width = (pct*100)+'%';
    if(elapsed/total > 0.7) bar.className='timer-bar danger';
    else if(elapsed/total > 0.5) bar.className='timer-bar warning';
    else bar.className='timer-bar';
    if(elapsed >= total){
      clearInterval(reviewTimer);
      if(!document.getElementById('flashcard').classList.contains('flipped')){
        flipCard(); // auto-flip
      }
    }
  },200);
}

function exitReview(){
  if(reviewTimer) clearInterval(reviewTimer);
  renderReview();
}

// ============================================================
// PRACTICE VIEW
// ============================================================
let currentSkill = null;
let currentExIdx = 0;
let exTimer = null;
let exTimerStart = 0;
let draftTimer = null;
let pendingReviewNote = null;
let vocabQueue = [];
let vocabIdx = 0;
let currentVocabCard = null;
let materialQueue = [];
let materialIdx = 0;
let currentMaterial = null;
let mockTimer = null;
let mockStartAt = 0;
let mockPhase = 'small';
const EX_TIME_NORMAL = 20*60; // 20 min in seconds
const EX_TIME_SHORT = 5*60;   // 5 min for essay topics

function getExerciseKey(){
  return currentSkill ? currentSkill.id + '-' + currentExIdx : '';
}

function updateDraftStatus(text, active){
  const el = document.getElementById('draft-status');
  if(!el) return;
  el.textContent = text || '';
  el.classList.toggle('active', !!active);
}

function saveCurrentDraft(){
  const key = getExerciseKey();
  if(!key) return;
  const answer = document.getElementById('ex-answer').value;
  if(answer.trim()){
    state.exerciseDrafts[key] = {answer, updatedAt:Date.now()};
    updateDraftStatus('草稿已自动保存', true);
  } else {
    delete state.exerciseDrafts[key];
    updateDraftStatus('', false);
  }
  saveState(state);
}

function scheduleDraftSave(){
  updateDraftStatus('正在保存草稿…', false);
  if(draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(saveCurrentDraft, 500);
}

function flushDraftSave(){
  if(draftTimer) clearTimeout(draftTimer);
  saveCurrentDraft();
}

function clearCurrentDraft(){
  const key = getExerciseKey();
  if(!key) return;
  if(draftTimer) clearTimeout(draftTimer);
  delete state.exerciseDrafts[key];
  saveState(state);
  updateDraftStatus('', false);
}

function renderPractice(){
  const list = document.getElementById('skill-type-list');
  renderVocabTrainerStats();
  renderMaterialTrainerStats();
  renderMockExamStats();
  const query = (document.getElementById('practice-search')?.value || '').trim().toLowerCase();
  let html = '';
  SKILL_DATA.forEach(type=>{
    const matchedSkills = query
      ? type.skills.filter(s=>[
          type.typeName,
          type.scoreRange,
          type.tagline,
          s.name,
          s.exam,
          s.tip,
          ...s.exercises.flatMap(ex=>[ex.q, ex.ref])
        ].some(v=>(v||'').toLowerCase().includes(query)))
      : type.skills;
    if(!matchedSkills.length) return;

    const doneCount = matchedSkills.reduce((a,s)=>a+countSkillDone(s.id),0);
    const totalEx = matchedSkills.reduce((a,s)=>a+s.exercises.length,0);
    html += `
      <div class="skill-type-card" onclick="toggleSkillType('${type.typeId}')">
        <div class="stc-header">
          <div class="stc-name">${type.typeName} <span style="font-size:11px;color:var(--text3)">${type.scoreRange}</span></div>
          <span class="tag tag-blue">${doneCount}/${totalEx}</span>
        </div>
        <div class="stc-tagline">${type.tagline}</div>
        <div class="stc-skills" id="skills-${type.typeId}" style="display:${query?'block':'none'}">
          ${matchedSkills.map(s=>{
            const sd = countSkillDone(s.id);
            return `<div class="skill-item" onclick="event.stopPropagation();openSkill('${s.id}')">
              <span>${s.name}</span>
              <span class="tag ${sd===s.exercises.length?'tag-green':'tag-blue'}">${sd}/${s.exercises.length}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  });
  list.innerHTML = html || `<div class="card empty-hint">没有找到匹配的技能或题目</div>`;
  document.getElementById('practice-list').classList.remove('hidden');
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.add('hidden');
  document.getElementById('vocab-trainer').classList.add('hidden');
  document.getElementById('material-trainer').classList.add('hidden');
  document.getElementById('mock-exam').classList.add('hidden');
}

function getVocabTrainerCards(){
  return CARD_DB.vocab.cards.filter(card=>!card.front.includes('【'));
}

function renderVocabTrainerStats(){
  const el = document.getElementById('vocab-trainer-stats');
  if(!el) return;
  const done = state.vocabTrainer.done || 0;
  const correct = state.vocabTrainer.correct || 0;
  const rate = done ? Math.round(correct/done*100) : 0;
  el.textContent = done ? `已练 ${done} 次，规范率 ${rate}%` : '建议每天练 5 分钟，优先解决“答案大白话”问题';
}

function shuffleItems(items){
  return [...items].sort(()=>Math.random()-0.5);
}

function startVocabTrainer(){
  vocabQueue = shuffleItems(getVocabTrainerCards()).slice(0,10);
  vocabIdx = 0;
  document.getElementById('practice-list').classList.add('hidden');
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.add('hidden');
  document.getElementById('vocab-trainer').classList.remove('hidden');
  showVocabQuestion();
  recordStudyDay();
}

function showVocabQuestion(){
  currentVocabCard = vocabQueue[vocabIdx];
  if(!currentVocabCard){ exitVocabTrainer(); return; }
  document.getElementById('vocab-counter').textContent = `${vocabIdx+1} / ${vocabQueue.length}`;
  document.getElementById('vocab-question').innerHTML = `请把这句大白话改成规范表达：<br><strong>${currentVocabCard.front}</strong>`;
  document.getElementById('vocab-answer').value = '';
  document.getElementById('vocab-ref').classList.remove('show');
  document.getElementById('vocab-ref').innerHTML = '';
  document.getElementById('vocab-rate').classList.add('hidden');
}

function normalizeText(text){
  return (text || '').replace(/[\s，。；、,.]/g,'').toLowerCase();
}

function getVocabHitCount(answer, ref){
  const normalizedAnswer = normalizeText(answer);
  return ref.split(/[\/／、]/).map(part=>normalizeText(part)).filter(part=>part && normalizedAnswer.includes(part)).length;
}

function checkVocabAnswer(){
  if(!currentVocabCard) return;
  const answer = document.getElementById('vocab-answer').value;
  const hitCount = getVocabHitCount(answer, currentVocabCard.back);
  const hitText = hitCount ? `<div class="vocab-hit">命中 ${hitCount} 个关键词，可自评为规范。</div>` : '<div style="color:var(--accent)">暂未命中参考关键词，请对照修改表达。</div>';
  document.getElementById('vocab-ref').innerHTML = `${hitText}<strong>参考表达：</strong>${currentVocabCard.back}<br><br><strong>例句：</strong>${currentVocabCard.example || '无'}`;
  document.getElementById('vocab-ref').classList.add('show');
  document.getElementById('vocab-rate').classList.remove('hidden');
  addStudyTime(30000);
}

function rateVocabAnswer(correct){
  if(!currentVocabCard) return;
  state.vocabTrainer.done = (state.vocabTrainer.done || 0) + 1;
  if(correct) state.vocabTrainer.correct = (state.vocabTrainer.correct || 0) + 1;
  state.vocabTrainer.history[currentVocabCard.id] = {
    correct,
    answer:document.getElementById('vocab-answer').value,
    timestamp:Date.now()
  };
  if(!correct){
    addError(currentVocabCard.front, document.getElementById('vocab-answer').value, currentVocabCard.back, '表达口语化', 'exercise', 'vocab-'+currentVocabCard.id);
  }
  saveState(state);
  nextVocabQuestion(true);
}

function nextVocabQuestion(countSkip){
  if(countSkip === false){
    state.vocabTrainer.done = (state.vocabTrainer.done || 0) + 1;
    saveState(state);
  }
  vocabIdx++;
  if(vocabIdx < vocabQueue.length) showVocabQuestion();
  else {
    alert('本组规范词替换训练完成！');
    exitVocabTrainer();
  }
}

function exitVocabTrainer(){
  currentVocabCard = null;
  document.getElementById('vocab-trainer').classList.add('hidden');
  document.getElementById('practice-list').classList.remove('hidden');
  renderPractice();
}

function renderMaterialTrainerStats(){
  const el = document.getElementById('material-trainer-stats');
  if(!el) return;
  const done = state.materialTrainer.done || 0;
  const correct = state.materialTrainer.correct || 0;
  const rate = done ? Math.round(correct/done*100) : 0;
  el.textContent = done ? `已练 ${done} 段，找点准确率 ${rate}%` : '建议每天练 1-2 段，优先提升材料找点能力';
}

function startMaterialTrainer(){
  materialQueue = shuffleItems(MATERIAL_TRAINING_DATA).slice(0,5);
  materialIdx = 0;
  document.getElementById('practice-list').classList.add('hidden');
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.add('hidden');
  document.getElementById('vocab-trainer').classList.add('hidden');
  document.getElementById('mock-exam').classList.add('hidden');
  document.getElementById('material-trainer').classList.remove('hidden');
  showMaterialQuestion();
  recordStudyDay();
}

function renderMockExamStats(){
  const el = document.getElementById('mock-exam-stats');
  if(!el) return;
  const exams = state.mockExams || [];
  if(!exams.length){
    el.textContent = '冲刺期建议每周至少1次，重点复盘时间分配。';
    return;
  }
  const latest = exams[exams.length-1];
  el.textContent = `已模考 ${exams.length} 次，上次用时 ${Math.round(latest.duration/60000)} 分钟`;
}

function startMockExam(){
  mockStartAt = Date.now();
  mockPhase = 'small';
  document.getElementById('practice-list').classList.add('hidden');
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.add('hidden');
  document.getElementById('vocab-trainer').classList.add('hidden');
  document.getElementById('material-trainer').classList.add('hidden');
  document.getElementById('mock-exam').classList.remove('hidden');
  document.getElementById('mock-note').value = '';
  updateMockTimer();
  if(mockTimer) clearInterval(mockTimer);
  mockTimer = setInterval(updateMockTimer, 1000);
  recordStudyDay();
}

function updateMockTimer(){
  const total = 150*60*1000;
  const elapsed = Date.now() - mockStartAt;
  const remain = Math.max(0, total - elapsed);
  const hours = Math.floor(remain/3600000);
  const mins = Math.floor((remain%3600000)/60000);
  const secs = Math.floor((remain%60000)/1000);
  document.getElementById('mock-timer').textContent = `${hours}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  document.getElementById('mock-progress').style.width = `${Math.min(100, elapsed/total*100)}%`;
  const phaseEl = document.getElementById('mock-phase');
  const phaseByTime = elapsed < 60*60*1000 ? 'small' : 'essay';
  const phaseText = mockPhase === 'done-small' ? '小题已完成' : (phaseByTime === 'small' ? '小题阶段' : '作文阶段');
  phaseEl.textContent = phaseText;
  phaseEl.className = `tag ${phaseByTime==='small'?'tag-blue':'tag-yellow'}`;
  if(remain <= 0){
    clearInterval(mockTimer);
    document.getElementById('mock-guidance').innerHTML = '⏰ 模考时间到！请点击“交卷复盘”记录本次时间表现。';
  }
}

function markMockPhase(phase){
  mockPhase = phase === 'small' ? 'done-small' : 'essay';
  document.getElementById('mock-guidance').innerHTML = phase === 'small'
    ? '已标记小题完成。请检查是否给大作文至少留下90分钟。'
    : '已进入作文阶段。建议先用5分钟搭框架，再写正文。';
  updateMockTimer();
}

function finishMockExam(cancelled){
  if(mockTimer) clearInterval(mockTimer);
  const duration = mockStartAt ? Date.now() - mockStartAt : 0;
  if(!cancelled){
    const note = document.getElementById('mock-note').value.trim();
    state.mockExams.push({duration, phase:mockPhase, note, timestamp:Date.now()});
    state.reviewNotes.push({
      key:'mock-'+Date.now(),
      rating:2,
      skillId:'mock-exam',
      skillName:'模考复盘',
      exIdx:state.mockExams.length,
      question:'2.5小时模考模式',
      timestamp:Date.now(),
      issues:duration > 150*60*1000 ? ['时间超限'] : [],
      note:note || '完成一次模考，请复盘小题和作文时间分配。'
    });
    addStudyTime(duration);
    saveState(state);
  }
  mockStartAt = 0;
  document.getElementById('mock-exam').classList.add('hidden');
  document.getElementById('practice-list').classList.remove('hidden');
  renderPractice();
}

function showMaterialQuestion(){
  currentMaterial = materialQueue[materialIdx];
  if(!currentMaterial){ exitMaterialTrainer(); return; }
  document.getElementById('material-counter').textContent = `${materialIdx+1} / ${materialQueue.length}`;
  document.getElementById('material-text').textContent = currentMaterial.material;
  const allTags = ['主体','问题','原因','对策','成效','数据结论'];
  document.getElementById('material-tags').innerHTML = allTags.map(tag=>
    `<label><input type="checkbox" value="${tag}">${tag}</label>`
  ).join('');
  document.getElementById('material-answer').value = '';
  document.getElementById('material-ref').classList.remove('show');
  document.getElementById('material-ref').innerHTML = '';
  document.getElementById('material-rate').classList.add('hidden');
}

function getSelectedMaterialTags(){
  return Array.from(document.querySelectorAll('#material-tags input[type="checkbox"]:checked')).map(input=>input.value);
}

function checkMaterialAnswer(){
  if(!currentMaterial) return;
  const selected = getSelectedMaterialTags();
  const missed = currentMaterial.tags.filter(tag=>!selected.includes(tag));
  const extra = selected.filter(tag=>!currentMaterial.tags.includes(tag));
  const result = missed.length || extra.length
    ? `<div style="color:var(--accent)">标签识别：漏选 ${missed.join('、') || '无'}；多选 ${extra.join('、') || '无'}</div>`
    : '<div class="vocab-hit">标签识别准确</div>';
  document.getElementById('material-ref').innerHTML = `${result}<strong>参考提炼：</strong><br>${currentMaterial.ref}`;
  document.getElementById('material-ref').classList.add('show');
  document.getElementById('material-rate').classList.remove('hidden');
  addStudyTime(60000);
}

function rateMaterialAnswer(correct){
  if(!currentMaterial) return;
  const selected = getSelectedMaterialTags();
  const answer = document.getElementById('material-answer').value;
  state.materialTrainer.done = (state.materialTrainer.done || 0) + 1;
  if(correct) state.materialTrainer.correct = (state.materialTrainer.correct || 0) + 1;
  state.materialTrainer.history[currentMaterial.id] = {
    correct,
    selected,
    answer,
    timestamp:Date.now()
  };
  if(!correct){
    addError(currentMaterial.material, answer, currentMaterial.ref, '漏点', 'exercise', 'material-'+currentMaterial.id);
    state.reviewNotes.push({
      key:'material-'+currentMaterial.id,
      rating:1,
      skillId:'material-reading',
      skillName:'材料阅读训练',
      exIdx:materialIdx,
      question:currentMaterial.material,
      timestamp:Date.now(),
      issues:['漏点'],
      note:'材料阅读训练自评为漏点明显'
    });
  }
  saveState(state);
  nextMaterialQuestion(true);
}

function nextMaterialQuestion(countSkip){
  if(countSkip === false){
    state.materialTrainer.done = (state.materialTrainer.done || 0) + 1;
    saveState(state);
  }
  materialIdx++;
  if(materialIdx < materialQueue.length) showMaterialQuestion();
  else {
    alert('本组材料阅读训练完成！');
    exitMaterialTrainer();
  }
}

function exitMaterialTrainer(){
  currentMaterial = null;
  document.getElementById('material-trainer').classList.add('hidden');
  document.getElementById('practice-list').classList.remove('hidden');
  renderPractice();
}

function toggleSkillType(typeId){
  const el = document.getElementById('skills-'+typeId);
  el.style.display = el.style.display==='none'?'block':'none';
}

function openSkill(sid){
  currentSkill = findSkill(sid);
  if(!currentSkill) return;
  currentExIdx = 0;
  document.getElementById('practice-list').classList.add('hidden');
  document.getElementById('practice-skill').classList.remove('hidden');
  document.getElementById('skill-tag').textContent = SKILL_DATA.find(t=>t.skills.some(s=>s.id===sid))?.typeName||'';
  document.getElementById('skill-name').textContent = currentSkill.name;
  document.getElementById('skill-exam').textContent = currentSkill.exam;
  document.getElementById('skill-tip').textContent = '💡 '+currentSkill.tip;
  openExercise(0);
  recordStudyDay();
}

function openExercise(idx, skipFlush){
  if(!currentSkill) return;
  if(!skipFlush && document.getElementById('practice-exercise') && !document.getElementById('practice-exercise').classList.contains('hidden')){
    flushDraftSave();
  }
  currentExIdx = idx;
  const ex = currentSkill.exercises[idx];
  const key = getExerciseKey();
  const draft = state.exerciseDrafts[key];
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.remove('hidden');
  document.getElementById('ex-counter').textContent = `${idx+1} / ${currentSkill.exercises.length}`;
  document.getElementById('ex-question').textContent = ex.q;
  const answerEl = document.getElementById('ex-answer');
  answerEl.value = draft?.answer || '';
  answerEl.oninput = scheduleDraftSave;
  answerEl.onblur = flushDraftSave;
  updateDraftStatus(draft ? `已恢复 ${new Date(draft.updatedAt).toLocaleString()} 的草稿` : '', !!draft);
  document.getElementById('ex-ref').textContent = ex.ref;
  document.getElementById('ex-ref').classList.remove('show');
  document.getElementById('self-rate').classList.add('hidden');
  answerEl.style.display = '';

  // Determine timer: essay/thesis exercises get 5 min, others 20 min
  const isEssayTopic = currentSkill.id.startsWith('s5-1') || currentSkill.id.startsWith('s5-2');
  const timeLimit = isEssayTopic ? EX_TIME_SHORT : EX_TIME_NORMAL;

  if(state.timerEnabled) startExTimer(timeLimit);
  else {
    document.getElementById('ex-timer-bar').classList.add('hidden');
    document.getElementById('ex-timer-text').textContent = '';
  }

  // Navigation dots
  const nav = document.getElementById('ex-nav');
  nav.innerHTML = currentSkill.exercises.map((_,i)=>{
    const k = currentSkill.id+'-'+i;
    const r = state.exerciseResults[k];
    let cls = 'dot';
    if(i===idx) cls += ' current';
    else if(r){
      cls += r.rate>=2 ? ' done' : ' error';
    }
    return `<button class="${cls}" onclick="openExercise(${i})">${i+1}</button>`;
  }).join('');
}

function startExTimer(seconds){
  const bar = document.getElementById('ex-timer-bar');
  const fill = document.getElementById('ex-timer-fill');
  const text = document.getElementById('ex-timer-text');
  bar.classList.remove('hidden','warning','danger');
  exTimerStart = Date.now();
  const total = seconds * 1000;
  if(exTimer) clearInterval(exTimer);
  exTimer = setInterval(()=>{
    const elapsed = Date.now() - exTimerStart;
    const remain = Math.max(0, total - elapsed);
    const pct = Math.max(0, remain/total);
    fill.style.width = (pct*100)+'%';
    const mins = Math.floor(remain/60000);
    const secs = Math.floor((remain%60000)/1000);
    text.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
    if(pct < 0.3) bar.className='timer-bar danger';
    else if(pct < 0.5) bar.className='timer-bar warning';
    else bar.className='timer-bar';
    if(remain<=0){
      clearInterval(exTimer);
      text.textContent = '⏰ 时间到！';
    }
  },500);
}

function showRefAnswer(){
  document.getElementById('ex-ref').classList.add('show');
  document.getElementById('self-rate').classList.remove('hidden');
  if(exTimer) clearInterval(exTimer);
  addStudyTime(60000); // ~1 min per exercise
}

function skipExercise(){
  if(exTimer) clearInterval(exTimer);
  flushDraftSave();
  const nextIdx = currentExIdx + 1;
  if(nextIdx < currentSkill.exercises.length) openExercise(nextIdx, true);
  else backToSkill();
}

function selfRate(rating){
  if(!currentSkill) return;
  const k = currentSkill.id + '-' + currentExIdx;
  const answer = document.getElementById('ex-answer').value;
  const ex = currentSkill.exercises[currentExIdx];
  state.exerciseResults[k] = {
    rate: rating,
    answer: answer,
    timestamp: Date.now(),
    skillId: currentSkill.id,
    exIdx: currentExIdx
  };

  // Add to errors if needs re-practice
  if(rating === 1){
    addError(ex.q, answer, ex.ref, '需再练', 'exercise', k);
  }

  clearCurrentDraft();
  saveState(state);
  pendingReviewNote = {
    key:k,
    rating,
    skillId:currentSkill.id,
    skillName:currentSkill.name,
    exIdx:currentExIdx,
    question:ex.q,
    timestamp:Date.now(),
    nextIdx:currentExIdx + 1
  };
  openReviewNoteModal(rating);
}

function openReviewNoteModal(rating){
  const modal = document.getElementById('review-note-modal');
  const note = document.getElementById('review-note-text');
  if(!modal) return finishReviewNote();
  modal.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.checked = rating === 1 && ['漏点','分类乱','表达口语化'].includes(input.value);
  });
  if(note) note.value = '';
  modal.classList.add('show');
}

function saveReviewNote(){
  if(!pendingReviewNote) return closeReviewNoteModal();
  const modal = document.getElementById('review-note-modal');
  const issues = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(input=>input.value);
  const note = (document.getElementById('review-note-text')?.value || '').trim();
  if(issues.length || note){
    state.reviewNotes.push({
      ...pendingReviewNote,
      issues,
      note
    });
    saveState(state);
  }
  finishReviewNote();
}

function skipReviewNote(){
  finishReviewNote();
}

function closeReviewNoteModal(){
  document.getElementById('review-note-modal')?.classList.remove('show');
}

function finishReviewNote(){
  const nextIdx = pendingReviewNote?.nextIdx ?? currentExIdx + 1;
  pendingReviewNote = null;
  closeReviewNoteModal();
  if(nextIdx < currentSkill.exercises.length) openExercise(nextIdx, true);
  else backToSkill(true);
}

function backToSkill(skipFlush){
  if(exTimer) clearInterval(exTimer);
  if(!skipFlush && document.getElementById('practice-exercise') && !document.getElementById('practice-exercise').classList.contains('hidden')){
    flushDraftSave();
  }
  document.getElementById('practice-exercise').classList.add('hidden');
  if(currentSkill){
    document.getElementById('practice-skill').classList.remove('hidden');
    document.getElementById('skill-name').textContent = currentSkill.name;
    document.getElementById('skill-exam').textContent = currentSkill.exam;
    document.getElementById('skill-tip').textContent = '💡 '+currentSkill.tip;
  }
}

function backToSkillList(){
  if(exTimer) clearInterval(exTimer);
  if(document.getElementById('practice-exercise') && !document.getElementById('practice-exercise').classList.contains('hidden')){
    flushDraftSave();
  }
  document.getElementById('practice-skill').classList.add('hidden');
  document.getElementById('practice-exercise').classList.add('hidden');
  document.getElementById('practice-list').classList.remove('hidden');
  renderPractice();
}

// ============================================================
// ERROR NOTEBOOK
// ============================================================
let currentErrorFilter = '全部';

function addError(question, userAnswer, refAnswer, errorType, source, sourceId){
  // Check if already exists
  const existing = state.errors.find(e=>e.sourceId===sourceId && !e.cleared);
  if(existing) return; // Don't duplicate

  state.errors.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    question, userAnswer, refAnswer, errorType, source, sourceId,
    createdAt: Date.now(),
    correctCount: 0,
    cleared: false
  });
  saveState(state);
  updateErrorBadge();
}

function renderErrors(){
  const errors = state.errors.filter(e=>!e.cleared);
  const filters = ['全部','练习题','卡片','漏点','跑题','表达不规范','格式错误','需再练','忘了'];
  const filterHtml = filters.map((f,i)=>
    `<button class="filter-btn ${f===currentErrorFilter?'active':''}" onclick="filterErrors('${f}',this)">${f}</button>`
  ).join('');
  document.getElementById('error-filters').innerHTML = filterHtml;

  renderErrorList(getFilteredErrors(errors));

  // Weekend review button
  const isWeekend = [0,6].includes(new Date().getDay());
  document.getElementById('error-weekend-btn').innerHTML = errors.length > 0
    ? `<button class="btn ${isWeekend?'btn-accent':'btn-outline'} btn-block" onclick="startWeekendReview()">🔄 周末错题重练${isWeekend?' (今日推荐)':''}</button>`
    : '';
}

function getFilteredErrors(errors){
  let result = [...errors];
  if(currentErrorFilter!=='全部'){
    if(currentErrorFilter==='练习题') result = result.filter(e=>e.source==='exercise');
    else if(currentErrorFilter==='卡片') result = result.filter(e=>e.source==='card');
    else result = result.filter(e=>e.errorType.includes(currentErrorFilter));
  }

  const query = (document.getElementById('error-search')?.value || '').trim().toLowerCase();
  if(query){
    result = result.filter(e=>[
      e.question,
      e.userAnswer,
      e.refAnswer,
      e.errorType,
      e.source==='card'?'卡片':'练习题'
    ].some(v=>(v||'').toLowerCase().includes(query)));
  }

  const sort = document.getElementById('error-sort')?.value || 'newest';
  result.sort((a,b)=>{
    if(sort==='oldest') return a.createdAt - b.createdAt;
    if(sort==='weakest') return (a.correctCount - b.correctCount) || (b.createdAt - a.createdAt);
    return b.createdAt - a.createdAt;
  });
  return result;
}

function renderErrorList(errors){
  if(!errors.length){
    document.getElementById('error-list').innerHTML = '';
    const emptyText = document.querySelector('#error-empty div:last-child');
    const hasFilters = currentErrorFilter !== '全部' || (document.getElementById('error-search')?.value || '').trim();
    if(emptyText) emptyText.textContent = hasFilters ? '没有找到匹配的错题' : '暂无错题，继续保持！';
    document.getElementById('error-empty').classList.remove('hidden');
    return;
  }
  document.getElementById('error-empty').classList.add('hidden');

  const html = errors.map(e=>{
    const typeTag = e.source==='card' ? 'tag-yellow' : 'tag-blue';
    const errTag = e.errorType.includes('忘') ? 'tag-red' : e.errorType.includes('漏') ? 'tag-yellow' : 'tag-blue';
    return `<div class="error-item">
      <div class="ei-q">${escapeHtml(e.question)}</div>
      <div class="ei-type">
        <span class="tag ${typeTag}">${e.source==='card'?'卡片':'练习'}</span>
        <span class="tag ${errTag}">${e.errorType}</span>
        <span class="tag tag-green" style="margin-left:4px">✓${e.correctCount}/2</span>
      </div>
      <div class="ei-ref" onclick="this.classList.toggle('expanded')">${escapeHtml(e.refAnswer)}</div>
      <div class="ei-meta">
        <span>${new Date(e.createdAt).toLocaleDateString()}</span>
        <div class="ei-actions">
          <button class="btn btn-sm btn-primary" onclick="markErrorCorrect('${e.id}')">✓ 掌握了</button>
          <button class="btn btn-sm btn-outline" onclick="removeError('${e.id}')">删除</button>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('error-list').innerHTML = html;
}

function filterErrors(type, btn){
  document.querySelectorAll('.error-filter .filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentErrorFilter = type;
  applyErrorFilters();
}

function applyErrorFilters(){
  renderErrorList(getFilteredErrors(state.errors.filter(e=>!e.cleared)));
}

function markErrorCorrect(id){
  const err = state.errors.find(e=>e.id===id);
  if(err){
    err.correctCount++;
    if(err.correctCount>=2) err.cleared=true;
    saveState(state);
    updateErrorBadge();
    renderErrors();
  }
}

function removeError(id){
  state.errors = state.errors.filter(e=>e.id!==id);
  saveState(state);
  updateErrorBadge();
  renderErrors();
}

function updateErrorBadge(){
  const count = state.errors.filter(e=>!e.cleared).length;
  const badge = document.querySelector('.tab[data-view="errors"] .badge');
  if(badge){
    if(count>0){ badge.textContent=count; badge.style.display='flex'; }
    else badge.style.display='none';
  }
}

// Weekend review
function startWeekendReview(){
  const errors = state.errors.filter(e=>!e.cleared);
  if(!errors.length){ alert('没有错题需要复习！'); return; }

  const modal = document.getElementById('weekend-modal');
  const content = document.getElementById('weekend-content');
  content.innerHTML = errors.map((e,i)=>`
    <div class="rm-item">
      <div class="rm-q">${i+1}. ${escapeHtml(e.question)}</div>
      <div class="rm-ref" id="wr-${i}"><strong>参考：</strong>${escapeHtml(e.refAnswer)}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm btn-primary" onclick="weekendRate('${e.id}',true,${i})">✓ 掌握了</button>
        <button class="btn btn-sm btn-outline" onclick="document.getElementById('wr-${i}').classList.add('show')">看答案</button>
        <button class="btn btn-sm btn-danger" onclick="weekendRate('${e.id}',false,${i})">❌ 还是不会</button>
      </div>
    </div>
  `).join('');
  modal.classList.add('show');
}

function weekendRate(id, correct, idx){
  const err = state.errors.find(e=>e.id===id);
  if(err){
    if(correct){
      err.correctCount++;
      if(err.correctCount>=2) err.cleared=true;
    } else {
      err.correctCount=0; // Reset
    }
    saveState(state);
  }
  // Remove item from DOM
  const items = document.querySelectorAll('.rm-item');
  if(items[idx]) items[idx].style.opacity='0.3';
  updateErrorBadge();
}

function closeWeekendModal(){
  document.getElementById('weekend-modal').classList.remove('show');
  renderErrors();
}

// ============================================================
// STATS VIEW
// ============================================================
function renderStats(){
  renderRadarChart();
  renderStatsGrid();
  renderReviewSummary();
  renderWeeklyChart();
  renderHandbook();
  renderSettings();
}

function renderReviewSummary(){
  const container = document.getElementById('review-summary');
  if(!container) return;
  const notes = state.reviewNotes || [];
  if(!notes.length){
    container.innerHTML = '<div class="empty-hint">还没有复盘记录。完成练习自评后，可记录漏点、分类、表达和时间问题。</div>';
    return;
  }

  const issueCounts = {};
  notes.forEach(note=>{
    (note.issues || []).forEach(issue=>{
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    });
  });
  const rows = Object.entries(issueCounts).sort((a,b)=>b[1]-a[1]);
  const max = rows[0]?.[1] || 1;
  const recent = [...notes].sort((a,b)=>b.timestamp-a.timestamp).slice(0,3);

  container.innerHTML = `
    <div class="review-summary">
      ${rows.length ? rows.map(([issue,count])=>`
        <div class="rs-row">
          <div class="rs-label">${issue}</div>
          <div class="rs-bar"><div class="rs-fill" style="width:${Math.max(8, count/max*100)}%"></div></div>
          <div class="rs-count">${count}</div>
        </div>
      `).join('') : '<div class="empty-hint">已记录复盘，但还没有勾选具体问题。</div>'}
      <div class="mt-12 text-sm text-muted">最近复盘</div>
      ${recent.map(note=>`
        <div class="handbook-item">
          <h4>${escapeHtml(note.skillName)} · 第${note.exIdx+1}题</h4>
          <div class="hb-body">${escapeHtml(note.note || (note.issues || []).join('、') || '未填写文字复盘')}</div>
          <div class="hb-tag"><span class="tag ${note.rating===1?'tag-red':note.rating===2?'tag-yellow':'tag-green'}">自评${note.rating}</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

let currentHandbookCategory = '全部';

function renderHandbook(){
  const tabs = document.getElementById('handbook-tabs');
  const list = document.getElementById('handbook-list');
  if(!tabs || !list) return;

  const categories = ['全部', ...new Set(HANDBOOK_SECTIONS.map(item=>item.category))];
  tabs.innerHTML = categories.map(category=>
    `<button class="filter-btn ${category===currentHandbookCategory?'active':''}" onclick="setHandbookCategory('${category}')">${category}</button>`
  ).join('');

  const query = (document.getElementById('handbook-search')?.value || '').trim().toLowerCase();
  let items = HANDBOOK_SECTIONS;
  if(currentHandbookCategory !== '全部') items = items.filter(item=>item.category===currentHandbookCategory);
  if(query){
    items = items.filter(item=>[item.category,item.title,item.body].some(value=>(value||'').toLowerCase().includes(query)));
  }

  list.innerHTML = items.length ? items.map(item=>`
    <div class="handbook-item">
      <h4>${item.title}</h4>
      <div class="hb-body">${item.body}</div>
      <div class="hb-tag"><span class="tag tag-blue">${item.category}</span></div>
    </div>
  `).join('') : '<div class="empty-hint">没有找到匹配的手册内容</div>';
}

function setHandbookCategory(category){
  currentHandbookCategory = category;
  renderHandbook();
}

function getTypeMastery(typeId){
  const type = SKILL_DATA.find(t=>t.typeId===typeId);
  if(!type) return 0;
  let total=0, done=0;
  type.skills.forEach(s=>{
    s.exercises.forEach((_,i)=>{
      total++;
      const k=s.id+'-'+i;
      if(state.exerciseResults[k] && state.exerciseResults[k].rate>=2) done++;
    });
  });
  return total>0 ? Math.round(done/total*100) : 0;
}

function renderRadarChart(){
  const container = document.getElementById('radar-chart');
  const types = SKILL_DATA.map(t=>({name:t.typeName.slice(0,4),val:getTypeMastery(t.typeId)}));
  const n=types.length;
  const cx=130, cy=130, r=90;

  let svg = `<svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg">`;

  // Grid circles
  for(let i=1;i<=5;i++){
    const ri=r*i/5;
    svg+=`<circle cx="${cx}" cy="${cy}" r="${ri}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  }

  // Axis lines + labels
  for(let i=0;i<n;i++){
    const angle = -Math.PI/2 + 2*Math.PI*i/n;
    const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
    svg+=`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    const lx=cx+(r+18)*Math.cos(angle), ly=cy+(r+18)*Math.sin(angle);
    svg+=`<text x="${lx}" y="${ly}" fill="var(--text2)" font-size="10" text-anchor="middle" dominant-baseline="middle">${types[i].name}</text>`;
  }

  // Data polygon
  let points='';
  for(let i=0;i<n;i++){
    const angle=-Math.PI/2+2*Math.PI*i/n;
    const val=types[i].val/100;
    const x=cx+r*val*Math.cos(angle), y=cy+r*val*Math.sin(angle);
    points+=`${x},${y} `;
  }
  svg+=`<polygon points="${points.trim()}" fill="rgba(79,195,247,0.15)" stroke="var(--primary)" stroke-width="2"/>`;

  // Data points
  for(let i=0;i<n;i++){
    const angle=-Math.PI/2+2*Math.PI*i/n;
    const val=types[i].val/100;
    const x=cx+r*val*Math.cos(angle), y=cy+r*val*Math.sin(angle);
    svg+=`<circle cx="${x}" cy="${y}" r="4" fill="var(--primary)"/>`;
    svg+=`<text x="${x}" y="${y-10}" fill="var(--accent)" font-size="10" font-weight="700" text-anchor="middle">${types[i].val}%</text>`;
  }

  svg+=`</svg>`;
  container.innerHTML=svg;
}

function renderStatsGrid(){
  const totalCards = Object.values(CARD_DB).reduce((a,d)=>a+d.cards.length,0);
  const masteredCards = SR.getMasteredCount();
  const totalExercises = SKILL_DATA.reduce((a,t)=>a+t.skills.reduce((b,s)=>b+s.exercises.length,0),0);
  const doneExercises = Object.keys(state.exerciseResults).filter(k=>state.exerciseResults[k].rate>=2).length;
  const streak = getStreak();
  const errors = state.errors.filter(e=>!e.cleared).length;
  const vocabDone = state.vocabTrainer.done || 0;
  const vocabRate = vocabDone ? Math.round((state.vocabTrainer.correct || 0)/vocabDone*100) : 0;
  const materialDone = state.materialTrainer.done || 0;
  const materialRate = materialDone ? Math.round((state.materialTrainer.correct || 0)/materialDone*100) : 0;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stats-card"><div class="sc-num blue">${masteredCards}/${totalCards}</div><div class="sc-label">已掌握卡片</div></div>
    <div class="stats-card"><div class="sc-num yellow">${doneExercises}/${totalExercises}</div><div class="sc-label">已完成练习</div></div>
    <div class="stats-card"><div class="sc-num green">${vocabRate}%</div><div class="sc-label">规范词训练(${vocabDone})</div></div>
    <div class="stats-card"><div class="sc-num red">${materialRate}%</div><div class="sc-label">材料阅读(${materialDone})</div></div>
  `;
}

function renderWeeklyChart(){
  const container = document.getElementById('weekly-chart');
  const weeks = [];
  const now = new Date();
  for(let w=3;w>=0;w--){
    const weekStart = new Date(now.getTime() - (w*7+now.getDay())*86400000);
    const weekEnd = new Date(weekStart.getTime()+7*86400000);
    let correct=0, total=0;
    Object.keys(state.exerciseResults).forEach(k=>{
      const r = state.exerciseResults[k];
      if(r.timestamp>=weekStart.getTime() && r.timestamp<weekEnd.getTime()){
        total++;
        if(r.rate>=2) correct++;
      }
    });
    const rate = total>0 ? Math.round(correct/total*100) : 0;
    const label = `第${4-w}周`;
    weeks.push({label,rate,total});
  }

  container.innerHTML = `<div class="weekly-chart">${
    weeks.map(w=>`
      <div class="bar-row">
        <div class="bar-label">${w.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w.rate}%"></div></div>
        <div class="bar-val">${w.rate}%${w.total?` (${w.total})`:''}</div>
      </div>
    `).join('')
  }</div>`;
}

function renderSettings(){
  const card = document.getElementById('settings-card');
  card.innerHTML = `
    <div class="setting-item">
      <div>
        <div class="setting-label">⏱️ 计时器</div>
        <div class="setting-desc">练习和复习时显示倒计时</div>
      </div>
      <div class="toggle ${state.timerEnabled?'on':''}" onclick="toggleTimer(this)"></div>
    </div>
    <div class="setting-item">
      <div>
        <div class="setting-label">📅 设置开始日期</div>
        <div class="setting-desc">当前：${state.startDate}</div>
      </div>
      <input type="date" value="${state.startDate}" onchange="setStartDate(this.value)"
        style="background:var(--card2);color:var(--text);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:4px 8px;font-size:12px">
    </div>
    <div class="setting-item">
      <div>
        <div class="setting-label">💾 数据备份</div>
        <div class="setting-desc">导出/导入学习记录，换设备或清缓存前建议备份</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn btn-primary btn-sm" onclick="exportBackup()">导出</button>
        <button class="btn btn-outline btn-sm" onclick="openBackupFile()">导入</button>
      </div>
    </div>
    <div class="setting-item">
      <div>
        <div class="setting-label">🗑️ 重置数据</div>
        <div class="setting-desc">清除所有学习记录</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="resetAppData()">重置</button>
    </div>
  `;
}

function resetAppData(){
  if(!confirm('确定要重置所有数据吗？此操作不可恢复！')) return;
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(SR.KEY);
  location.reload();
}

function toggleTimer(el){
  state.timerEnabled = !state.timerEnabled;
  el.classList.toggle('on', state.timerEnabled);
  saveState(state);
}

function setStartDate(val){
  state.startDate = val;
  saveState(state);
  renderHome();
  renderSettings();
}

function getTodayString(){
  return new Date().toISOString().slice(0,10);
}

function exportBackup(){
  const payload = {
    app:'申论统一修炼台',
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    state,
    sr:SR.load()
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `申论统一修炼台-备份-${getTodayString()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openBackupFile(){
  const input = document.getElementById('backup-file');
  input.value = '';
  input.click();
}

function importBackup(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const data = JSON.parse(reader.result);
      const nextState = data.state || data;
      if(!nextState || typeof nextState !== 'object') throw new Error('invalid state');
      const ok = confirm('导入会覆盖当前学习记录，确定继续吗？建议先导出当前数据备份。');
      if(!ok) return;
      saveState(nextState);
      if(data.sr && typeof data.sr === 'object') SR.save(data.sr);
      alert('导入成功，页面将自动刷新。');
      location.reload();
    }catch(e){
      alert('导入失败：请选择有效的备份 JSON 文件。');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ============================================================
// INITIALIZATION
// ============================================================
function init(){
  // Initialize SR data for all cards
  Object.values(CARD_DB).forEach(deck=>{
    deck.cards.forEach(c=>SR.initCard(c.id));
  });

  // Add error badge
  const errorTab = document.querySelector('.tab[data-view="errors"]');
  const badge = document.createElement('span');
  badge.className='badge';
  badge.style.display='none';
  errorTab.appendChild(badge);
  updateErrorBadge();

  // Auto-record study day
  recordStudyDay();

  // Render initial view
  renderHome();
}

window.addEventListener('beforeunload', ()=>{
  if(currentSkill && document.getElementById('practice-exercise') && !document.getElementById('practice-exercise').classList.contains('hidden')){
    flushDraftSave();
  }
});

init();
