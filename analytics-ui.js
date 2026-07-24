(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAnalyticsUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const GRADES = ['Junior', 'Middle', 'Senior'];
  const CATEGORIES = [
    { id: 'definition', label: 'Определение' },
    { id: 'scenario', label: 'Сценарий' },
    { id: 'tradeoff', label: 'Trade-off' }
  ];

  function progressFor(question, progress) {
    if (!question || !progress) return null;
    return Object.prototype.hasOwnProperty.call(progress, question.id) ? progress[question.id] : null;
  }

  function isMastered(question, progress) {
    const item = progressFor(question, progress);
    return !!item && Number(item.correct || 0) > Number(item.wrong || 0);
  }

  function calculateReadiness(questions, progress) {
    let answered = 0;
    let mastered = 0;
    (Array.isArray(questions) ? questions : []).forEach(question => {
      const item = progressFor(question, progress);
      if (!item || Number(item.correct || 0) + Number(item.wrong || 0) <= 0) return;
      answered++;
      if (Number(item.correct || 0) > Number(item.wrong || 0)) mastered++;
    });
    const score = answered ? Math.round(mastered / answered * 100) : 0;
    return { answered, mastered, score, band: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low' };
  }

  function calculateGradeReadiness(questions, progress) {
    const grades = new Map(GRADES.map(grade => [grade, { grade, total: 0, mastered: 0, score: 0 }]));
    (Array.isArray(questions) ? questions : []).forEach(question => {
      const item = grades.get(question.level || 'Junior');
      if (!item) return;
      item.total++;
      if (isMastered(question, progress)) item.mastered++;
    });
    return GRADES.map(grade => {
      const item = grades.get(grade);
      item.score = item.total ? Math.round(item.mastered / item.total * 100) : 0;
      return item;
    });
  }

  function selectNextQuestions(questions, progress, random, limit) {
    const byTopic = new Map();
    (Array.isArray(questions) ? questions : []).forEach(question => {
      const item = progressFor(question, progress);
      if (item && Number(item.wrong || 0) < Number(item.correct || 0)) return;
      const topic = String(question.topic || 'Без темы');
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(question);
    });

    const sample = typeof random === 'function' ? random : Math.random;
    const maximum = Number.isInteger(limit) && limit > 0 ? limit : 10;
    return [...byTopic.entries()]
      .sort((left, right) => left[1].length - right[1].length || left[0].localeCompare(right[0]))
      .slice(0, maximum)
      .map(([, topicQuestions]) => {
        const value = Number(sample());
        const index = Math.min(topicQuestions.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * topicQuestions.length)));
        return topicQuestions[index];
      });
  }

  function calculateWeakSpots(questions, progress) {
    return (Array.isArray(questions) ? questions : []).map(question => {
      const item = progressFor(question, progress);
      const wrong = Number(item && item.wrong || 0);
      const total = Number(item && item.correct || 0) + wrong;
      if (!wrong || total < 2) return null;
      return { question, wrong, total, score: Math.round(wrong / total * 100) };
    }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, 5);
  }

  function calculateAverageSeconds(progress) {
    let total = 0;
    let count = 0;
    Object.values(progress || {}).forEach(item => {
      if (!Array.isArray(item && item.times)) return;
      item.times.forEach(value => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 0) return;
        total += seconds;
        count++;
      });
    });
    return count ? Math.round(total / count) : 0;
  }

  function create(services, environment) {
    const source = services || {};
    const env = environment || {};
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const random = env.random || Math.random;
    const now = env.now || (() => Date.now());

    function escapeHtml(value) {
      if (typeof source.escape === 'function') return source.escape(value);
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
    function get(key, fallback) { return typeof source.get === 'function' ? source.get(key, fallback) : fallback; }
    function getQuestions() { const value = typeof source.getQuestions === 'function' ? source.getQuestions() : []; return Array.isArray(value) ? value : []; }
    function getProgress() { const value = typeof source.getQuestionProgress === 'function' ? source.getQuestionProgress() : {}; return value && typeof value === 'object' ? value : {}; }
    function byId(id) { return doc ? doc.getElementById(id) : null; }
    function run(action, value) { if (typeof source[action] === 'function') source[action](value); }

    function renderEmptyAnalytics() {
      const cards = byId('stat-cards');
      if (!cards) return;
      cards.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📊</div><p>Статистика появится после первых ответов</p><button type="button" class="btn btn-primary btn-sm" data-analytics-action="start-exam">⚡ Начать экзамен</button><button type="button" class="btn btn-outline btn-sm" data-analytics-action="start-diagnostic" style="margin-left:8px">🔬 Пройти диагностику</button></div>';
      const exam = cards.querySelector('[data-analytics-action="start-exam"]');
      const diagnostic = cards.querySelector('[data-analytics-action="start-diagnostic"]');
      if (exam) exam.addEventListener('click', () => run('startExam'));
      if (diagnostic) diagnostic.addEventListener('click', () => run('startDiagnostic'));
      ['history-list', 'analytics-seg-bar', 'analytics-seg-label', 'act-bars', 'act-total', 'cat-stat-rows', 'weak-spots-list', 'readiness-content', 'next-questions-list'].forEach(id => {
        const element = byId(id);
        if (element) element.innerHTML = '';
      });
      const gradeCard = byId('grade-readiness-card');
      if (gradeCard && typeof gradeCard.remove === 'function') gradeCard.remove();
      const canvas = byId('radarCanvas');
      const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }

    function renderStats(stats, progress, mistakes) {
      const cards = byId('stat-cards');
      if (!cards) return;
      const total = Number(stats.total || 0);
      const correct = Number(stats.correct || 0);
      const accuracy = total ? Math.round(correct / total * 100) : 0;
      const mistakeCount = mistakes && typeof mistakes === 'object' ? Object.keys(mistakes).length : 0;
      cards.innerHTML = [
        { value: total, label: 'Всего ответов', color: 'var(--primary)' },
        { value: correct, label: 'Правильных', color: 'var(--green)' },
        { value: total - correct, label: 'Неправильных', color: 'var(--red)' },
        { value: accuracy + '%', label: 'Точность', color: 'var(--yellow)' },
        { value: mistakeCount, label: 'В ошибках', color: 'var(--red)' },
        { value: Number(get('streak_best', 0) || 0), label: 'Лучшая серия', color: 'var(--orange)' },
        { value: calculateAverageSeconds(progress) + 'с', label: 'Среднее время ответа', color: 'var(--primary-h)' }
      ].map(item => '<div class="stat-card"><div class="stat-val" style="color:' + item.color + '">' + item.value + '</div><div class="stat-label">' + item.label + '</div></div>').join('');
    }

    function renderHistory() {
      const target = byId('history-list');
      if (!target) return;
      const history = get('history', []);
      const tagMap = source.tagMap || {};
      target.innerHTML = Array.isArray(history) && history.length ? history.map(item => {
        const topic = String(item.topic || '');
        const mapped = Object.prototype.hasOwnProperty.call(tagMap, topic) ? String(tagMap[topic]) : 'tf';
        const tag = /^[a-z0-9-]+$/i.test(mapped) ? mapped : 'tf';
        return '<div class="history-item"><span style="color:var(--text3);font-size:11px">' + escapeHtml(item.date) + '</span><span class="tag tag-' + tag + '">' + escapeHtml(topic) + '</span><span style="color:' + (item.correct ? 'var(--green)' : 'var(--red)') + '">' + (item.correct ? '✅' : '❌') + '</span></div>';
      }).join('') : '<p style="color:var(--text3);font-size:13px;padding:10px">Нет данных</p>';
    }

    function renderCoverage(questions, progress) {
      const bar = byId('analytics-seg-bar');
      const label = byId('analytics-seg-label');
      const total = questions.length;
      let mastered = 0;
      let errors = 0;
      questions.forEach(question => {
        const item = progressFor(question, progress);
        if (!item) return;
        if (Number(item.correct || 0) > Number(item.wrong || 0)) mastered++;
        else if (Number(item.wrong || 0) > 0) errors++;
      });
      const percent = value => total ? value / total * 100 : 0;
      if (bar) bar.innerHTML = '<div class="seg-ok" style="width:' + percent(mastered) + '%"></div><div class="seg-err" style="width:' + percent(errors) + '%"></div><div class="seg-none" style="width:' + percent(total - mastered - errors) + '%"></div>';
      if (label) label.textContent = '✅ Изучено: ' + mastered + ' | ❌ Ошибки: ' + errors + ' | ⭕ Не отвечено: ' + (total - mastered - errors) + ' из ' + total;
    }

    function drawRadar(questions, progress) {
      const canvas = byId('radarCanvas');
      if (!canvas || typeof canvas.getContext !== 'function') return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const allTopics = typeof source.getTopics === 'function' ? source.getTopics() : [];
      const topics = (Array.isArray(allTopics) ? allTopics : []).slice(0, 8);
      const count = topics.length;
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      if (!count) return;
      const scores = topics.map(topic => {
        const topicQuestions = questions.filter(question => question.topic === topic);
        return topicQuestions.length ? topicQuestions.filter(question => isMastered(question, progress)).length / topicQuestions.length : 0;
      });
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 36;
      const dark = !doc || doc.documentElement.getAttribute('data-theme') !== 'light';
      const angle = index => index * 2 * Math.PI / count - Math.PI / 2;
      for (let ring = 1; ring <= 5; ring++) {
        context.beginPath();
        for (let index = 0; index < count; index++) {
          const current = angle(index);
          const currentRadius = ring * radius / 5;
          const x = centerX + Math.cos(current) * currentRadius;
          const y = centerY + Math.sin(current) * currentRadius;
          index ? context.lineTo(x, y) : context.moveTo(x, y);
        }
        context.closePath();
        context.strokeStyle = dark ? '#2e3348' : '#e2e8f0';
        context.lineWidth = 1;
        context.stroke();
      }
      for (let index = 0; index < count; index++) {
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(centerX + Math.cos(angle(index)) * radius, centerY + Math.sin(angle(index)) * radius);
        context.strokeStyle = dark ? '#2e3348' : '#e2e8f0';
        context.stroke();
      }
      context.beginPath();
      scores.forEach((score, index) => {
        const current = angle(index);
        const currentRadius = score * radius;
        const x = centerX + Math.cos(current) * currentRadius;
        const y = centerY + Math.sin(current) * currentRadius;
        index ? context.lineTo(x, y) : context.moveTo(x, y);
      });
      context.closePath();
      context.fillStyle = 'rgba(99,102,241,.25)';
      context.fill();
      context.strokeStyle = '#6366f1';
      context.lineWidth = 2;
      context.stroke();
      context.textAlign = 'center';
      context.font = 'bold 10px Inter';
      context.fillStyle = dark ? '#94a3b8' : '#475569';
      topics.forEach((topic, index) => {
        const current = angle(index);
        context.fillText(topic, centerX + Math.cos(current) * (radius + 28), centerY + Math.sin(current) * (radius + 28) + 4);
      });
      scores.forEach((score, index) => {
        const current = angle(index);
        const currentRadius = score * radius;
        context.beginPath();
        context.arc(centerX + Math.cos(current) * currentRadius, centerY + Math.sin(current) * currentRadius, 4, 0, Math.PI * 2);
        context.fillStyle = '#6366f1';
        context.fill();
      });
    }

    function renderTimeChart() {
      const bars = byId('act-bars');
      const totalElement = byId('act-total');
      if (!bars) return;
      const daily = get('daily', {});
      const data = [];
      let maximum = 1;
      let total = 0;
      for (let offset = 13; offset >= 0; offset--) {
        const date = new Date(now());
        date.setDate(date.getDate() - offset);
        const key = typeof source.localDateKey === 'function' ? source.localDateKey(date.getTime()) : date.toISOString().slice(0, 10);
        const count = Number(daily && daily[key] || 0);
        data.push({ count, label: date.toLocaleDateString('ru', { day: 'numeric', month: 'numeric' }) });
        maximum = Math.max(maximum, count);
        total += count;
      }
      bars.innerHTML = data.map(item => '<div class="ab-wrap"><div class="ab-cnt">' + (item.count || '') + '</div><div class="ab-fill" style="height:' + Math.max(2, Math.round(item.count / maximum * 68)) + 'px"></div><div class="ab-lbl">' + item.label + '</div></div>').join('');
      if (totalElement) totalElement.textContent = 'Всего за 14 дней: ' + total + ' ответов';
    }

    function renderCategoryStats(questions, progress) {
      const target = byId('cat-stat-rows');
      if (!target) return;
      target.innerHTML = CATEGORIES.map(category => {
        const matches = questions.filter(question => (question.category || 'definition') === category.id);
        if (!matches.length) return '';
        const mastered = matches.filter(question => isMastered(question, progress)).length;
        const score = Math.round(mastered / matches.length * 100);
        return '<div class="cat-row"><div class="cat-row-lbl">' + category.label + ' (' + matches.length + ')</div><div class="cat-row-bar"><div class="cat-row-fill" style="width:' + score + '%"></div></div><div class="cat-row-pct">' + score + '%</div></div>';
      }).join('');
    }

    function renderWeakSpots(questions, progress) {
      const target = byId('weak-spots-list');
      if (!target) return;
      const weak = calculateWeakSpots(questions, progress);
      if (!weak.length) {
        target.innerHTML = '<p style="font-size:12px;color:var(--text3)">Ответьте хотя бы на 2 вопроса, чтобы увидеть слабые места.</p>';
        return;
      }
      target.innerHTML = weak.map(item => {
        const text = String(item.question.q || '');
        return '<div class="weak-item"><span class="weak-pct">' + item.score + '%</span><span class="weak-txt" title="' + escapeAttr(text) + '">' + escapeHtml(text.slice(0, 60)) + (text.length > 60 ? '…' : '') + '</span><span style="font-size:10px;color:var(--text3)">' + item.wrong + '/' + item.total + '</span></div>';
      }).join('');
    }

    function renderGradeReadiness(questions, progress) {
      const container = byId('analytics-three');
      if (!container) return;
      let card = byId('grade-readiness-card');
      if (!card) {
        card = doc.createElement('div');
        card.className = 'card';
        card.id = 'grade-readiness-card';
        container.appendChild(card);
      }
      card.innerHTML = '<div class="card-title">🎯 Готовность по грейдам</div>' + calculateGradeReadiness(questions, progress).map(item => {
        const color = item.score >= 70 ? 'var(--green)' : item.score >= 40 ? 'var(--yellow)' : 'var(--red)';
        return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">' + item.grade + '</span><span style="color:var(--text2)">' + item.mastered + '/' + item.total + ' (' + item.score + '%)</span></div><div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + item.score + '%;background:' + color + ';border-radius:3px"></div></div></div>';
      }).join('') + '<div style="font-size:11px;color:var(--text3);margin-top:8px">Оценка: ≥70% Junior → готов к Middle, ≥70% Middle → готов к Senior</div>';
    }

    function renderReadinessScore(questions, progress) {
      const target = byId('readiness-content');
      if (!target) return;
      const readiness = calculateReadiness(questions, progress);
      if (!readiness.answered) {
        target.innerHTML = '<p style="color:var(--text3);font-size:13px">Ответьте хотя бы на 10 вопросов для оценки готовности.</p>';
        return;
      }
      const labels = {
        high: ['🟢 Высокая', 'Можно пробовать собеседование Middle'],
        medium: ['🟡 Средняя', 'Закройте слабые темы и повторите ошибки'],
        low: ['🔴 Низкая', 'Сосредоточьтесь на базовых темах и регулярной практике']
      };
      const label = labels[readiness.band];
      target.innerHTML = '<div style="font-size:48px;font-weight:800;color:var(--primary-h);margin-bottom:6px">' + readiness.score + '%</div><div style="font-size:16px;font-weight:700;margin-bottom:8px">' + label[0] + '</div><div style="font-size:12px;color:var(--text2);max-width:300px;margin:0 auto">' + label[1] + '</div><div style="font-size:11px;color:var(--text3);margin-top:8px">' + readiness.mastered + '/' + readiness.answered + ' вопросов освоено</div>';
    }

    function renderNextQuestions(questions, progress) {
      const target = byId('next-questions-list');
      if (!target) return;
      const selected = selectNextQuestions(questions, progress, random, 10);
      if (!selected.length) {
        target.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:8px 0">Все вопросы освоены! Пройдите Senior Simulator.</p>';
        return;
      }
      target.innerHTML = selected.map((question, index) => {
        const text = String(question.q || '');
        return '<button type="button" class="weak-item" data-next-question="' + index + '" data-question-id="' + escapeAttr(question.id) + '" style="width:100%;cursor:pointer;border:0"><span style="font-size:11px;color:var(--text3);min-width:20px">#' + (index + 1) + '</span><span class="weak-txt" title="' + escapeAttr(text) + '" style="text-align:left">' + escapeHtml(text.slice(0, 70)) + (text.length > 70 ? '…' : '') + '</span><span style="font-size:10px;color:var(--primary-h)">' + escapeHtml(question.topic) + '</span></button>';
      }).join('') + '<div style="text-align:center;margin-top:8px"><button type="button" class="btn btn-primary btn-sm" data-analytics-action="start-recommended">⚡ Пройти эти ' + selected.length + '</button></div>';
      target.querySelectorAll('[data-next-question]').forEach(button => {
        const question = selected[Number(button.dataset.nextQuestion)];
        button.addEventListener('click', () => run('startQuestion', question));
      });
      const start = target.querySelector('[data-analytics-action="start-recommended"]');
      if (start) start.addEventListener('click', () => run('startQuestions', selected));
    }

    function renderAnalytics() {
      if (!doc) return;
      const stats = get('stats', { total: 0, correct: 0 }) || { total: 0, correct: 0 };
      if (!Number(stats.total || 0)) {
        renderEmptyAnalytics();
        return;
      }
      const progress = getProgress();
      const questions = getQuestions();
      const mistakes = typeof source.getMistakes === 'function' ? source.getMistakes() : {};
      renderStats(stats, progress, mistakes);
      renderHistory();
      renderCoverage(questions, progress);
      drawRadar(questions, progress);
      renderTimeChart();
      renderCategoryStats(questions, progress);
      renderWeakSpots(questions, progress);
      renderGradeReadiness(questions, progress);
      renderReadinessScore(questions, progress);
      renderNextQuestions(questions, progress);
    }

    function renderReadinessHome() {
      if (!doc || !byId('daily-plan-card')) return;
      const content = byId('daily-plan-content');
      if (!content) return;
      const readiness = calculateReadiness(getQuestions(), getProgress());
      let row = byId('home-readiness');
      if (!readiness.answered) {
        if (row && typeof row.remove === 'function') row.remove();
        return;
      }
      if (!row) {
        row = doc.createElement('div');
        row.id = 'home-readiness';
        row.className = 'home-readiness-row';
        content.appendChild(row);
      }
      const icon = readiness.band === 'high' ? '🟢' : readiness.band === 'medium' ? '🟡' : '🔴';
      row.innerHTML = '<span>🎯 Готовность</span><span class="home-readiness-score">' + icon + ' ' + readiness.score + '%</span>';
    }

    return { renderAnalytics, renderReadinessHome };
  }

  return {
    GRADES, CATEGORIES, isMastered, calculateReadiness, calculateGradeReadiness,
    selectNextQuestions, calculateWeakSpots, calculateAverageSeconds, create
  };
});
