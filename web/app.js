/* ============================================================
   CAT Prep — app.js  (self-contained SPA)
   ============================================================ */
'use strict';

/* ── Section metadata ─────────────────────────────────────── */
const SECTIONS = {
  Quant: { label: 'Quantitative Aptitude',      badge: 'badge-blue',   emoji: '🔢' },
  VARC:  { label: 'Verbal Ability & RC',         badge: 'badge-purple', emoji: '📖' },
  DILR:  { label: 'Data Interpretation & LR',    badge: 'badge-orange', emoji: '📊' },
};

/* ── Global state ─────────────────────────────────────────── */
const S = {
  data: null,           // questions.json payload
  view: 'home',
  search: '',
  sectionFilter: 'all',
  selectedTopics: new Set(),

  // active test
  test: null,
  /*  {
        questions, current, answers,
        timeLimit, timeRemaining, interval,
        startTime, endTime, review
      }
  */
  results: null,
};

/* ── DOM helpers ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr = s => String(s).replace(/'/g, "&#39;");
function fmt(s) { const m = Math.floor(s/60), sec = s%60; return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }

let _searchTimer;
function debounceSearch(fn) { clearTimeout(_searchTimer); _searchTimer = setTimeout(fn, 200); }

async function typeset(el) {
  if (!el || !window.MathJax?.typesetPromise) return;
  try { await MathJax.typesetPromise([el]); } catch(_) {}
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ── CAT Scoring ──────────────────────────────────────────── */
function extractNum(s) {
  // Extract first number from string (handles "40 flights", "24 cm", "1,21,000")
  const cleaned = String(s).replace(/,/g, '');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

function tiTAMatch(userVal, correctVal) {
  if (!userVal && userVal !== 0) return false;
  const u = String(userVal).trim();
  const c = String(correctVal ?? '').trim();
  if (u === c) return true;
  // Numeric comparison
  const un = extractNum(u), cn = extractNum(c);
  if (!isNaN(un) && !isNaN(cn)) return Math.abs(un - cn) < 1e-9;
  return false;
}

function calcScore(questions, answers) {
  let correct=0, wrong=0, unattempted=0, score=0;
  for (const q of questions) {
    const sel = answers[q.id]?.selected ?? null;
    if (sel === null || sel === '') { unattempted++; continue; }
    const ok = q.isTITA
      ? tiTAMatch(sel, q.correctAnswer)
      : Number(sel) === Number(q.correctIndex);
    if (ok) { correct++; score += 3; }
    else    { wrong++;   if (!q.isTITA) score -= 1; }
  }
  return { correct, wrong, unattempted, score, total: questions.length, maxScore: questions.length * 3 };
}

/* ── View management ──────────────────────────────────────── */
function showView(name) {
  ['home','browse','setup','test','results'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  ['home','browse'].forEach(id => {
    const nav = $(`nav-${id}`);
    if (nav) nav.classList.toggle('active', id === name);
  });
  S.view = name;
  const bar = $('selection-bar');
  if (bar) bar.classList.toggle('visible', name === 'browse' && S.selectedTopics.size > 0);
}

/* ══════════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════════ */
function renderHome() {
  const { topics, total } = S.data;
  const years = [...new Set(S.data.questions.map(q=>q.year))].length;
  const popular = [...topics].sort((a,b)=>b.count-a.count).slice(0,10);

  const sectionCards = Object.entries(SECTIONS).map(([s,m]) => {
    const qs   = topics.filter(t=>t.section===s).reduce((a,b)=>a+b.count,0);
    const tpcs = topics.filter(t=>t.section===s).length;
    return `<div class="quick-card" onclick="App.navigate('browse','${s}')">
      <div class="quick-card-icon">${m.emoji}</div>
      <div class="quick-card-title">${m.label}</div>
      <div class="quick-card-desc">${tpcs} topics · ${qs} questions</div>
    </div>`;
  }).join('');

  const pillsHtml = popular.map(t => `
    <div class="topic-pill" onclick="App.selectAndSetup('${escAttr(t.section)}','${escAttr(t.topic)}')">
      <span>${SECTIONS[t.section]?.emoji||'📌'}</span>
      <span>${esc(t.topic)}</span>
      <span class="pill-count">${t.count}</span>
    </div>`).join('');

  $('view-home').innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:2rem 1.5rem 4rem">

      <div class="home-hero">
        <div class="hero-content">
          <div class="hero-title">Master CAT,<br>One Topic at a Time.</div>
          <div class="hero-subtitle">Search topics, practice from past papers (2017–2025), and track your performance — all offline.</div>
          <div class="hero-actions">
            <button class="btn btn-orange btn-xl" onclick="App.navigate('browse')">Browse Topics</button>
            <button class="btn btn-xl" style="background:rgba(255,255,255,.15);color:white;border:2px solid rgba(255,255,255,.3)" onclick="App.startQuickTest()">
              Quick Practice →
            </button>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-num">${total.toLocaleString()}</div><div class="hero-stat-label">Questions</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${topics.length}</div><div class="hero-stat-label">Topics</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${years}</div><div class="hero-stat-label">Years</div></div>
            <div class="hero-stat"><div class="hero-stat-num">3</div><div class="hero-stat-label">Sections</div></div>
          </div>
        </div>
      </div>

      <div class="home-section-title">⚡ Quick Start</div>
      <div class="quick-start-grid">
        ${sectionCards}
        <div class="quick-card" onclick="App.startQuickTest()">
          <div class="quick-card-icon">🎲</div>
          <div class="quick-card-title">Random Test</div>
          <div class="quick-card-desc">Mixed · 20 questions · 30 min</div>
        </div>
      </div>

      <div class="home-section-title">🔥 Popular Topics</div>
      <div class="popular-topics-grid">${pillsHtml}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   BROWSE
   ══════════════════════════════════════════════════════════ */
function renderBrowse(sectionOverride) {
  if (sectionOverride) S.sectionFilter = sectionOverride;
  showView('browse');

  $('view-browse').innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:2rem 1.5rem 4rem">
      <div class="browse-header">
        <div class="browse-title">Browse Topics</div>
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="topic-search" placeholder="Search topics…"
            value="${esc(S.search)}" oninput="App.onSearch(this.value)" autocomplete="off">
        </div>
      </div>

      <div class="filter-tabs">
        ${['all','Quant','VARC','DILR'].map(f => {
          const label = f==='all'?'All Sections':SECTIONS[f]?.label||f;
          return `<button class="filter-tab${S.sectionFilter===f?' active':''}"
            onclick="App.setFilter('${f}')">${label}</button>`;
        }).join('')}
      </div>

      <div id="topics-container"></div>
    </div>`;

  renderTopicsGrid();
  updateSelectionBar();
}

function renderTopicsGrid() {
  const container = $('topics-container');
  if (!container) return;

  const search = S.search.toLowerCase();
  const filter = S.sectionFilter;
  const { topics } = S.data;

  const filtered = topics.filter(t => {
    if (filter !== 'all' && t.section !== filter) return false;
    if (search && !t.topic.toLowerCase().includes(search) && !t.section.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No topics match</div><p class="text-muted">Try a different search term.</p></div>`;
    return;
  }

  const groups = {};
  filtered.forEach(t => { (groups[t.section] = groups[t.section]||[]).push(t); });

  container.innerHTML = ['Quant','VARC','DILR'].filter(s=>groups[s]).map(s => {
    const meta = SECTIONS[s]||{};
    const sList = groups[s];
    const totalQ = sList.reduce((a,b)=>a+b.count,0);
    return `
      <div class="section-group">
        <div class="section-header">
          <span class="section-label">${meta.emoji} ${meta.label||s}</span>
          <span class="badge ${meta.badge||'badge-blue'}">${sList.length} topics</span>
          <span class="section-count">${totalQ} questions</span>
        </div>
        <div class="topics-grid">
          ${sList.map(t => topicCardHtml(t)).join('')}
        </div>
      </div>`;
  }).join('');
}

function topicCardHtml(t) {
  const sel = S.selectedTopics.has(`${t.section}::${t.topic}`);
  const yrs = t.years.slice(-4).join(', ');
  const m = SECTIONS[t.section]||{};
  return `
    <div class="topic-card${sel?' selected':''}" data-section="${t.section}"
         onclick="App.toggleTopic('${escAttr(t.section)}','${escAttr(t.topic)}')">
      <div class="topic-card-top">
        <div class="topic-card-name">${esc(t.topic)}</div>
        <div class="topic-card-select">${sel?'✓':''}</div>
      </div>
      <div class="topic-card-count">${t.count}</div>
      <div class="topic-card-meta">
        <span class="badge ${m.badge||'badge-blue'}">${t.section}</span>
        <span>· ${yrs}</span>
      </div>
      <div class="topic-card-actions">
        <button class="btn btn-primary btn-sm"
          onclick="event.stopPropagation();App.selectAndSetup('${escAttr(t.section)}','${escAttr(t.topic)}')">
          Practice →
        </button>
        <button class="btn btn-ghost btn-sm"
          onclick="event.stopPropagation();App.toggleTopic('${escAttr(t.section)}','${escAttr(t.topic)}')">
          ${sel?'Deselect':'+ Add'}
        </button>
      </div>
    </div>`;
}

function updateSelectionBar() {
  const bar = $('selection-bar');
  if (!bar) return;
  const n = S.selectedTopics.size;
  bar.classList.toggle('visible', S.view === 'browse' && n > 0);
  $('sel-count').textContent = n;
  $('sel-qcount').textContent = poolForSelection().length;
}

function poolForSelection() {
  if (!S.data) return [];
  if (S.selectedTopics.size === 0) return S.data.questions;
  return S.data.questions.filter(q => S.selectedTopics.has(`${q.section}::${q.topic}`));
}

/* ══════════════════════════════════════════════════════════
   TEST SETUP
   ══════════════════════════════════════════════════════════ */
function renderSetup() {
  if (!S.data) return;
  showView('setup');

  const selected = [...S.selectedTopics];
  const pool = poolForSelection();
  const maxQ = Math.min(pool.length, 100);

  const countOptions = [10,15,20,25,30,40,50].filter(n=>n<=maxQ).map(n =>
    `<option value="${n}"${n===20?' selected':''}>${n} Questions</option>`
  ).join('') + `<option value="${maxQ}"${maxQ<=50?' selected':''}>All (${maxQ})</option>`;

  const tagsHtml = selected.length === 0
    ? `<span class="text-muted text-sm">No topics selected — all ${S.data.total} questions in pool.</span>`
    : selected.map(k => {
        const [sec, topic] = k.split('::');
        return `<span class="selected-topic-tag">
          ${esc(topic)}
          <button onclick="App.removeSetupTopic('${escAttr(sec)}','${escAttr(topic)}')">×</button>
        </span>`;
      }).join('');

  $('view-setup').innerHTML = `
    <div style="max-width:700px;margin:0 auto;padding:2rem 1.5rem">
      <div class="setup-title">Configure Your Test</div>
      <div class="setup-subtitle">Set preferences and start practicing.</div>

      <div class="setup-form-group">
        <label class="form-label">Topics in Pool <span class="form-sublabel">(${pool.length} questions available)</span></label>
        <div class="selected-topics-list">${tagsHtml}</div>
      </div>

      <div class="setup-form-group">
        <label class="form-label">Questions &amp; Order</label>
        <div class="options-row">
          <div class="option-group">
            <select id="setup-count" class="nice-select">${countOptions}</select>
          </div>
          <div class="option-group">
            <select id="setup-order" class="nice-select">
              <option value="random" selected>Random Order</option>
              <option value="sequential">Sequential (Year-wise)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="setup-form-group">
        <label class="form-label">Time Limit</label>
        <div class="options-row">
          <div class="option-group">
            <select id="setup-time" class="nice-select">
              <option value="0">No Limit (Practice Mode)</option>
              <option value="600">10 Minutes</option>
              <option value="900">15 Minutes</option>
              <option value="1200" selected>20 Minutes</option>
              <option value="1800">30 Minutes</option>
              <option value="2700">45 Minutes</option>
              <option value="3600">60 Minutes</option>
              <option value="5400">90 Minutes</option>
            </select>
          </div>
        </div>
      </div>

      <div class="test-info-box">
        <strong>CAT Scoring:</strong>&nbsp;
        MCQ — Correct <strong>+3</strong>, Wrong <strong>−1</strong>, Unattempted <strong>0</strong>
        &nbsp;·&nbsp;
        TITA — Correct <strong>+3</strong>, Wrong / Unattempted <strong>0</strong>
      </div>

      <div class="setup-actions">
        <button class="btn btn-secondary" onclick="App.navigate('browse')">← Back</button>
        <button class="btn btn-orange btn-lg" onclick="App.beginTest()">Start Test →</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   TEST
   ══════════════════════════════════════════════════════════ */
function beginTest() {
  if (!S.data) return;
  const count     = parseInt($('setup-count')?.value || '20', 10);
  const timeLimit = parseInt($('setup-time')?.value || '1200', 10);
  const order     = $('setup-order')?.value || 'random';

  let pool = poolForSelection();
  if (pool.length === 0) pool = S.data.questions;
  if (order === 'random') pool = shuffle(pool);
  const questions = pool.slice(0, count);

  const answers = {};
  questions.forEach(q => { answers[q.id] = { selected: null, flagged: false }; });

  S.test = {
    questions, current: 0, answers,
    timeLimit, timeRemaining: timeLimit,
    interval: null, startTime: new Date(), endTime: null,
    review: false,
  };
  S.results = null;
  showView('test');
  buildTestShell();
  renderQuestion();
  if (timeLimit > 0) startTimer();
}

function startTimer() {
  const t = S.test;
  if (!t) return;
  t.interval = setInterval(() => {
    t.timeRemaining--;
    updateTimerEl();
    if (t.timeRemaining <= 0) { clearInterval(t.interval); endTest(true); }
  }, 1000);
}

function updateTimerEl() {
  const el = $('test-timer');
  if (!el) return;
  const r = S.test.timeRemaining;
  el.textContent = fmt(r);
  el.className = 'test-timer' + (r<=60?' danger':r<=180?' warning':'');
}

function buildTestShell() {
  const t = S.test;
  const noTimer = t.timeLimit === 0;

  $('view-test').innerHTML = `
    <div class="test-header">
      <div class="test-progress-info">
        <span class="test-q-counter" id="test-q-counter">Q <strong>1</strong> / ${t.questions.length}</span>
        <span id="test-ans-count" class="text-sm text-muted">0 answered</span>
      </div>
      ${noTimer
        ? `<span class="badge badge-blue">Practice Mode — No Timer</span>`
        : `<div class="test-timer" id="test-timer">${fmt(t.timeRemaining)}</div>`}
      <div><button class="btn btn-danger btn-sm" onclick="App.confirmEndTest()">End Test</button></div>
    </div>

    <div class="test-progress-bar">
      <div class="test-progress-bar-fill" id="test-prog" style="width:0%"></div>
    </div>

    <div class="test-body">
      <div class="test-nav" id="test-nav">
        <div class="test-nav-title">Questions</div>
        <div class="q-grid" id="q-grid"></div>
        <div class="test-nav-legend">
          <div class="legend-item"><div class="legend-dot unanswered"></div>Unanswered</div>
          <div class="legend-item"><div class="legend-dot answered"></div>Answered</div>
          <div class="legend-item"><div class="legend-dot flagged"></div>Flagged</div>
        </div>
      </div>
      <div class="test-main" id="test-main"></div>
    </div>`;
}

function renderQuestion() {
  const t = S.test;
  if (!t) return;
  const q   = t.questions[t.current];
  const ans = t.answers[q.id];
  const rev = t.review;
  const main = $('test-main');
  if (!main) return;

  // Update header counters
  const counter = $('test-q-counter');
  if (counter) counter.innerHTML = `Q <strong>${t.current+1}</strong> / ${t.questions.length}`;
  const prog = $('test-prog');
  if (prog) prog.style.width = `${((t.current+1)/t.questions.length)*100}%`;
  updateAnsweredCount();
  renderQGrid();

  const secMeta = SECTIONS[q.section] || {};

  let html = '';

  // Badges row
  html += `<div class="question-source">
    <span class="badge ${secMeta.badge||'badge-blue'}">${q.section}</span>
    <span class="badge badge-yellow">${q.exam} ${q.year} S${q.slot}</span>
    <span class="text-sm text-muted">${esc(q.topic)}</span>
    ${q.isTITA ? '<span class="badge badge-green">TITA</span>' : ''}
  </div>`;

  // Context toggle
  if (q.context) {
    html += `<div>
      <button class="context-toggle" onclick="App.toggleCtx(this)" id="ctx-toggle">
        📋 Show Context / Passage <span>▼</span>
      </button>
      <div class="context-block" id="ctx-block">${q.context}</div>
    </div>`;
  }

  // Question card
  html += `<div class="question-card">
    <div class="question-number">Question ${t.current+1}</div>
    <div class="question-text" id="q-text">${q.questionHtml || '<p>Question text unavailable.</p>'}</div>
  </div>`;

  // Options / TITA
  if (!q.isTITA && q.options?.length) {
    html += `<div class="options-list">`;
    q.options.forEach((optHtml, i) => {
      const letter = String.fromCharCode(65+i);
      let cls = 'option-item';
      if (rev) {
        if (i === q.correctIndex) cls += ' correct';
        else if (ans.selected === i && i !== q.correctIndex) cls += ' wrong';
      } else {
        if (ans.selected === i) cls += ' selected';
      }
      html += `<div class="${cls}" onclick="${rev?'':`App.selectMCQ(${i})`}" ${rev?'style="cursor:default"':''}>
        <div class="option-letter">${letter}</div>
        <div class="option-text">${optHtml}</div>
      </div>`;
    });
    html += `</div>`;
  } else if (q.isTITA) {
    const val = ans.selected ?? '';
    if (rev) {
      const ok = val !== '' && val !== null && tiTAMatch(val, q.correctAnswer);
      html += `<div class="tita-input-wrap">
        <span class="text-muted text-sm">Your answer:</span>
        <span style="font-family:monospace;font-size:1.1rem;font-weight:700;padding:.4rem .75rem;border-radius:6px;
          background:${ok?'var(--green-50)':val!==''&&val!==null?'var(--red-50)':'var(--bg)'};
          color:${ok?'var(--green)':val!==''&&val!==null?'var(--red)':'var(--text-muted)'};
          border:2px solid ${ok?'var(--green)':val!==''&&val!==null?'var(--red)':'var(--border)'}">
          ${esc(String(val||'—'))}
        </span>
        <span class="text-muted text-sm">Correct: <strong>${esc(String(q.correctAnswer??'?'))}</strong></span>
      </div>`;
    } else {
      html += `<div class="tita-input-wrap">
        <input type="text" id="tita-in" class="tita-input"
          value="${esc(String(val??''))}" placeholder="Enter numerical answer"
          inputmode="decimal" oninput="App.selectTITA(this.value)">
        <span class="tita-hint">Type your answer (no options)</span>
      </div>`;
    }
  }

  // Footer
  html += `<div class="question-footer">
    <div class="q-footer-left">
      <button class="btn btn-ghost btn-sm" onclick="App.goTo(${t.current-1})" ${t.current===0?'disabled':''}>← Prev</button>
      ${!rev ? `
        <button class="btn-flag${ans.flagged?' flagged':''}" onclick="App.toggleFlag()">
          ${ans.flagged?'⚑ Flagged':'⚐ Flag'}
        </button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red-light)"
          onclick="App.clearAns()" ${ans.selected===null||ans.selected===''?'disabled':''}>Clear</button>
      ` : ''}
    </div>
    <div class="q-footer-right">
      ${t.current < t.questions.length-1
        ? `<button class="btn btn-primary btn-sm" onclick="App.goTo(${t.current+1})">Next →</button>`
        : rev
          ? `<button class="btn btn-orange btn-sm" onclick="App.navigate('results')">← Back to Results</button>`
          : `<button class="btn btn-orange btn-sm" onclick="App.confirmEndTest()">Finish Test</button>`}
    </div>
  </div>`;

  main.innerHTML = html;
  main.scrollTop = 0;

  // Collapse context by default
  const ctxBlock = $('ctx-block');
  const ctxToggle = $('ctx-toggle');
  if (ctxBlock) { ctxBlock.style.display = 'none'; }
  if (ctxToggle) ctxToggle.querySelector('span').textContent = '▶';

  typeset(main);
}

function renderQGrid() {
  const grid = $('q-grid');
  if (!grid || !S.test) return;
  const t = S.test;
  grid.innerHTML = t.questions.map((q,i) => {
    const a = t.answers[q.id];
    const answered = a.selected !== null && a.selected !== '';
    let cls = 'q-dot';
    if (i === t.current)  cls += ' current';
    if (answered)         cls += ' answered';
    if (a.flagged)        cls += ' flagged';
    return `<div class="${cls}" onclick="App.goTo(${i})" title="Q${i+1}">${i+1}</div>`;
  }).join('');
}

function updateAnsweredCount() {
  const el = $('test-ans-count');
  if (!el || !S.test) return;
  const n = Object.values(S.test.answers).filter(a => a.selected !== null && a.selected !== '').length;
  el.textContent = `${n} answered`;
}

/* ══════════════════════════════════════════════════════════
   RESULTS
   ══════════════════════════════════════════════════════════ */
function endTest(timeUp=false) {
  const t = S.test;
  if (!t) return;
  if (t.interval) clearInterval(t.interval);
  t.endTime = new Date();
  S.results = calcScore(t.questions, t.answers);
  S.results.timeTaken = Math.round((t.endTime - t.startTime) / 1000);
  S.results.timeUp = timeUp;
  showView('results');
  renderResults();
}

function renderResults() {
  const r = S.results;
  const t = S.test;
  if (!r || !t) return;

  const pct   = r.maxScore > 0 ? Math.round(r.score / r.maxScore * 100) : 0;
  const acc   = r.correct + r.wrong > 0 ? Math.round(r.correct / (r.correct + r.wrong) * 100) : 0;
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🎯' : pct >= 40 ? '💪' : '📈';

  // Topic stats
  const topicMap = {};
  t.questions.forEach(q => {
    const key = `${q.section}::${q.topic}`;
    if (!topicMap[key]) topicMap[key] = { section: q.section, topic: q.topic, correct:0, wrong:0, unattempted:0, score:0 };
    const sel = t.answers[q.id]?.selected ?? null;
    if (sel === null || sel === '') { topicMap[key].unattempted++; return; }
    const ok = q.isTITA
      ? tiTAMatch(sel, q.correctAnswer)
      : Number(sel) === Number(q.correctIndex);
    if (ok) { topicMap[key].correct++; topicMap[key].score += 3; }
    else    { topicMap[key].wrong++;   if (!q.isTITA) topicMap[key].score -= 1; }
  });

  const topicRows = Object.values(topicMap).sort((a,b) => b.score - a.score);

  $('view-results').innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:2rem 1.5rem 4rem">

      <div class="results-hero">
        <div class="results-emoji">${emoji}</div>
        <div class="results-title">${r.timeUp ? "Time's Up!" : 'Test Complete!'}</div>
        <div class="results-subtitle">${r.timeUp ? 'Timer ran out.' : 'Submitted.'} · Time: ${fmt(r.timeTaken)}</div>
        <div class="score-display">
          <div class="score-num">${r.score}</div>
          <div class="score-label">Score · max ${r.maxScore}</div>
        </div>
        <div class="score-breakdown">
          <div class="score-item correct"><div class="score-item-num">${r.correct}</div><div class="score-item-label">Correct</div></div>
          <div class="score-item wrong"><div class="score-item-num">${r.wrong}</div><div class="score-item-label">Wrong</div></div>
          <div class="score-item skipped"><div class="score-item-num">${r.unattempted}</div><div class="score-item-label">Skipped</div></div>
          <div class="score-item"><div class="score-item-num">${acc}%</div><div class="score-item-label">Accuracy</div></div>
        </div>
      </div>

      <div class="results-section-title">📊 Summary</div>
      <div class="stats-grid">
        <div class="stat-card correct"><div class="stat-card-num">${r.correct}</div><div class="stat-card-label">Correct (+${r.correct*3} pts)</div></div>
        <div class="stat-card wrong"><div class="stat-card-num">${r.wrong}</div><div class="stat-card-label">Wrong (${r.wrong>0?`−${Math.abs(t.questions.filter(q=>!q.isTITA&&t.answers[q.id]?.selected!==null&&Number(t.answers[q.id]?.selected)!==q.correctIndex).length)}`:'0'} pts)</div></div>
        <div class="stat-card skipped"><div class="stat-card-num">${r.unattempted}</div><div class="stat-card-label">Unattempted</div></div>
        <div class="stat-card"><div class="stat-card-num">${r.total}</div><div class="stat-card-label">Total Questions</div></div>
      </div>

      <div class="results-section-title">📚 Topic Breakdown</div>
      <div class="topic-results-table">
        <div class="table-head">
          <div>Topic</div>
          <div style="text-align:right">Correct</div>
          <div style="text-align:right">Wrong</div>
          <div style="text-align:right">Skip</div>
          <div style="text-align:right">Score</div>
        </div>
        ${topicRows.map(row => {
          const tot = row.correct + row.wrong + row.unattempted;
          const barAcc = tot > 0 ? Math.round(row.correct/tot*100) : 0;
          const barColor = barAcc >= 70 ? 'var(--green-light)' : barAcc >= 40 ? 'var(--yellow-light)' : 'var(--red-light)';
          const scoreColor = row.score > 0 ? 'var(--green)' : row.score < 0 ? 'var(--red)' : 'var(--text-muted)';
          return `<div class="table-row">
            <div>
              <div style="font-weight:600;font-size:.88rem">${esc(row.topic)}</div>
              <div style="font-size:.72rem;color:var(--text-muted)">${row.section}</div>
              <div class="accuracy-bar"><div class="accuracy-fill" style="width:${barAcc}%;background:${barColor}"></div></div>
            </div>
            <div class="correct-cell" style="text-align:right">${row.correct}</div>
            <div class="wrong-cell"   style="text-align:right">${row.wrong}</div>
            <div style="text-align:right;color:var(--text-muted)">${row.unattempted}</div>
            <div style="text-align:right;font-weight:700;color:${scoreColor}">${row.score>0?'+':''}${row.score}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="results-section-title">🔍 Review Answers</div>
      <div id="review-list">
        ${t.questions.map((q,i) => {
          const sel = t.answers[q.id]?.selected ?? null;
          let status = 'unattempted';
          if (sel !== null && sel !== '') {
            const ok = q.isTITA ? String(sel).trim()===String(q.correctAnswer??'').trim() : Number(sel)===Number(q.correctIndex);
            status = ok ? 'correct' : 'wrong';
          }
          const statusColor = status==='correct'?'var(--green)':status==='wrong'?'var(--red)':'var(--text-muted)';
          const statusLabel = status==='correct'?'✓ Correct':status==='wrong'?'✗ Wrong':'— Skipped';
          const meta = SECTIONS[q.section]||{};
          return `<div class="review-question-card">
            <div class="review-card-header" onclick="App.toggleReview(${i},this)">
              <div style="display:flex;align-items:center;gap:.75rem;flex:1">
                <div class="review-status-dot ${status}"></div>
                <span class="text-sm fw-600">Q${i+1}. ${esc(q.topic)}</span>
                <span class="badge ${meta.badge||'badge-blue'}" style="font-size:.65rem">${q.section}</span>
              </div>
              <span style="font-size:.82rem;font-weight:700;color:${statusColor}">${statusLabel}</span>
              <span style="margin-left:.75rem;color:var(--text-muted)" class="rev-arrow">▼</span>
            </div>
            <div class="review-card-body hidden" id="rev-${i}"></div>
          </div>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:2rem">
        <button class="btn btn-orange btn-lg" onclick="App.navigate('browse')">Practice More</button>
        <button class="btn btn-secondary btn-lg" onclick="App.navigate('home')">Home</button>
      </div>
    </div>`;
}

function toggleReview(index, headerEl) {
  const body = $(`rev-${index}`);
  if (!body) return;
  const arrow = headerEl.querySelector('.rev-arrow');
  if (!body.classList.contains('hidden')) {
    body.classList.add('hidden');
    if (arrow) arrow.textContent = '▼';
    return;
  }
  body.classList.remove('hidden');
  if (arrow) arrow.textContent = '▲';
  if (body.dataset.loaded) return;
  body.dataset.loaded = '1';

  const t = S.test;
  const q = t.questions[index];
  const ans = t.answers[q.id];
  const sel = ans?.selected ?? null;

  let html = '';
  if (q.context) html += `<div class="context-block" style="margin-bottom:1rem;max-height:200px;overflow-y:auto">${q.context}</div>`;
  html += `<div class="question-text">${q.questionHtml}</div>`;

  if (!q.isTITA && q.options?.length) {
    html += `<div class="options-list" style="margin-top:1rem">`;
    q.options.forEach((opt, i) => {
      let cls = 'option-item';
      if (i === q.correctIndex) cls += ' correct';
      else if (sel === i && i !== q.correctIndex) cls += ' wrong';
      html += `<div class="${cls}" style="cursor:default">
        <div class="option-letter">${String.fromCharCode(65+i)}</div>
        <div class="option-text">${opt}</div>
      </div>`;
    });
    html += `</div>`;
  } else if (q.isTITA) {
    const ok = sel !== null && sel !== '' && tiTAMatch(sel, q.correctAnswer);
    html += `<div style="margin-top:1rem;display:flex;gap:1.5rem;font-size:.88rem;flex-wrap:wrap">
      <span>Your answer: <strong style="color:${ok?'var(--green)':sel!==null&&sel!==''?'var(--red)':'var(--text-muted)'}">${esc(String(sel??'—'))}</strong></span>
      <span>Correct: <strong style="color:var(--green)">${esc(String(q.correctAnswer??'?'))}</strong></span>
    </div>`;
  }

  body.innerHTML = `<div style="padding:1.25rem">${html}</div>`;
  typeset(body);
}

/* ══════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════ */
function showModal({ title, message, confirmText='Confirm', danger=true, onConfirm }) {
  $('modal-title').textContent   = title;
  $('modal-message').textContent = message;
  const btn = $('modal-confirm');
  btn.textContent = confirmText;
  btn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  btn.onclick = () => { closeModal(); if (onConfirm) onConfirm(); };
  $('modal-overlay').classList.remove('hidden');
}

function closeModal() { $('modal-overlay').classList.add('hidden'); }

/* ══════════════════════════════════════════════════════════
   PUBLIC APP API  (called from HTML onclick)
   ══════════════════════════════════════════════════════════ */
const App = {
  navigate(view, param) {
    // Pause timer if leaving test without ending
    if (S.test && !S.test.review && !S.results && view !== 'test') {
      if (S.test.interval) { clearInterval(S.test.interval); S.test.interval = null; }
    }
    switch(view) {
      case 'home':    showView('home');  if (S.data) renderHome(); break;
      case 'browse':  renderBrowse(param||null);  break;
      case 'setup':   renderSetup();    break;
      case 'results': showView('results'); if (S.results) renderResults(); break;
      case 'test':
        if (S.test) {
          showView('test');
          if (!$('test-main')) buildTestShell();
          renderQuestion();
          // Resume timer if applicable
          if (S.test.timeLimit > 0 && !S.test.interval && S.test.timeRemaining > 0) startTimer();
        }
        break;
    }
  },

  onSearch(val) { S.search = val; debounceSearch(renderTopicsGrid); },
  setFilter(f)  { S.sectionFilter = f; renderTopicsGrid(); document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.textContent.trim() === (f==='all'?'All Sections':SECTIONS[f]?.label||f))); },

  toggleTopic(section, topic) {
    const k = `${section}::${topic}`;
    S.selectedTopics.has(k) ? S.selectedTopics.delete(k) : S.selectedTopics.add(k);
    updateSelectionBar();
    renderTopicsGrid();
  },

  clearSelection() { S.selectedTopics.clear(); updateSelectionBar(); renderTopicsGrid(); },

  selectAndSetup(section, topic) {
    S.selectedTopics.clear();
    S.selectedTopics.add(`${section}::${topic}`);
    renderSetup();
  },

  startQuickTest() { S.selectedTopics.clear(); renderSetup(); },

  removeSetupTopic(section, topic) {
    S.selectedTopics.delete(`${section}::${topic}`);
    renderSetup();
    updateSelectionBar();
  },

  beginTest,

  goTo(i) {
    if (!S.test || i < 0 || i >= S.test.questions.length) return;
    S.test.current = i;
    renderQuestion();
  },

  selectMCQ(i) {
    if (!S.test || S.test.review) return;
    const q = S.test.questions[S.test.current];
    S.test.answers[q.id].selected = i;
    renderQuestion();
    updateAnsweredCount();
  },

  selectTITA(val) {
    if (!S.test || S.test.review) return;
    const q = S.test.questions[S.test.current];
    S.test.answers[q.id].selected = val.trim() === '' ? null : val;
    updateAnsweredCount();
    renderQGrid();
  },

  clearAns() {
    if (!S.test) return;
    const q = S.test.questions[S.test.current];
    S.test.answers[q.id].selected = null;
    renderQuestion();
    updateAnsweredCount();
  },

  toggleFlag() {
    if (!S.test) return;
    const q = S.test.questions[S.test.current];
    S.test.answers[q.id].flagged ^= true;
    renderQuestion();
    renderQGrid();
  },

  confirmEndTest() {
    if (!S.test) return;
    const answered = Object.values(S.test.answers).filter(a => a.selected !== null && a.selected !== '').length;
    showModal({
      title: 'Submit Test?',
      message: `You answered ${answered} / ${S.test.questions.length} questions. Submit now?`,
      confirmText: 'Yes, Submit',
      onConfirm: () => endTest(false),
    });
  },

  toggleCtx(btn) {
    const block = $('ctx-block');
    if (!block) return;
    const hidden = block.style.display === 'none';
    block.style.display = hidden ? '' : 'none';
    btn.querySelector('span').textContent = hidden ? '▼' : '▶';
  },

  toggleReview,
  showModal,
  closeModal,
};

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  $('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  const homeView = $('view-home');
  homeView.classList.remove('hidden');
  homeView.innerHTML = `<div class="loading-screen"><div class="spinner"></div><p>Loading question bank…</p></div>`;

  try {
    const res = await fetch('questions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    S.data = await res.json();
    renderHome();
    showView('home');
  } catch (e) {
    homeView.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">questions.json not found</div>
        <p class="text-muted" style="max-width:440px;margin:0 auto;line-height:1.8">
          Generate it first:<br>
          <code style="background:var(--bg);padding:2px 8px;border-radius:4px;font-size:.85rem">python parse_questions.py</code><br><br>
          Then serve this <code>web/</code> folder:<br>
          <code style="background:var(--bg);padding:2px 8px;border-radius:4px;font-size:.85rem">cd web &amp;&amp; python -m http.server 8080</code><br><br>
          Then open <strong>http://localhost:8080</strong>
        </p>
      </div>`;
  }
});
