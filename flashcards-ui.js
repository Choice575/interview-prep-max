(function(root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./answer-ui.js') : root.IPMaxAnswerUI);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxFlashcardsUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function(AnswerUI) {
  'use strict';

  const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  const CATEGORY_ORDER = [
    'Linux и Bash', 'Python', 'Сети и протоколы', 'Docker и реестры образов', 'Kubernetes',
    'Git и CI/CD', 'Ansible', 'Terraform и облака', 'Мониторинг и диагностика',
    'Базы данных и очереди', 'Безопасность', 'Архитектура и надёжность',
    'Карьера и собеседования', 'MLOps'
  ];
  const REVIEW_MODES = [['all', 'Все'], ['new', 'Новые'], ['learning', 'Изучаю'], ['known', 'Знаю'], ['due', 'К повторению']];

  function cardState(card, progress, now) {
    const record = hasOwn(progress, card && card.id) && progress[card.id] && typeof progress[card.id] === 'object'
      ? progress[card.id] : null;
    if (!record || !Number(record.lastSeen)) return 'new';
    return Number(record.repetitions) >= 2 ? 'known' : 'learning';
  }

  function isDue(card, progress, now) {
    const record = hasOwn(progress, card && card.id) ? progress[card.id] : null;
    return !!record && Number(record.nextReviewAt) > 0 && Number(record.nextReviewAt) <= now;
  }

  function filterCards(cards, options) {
    const settings = options || {};
    const progress = settings.progress && typeof settings.progress === 'object' ? settings.progress : {};
    const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();
    const collection = String(settings.collection || 'all');
    const search = String(settings.search || '').trim().toLowerCase();
    const mode = String(settings.mode || 'all');
    let result = Array.isArray(cards) ? cards.slice() : [];

    if (collection !== 'all') result = result.filter(card => card && card.collection === collection);
    if (search) {
      result = result.filter(card => [card && card.question, card && card.code, card && card.answer, card && card.collection, card && card.sourceTitle]
        .some(value => String(value || '').toLowerCase().includes(search)));
    }
    if (mode === 'due') result = result.filter(card => isDue(card, progress, now));
    else if (['new', 'learning', 'known'].includes(mode)) {
      result = result.filter(card => cardState(card, progress, now) === mode);
    }
    return result;
  }

  function summarizeCards(cards, progress, now) {
    const list = Array.isArray(cards) ? cards : [];
    const records = progress && typeof progress === 'object' ? progress : {};
    const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const summary = { total: list.length, new: 0, learning: 0, known: 0, due: 0 };
    list.forEach(card => {
      summary[cardState(card, records, at)]++;
      if (isDue(card, records, at)) summary.due++;
    });
    return summary;
  }

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function active(value, expected) {
    return value === expected ? ' active' : '';
  }

  function normalizeDecks(input) {
    const state = input || {};
    const supplied = Array.isArray(state.decks) ? state.decks : [];
    const decks = supplied.filter(deck => deck && deck.id && Array.isArray(deck.cards)).map(deck => ({
      id: String(deck.id),
      label: String(deck.label || deck.id),
      description: String(deck.description || ''),
      cards: deck.cards
    }));
    if (decks.length) return decks;
    return [{
      id: 'study', label: 'Учебная программа', description: 'Карточки из учебной программы.',
      cards: Array.isArray(state.cards) ? state.cards : []
    }];
  }

  function selectedDeck(decks, id) {
    return decks.find(deck => deck.id === id) || decks[0];
  }

  function safeHttpUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function renderPage(input) {
    const state = input || {};
    const decks = normalizeDecks(state);
    const deck = selectedDeck(decks, String(state.deck || decks[0].id));
    const cards = deck.cards;
    const progress = state.progress && typeof state.progress === 'object' ? state.progress : {};
    const now = Number.isFinite(Number(state.now)) ? Number(state.now) : Date.now();
    const collection = String(state.collection || 'all');
    const mode = String(state.mode || 'all');
    const search = String(state.search || '');
    const filtered = filterCards(cards, { collection, mode, search, progress, now });
    const index = filtered.length ? Math.max(0, Math.min(filtered.length - 1, Math.floor(Number(state.index) || 0))) : 0;
    const card = filtered[index];
    const summary = summarizeCards(cards, progress, now);
    const counts = new Map();
    cards.forEach(item => {
      if (item && item.collection) counts.set(item.collection, (counts.get(item.collection) || 0) + 1);
    });
    const collections = CATEGORY_ORDER.filter(name => counts.has(name))
      .concat([...counts.keys()].filter(name => !CATEGORY_ORDER.includes(name)).sort());

    const deckSwitch = '<div class="flashcards-decks" role="tablist" aria-label="Источник карточек">' +
      decks.map(item => '<button type="button" role="tab" aria-selected="' + (item.id === deck.id) + '" class="flashcards-deck' + active(deck.id, item.id) + '" data-flashcards-action="deck" data-deck="' + escapeText(item.id) + '">' +
        '<span>' + escapeText(item.label) + '</span><strong>' + item.cards.length + '</strong></button>').join('') +
      '</div><p class="flashcards-deck-description">' + escapeText(deck.description) + '</p>';

    const categories = '<div class="flashcards-categories" role="group" aria-label="Категории карточек">' +
      [['all', 'Все категории', cards.length], ...collections.map(name => [name, name, counts.get(name)])]
        .map(([value, label, count]) => '<button type="button" class="flashcards-category' + active(collection, value) +
          '" aria-pressed="' + (collection === value) + '" data-flashcards-action="category" data-collection="' + escapeText(value) +
          '"><span>' + escapeText(label) + '</span><strong>' + count + '</strong></button>').join('') + '</div>';

    const controls = categories + '<div class="flashcards-controls">' +
      '<label>Поиск<input class="form-input" type="search" value="' + escapeText(search) + '" placeholder="Вопрос, ответ, тема или источник" aria-describedby="flashcards-search-hint" data-flashcards-filter="search"></label>' +
      '<p id="flashcards-search-hint" class="flashcards-search-hint">Поиск начинается во всех категориях выбранного набора. Затем можно выбрать категорию для уточнения.</p>' +
      '<div class="flashcards-modes" role="group" aria-label="Режим повторения">' +
      REVIEW_MODES
        .map(item => '<button type="button" class="chip' + active(mode, item[0]) + '" data-flashcards-action="mode" data-mode="' + item[0] + '">' + item[1] + '</button>').join('') +
      '</div><div class="flashcards-results">' +
      '<p role="status" aria-live="polite">Найдено: <strong>' + filtered.length + '</strong> из ' + cards.length +
      ' · ' + escapeText(collection === 'all' ? 'Все категории' : collection) +
      ' · ' + escapeText((REVIEW_MODES.find(item => item[0] === mode) || REVIEW_MODES[0])[1]) + '</p>' +
      (collection !== 'all' || mode !== 'all'
        ? '<button type="button" class="btn btn-quiet" data-flashcards-action="reset-filters">Все категории и режимы</button>' : '') +
      '</div></div>';

    const stats = '<div class="flashcards-stats" aria-label="Прогресс по карточкам">' +
      '<span><strong>' + summary.total + '</strong> всего</span>' +
      '<span><strong>' + summary.new + '</strong> новых</span>' +
      '<span><strong>' + summary.learning + '</strong> изучаю</span>' +
      '<span><strong>' + summary.known + '</strong> знаю</span>' +
      '<span><strong>' + summary.due + '</strong> к повторению</span></div>';

    if (!card) {
      return deckSwitch + stats + controls + '<div class="empty-state"><div class="icon">✅</div><p>Для выбранных фильтров карточек нет.</p></div>';
    }

    // Код и вывод команд хранятся отдельно от вопроса: склеенный в строку YAML
    // или лог нечитаем, а ответ часто ссылается именно на него (аудит C5).
    const code = card.code ? '<pre class="study-evidence study-card-code" aria-label="Код или вывод к вопросу">' + escapeText(card.code) + '</pre>' : '';
    const sourceUrl = safeHttpUrl(card.sourceUrl);
    const source = card.sourceTitle
      ? '<div class="study-card-source">Источник: ' + (sourceUrl
        ? '<a href="' + escapeText(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeText(card.sourceTitle) + '</a>'
        : escapeText(card.sourceTitle)) + '</div>'
      : '';

    const answer = state.revealed
      ? '<div class="study-card-answer"><div class="study-card-answer-label">Ответ</div>' + AnswerUI.render(card.answer,card.shortAnswer) + '</div>' +
        '<div class="study-card-rates" aria-label="Оценить ответ">' +
        '<button type="button" class="btn btn-outline" data-flashcards-action="rate" data-outcome="fail">Не знаю</button>' +
        '<button type="button" class="btn btn-outline" data-flashcards-action="rate" data-outcome="partial">Повторить</button>' +
        '<button type="button" class="btn btn-primary" data-flashcards-action="rate" data-outcome="pass">Знаю</button></div>'
      : '<button type="button" class="btn btn-primary" data-flashcards-action="reveal">Показать ответ</button>';

    return deckSwitch + stats + controls + '<article class="study-card" data-card-id="' + escapeText(card.id) + '">' +
      '<div class="study-card-meta"><span>' + escapeText(card.collection) + (card.depth === 'deep' ? ' <span class="tag tag-deep">Глубокое погружение</span>' : '') + '</span><span>' + (index + 1) + ' / ' + filtered.length + '</span></div>' +
      '<h2>' + escapeText(card.question) + '</h2>' + code + source + answer +
      '<div class="study-card-nav"><button type="button" class="btn btn-quiet" data-flashcards-action="prev"' + (index === 0 ? ' disabled' : '') + '>← Предыдущая</button>' +
      '<button type="button" class="btn btn-quiet" data-flashcards-action="next"' + (index >= filtered.length - 1 ? ' disabled' : '') + '>Следующая →</button></div></article>';
  }

  function create(services, environment) {
    const source = services || {};
    const env = environment || {};
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const state = { deck: 'study', collection: 'all', mode: 'all', search: '', revealed: false, index: 0 };
    const run = (name, ...args) => typeof source[name] === 'function' ? source[name](...args) : undefined;

    function currentDecks() {
      return normalizeDecks({ decks: run('getDecks'), cards: run('getCards') || [] });
    }

    function currentDeck() {
      return selectedDeck(currentDecks(), state.deck);
    }

    function currentCards() {
      return filterCards(currentDeck().cards, {
        collection: state.collection, mode: state.mode, search: state.search,
        progress: run('getProgress') || {}, now: run('now')
      });
    }

    function render() {
      const host = doc && doc.getElementById('flashcards-host');
      if (!host) return [];
      const focused = doc.activeElement;
      const restoreFocus = focused && host.contains && host.contains(focused);
      const focusAttributes = restoreFocus ? ['data-flashcards-action', 'data-collection', 'data-mode', 'data-deck', 'data-flashcards-filter']
        .map(name => [name, focused.getAttribute(name)]).filter(([, value]) => value !== null) : [];
      const selection = restoreFocus && focused.getAttribute('data-flashcards-filter') === 'search'
        ? [focused.selectionStart, focused.selectionEnd] : null;
      const filtered = currentCards();
      if (state.index >= filtered.length) state.index = Math.max(0, filtered.length - 1);
      host.innerHTML = renderPage({
        decks: currentDecks(), deck: currentDeck().id, progress: run('getProgress') || {}, now: run('now'),
        collection: state.collection, mode: state.mode, search: state.search,
        revealed: state.revealed, index: state.index
      });
      bind(host);
      if (focusAttributes.length) {
        const replacement = [...host.querySelectorAll('[data-flashcards-action], [data-flashcards-filter]')]
          .find(element => focusAttributes.every(([name, value]) => element.getAttribute(name) === value));
        if (replacement) {
          replacement.focus({ preventScroll: true });
          if (selection) replacement.setSelectionRange(...selection);
        }
      }
      return filtered;
    }

    function reveal() { state.revealed = true; render(); }
    function move(delta) {
      const cards = currentCards();
      if (!cards.length) return;
      state.index = Math.max(0, Math.min(cards.length - 1, state.index + delta));
      state.revealed = false;
      render();
    }
    function rate(outcome) {
      if (!['pass', 'partial', 'fail'].includes(outcome)) return false;
      const card = currentCards()[state.index];
      if (!card) return false;
      run('recordAttempt', card, outcome, currentDeck());
      const remaining = currentCards();
      const cardStillVisible = remaining.some(item => String(item.id) === String(card.id));
      if (cardStillVisible) state.index++;
      else state.index = Math.min(state.index, Math.max(0, remaining.length - 1));
      state.revealed = false;
      render();
      return true;
    }
    function setFilter(name, value) {
      if (name === 'collection') state.collection = String(value || 'all');
      if (name === 'mode') state.mode = String(value || 'all');
      if (name === 'search') {
        state.search = String(value || '');
        if (state.search.trim()) state.collection = 'all';
      }
      state.index = 0;
      state.revealed = false;
      render();
    }
    function resetFilters() {
      state.collection = 'all';
      state.mode = 'all';
      state.index = 0;
      state.revealed = false;
      render();
    }
    function setDeck(value) {
      const next = currentDecks().find(deck => deck.id === String(value || ''));
      if (!next) return false;
      state.deck = next.id;
      state.collection = 'all';
      state.search = '';
      state.index = 0;
      state.revealed = false;
      render();
      return true;
    }
    function bind(host) {
      host.querySelectorAll('[data-flashcards-action]').forEach(element => {
        element.addEventListener('click', () => {
          const action = element.getAttribute('data-flashcards-action');
          if (action === 'reveal') reveal();
          else if (action === 'rate') rate(element.getAttribute('data-outcome'));
          else if (action === 'prev') move(-1);
          else if (action === 'next') move(1);
          else if (action === 'mode') setFilter('mode', element.getAttribute('data-mode'));
          else if (action === 'deck') setDeck(element.getAttribute('data-deck'));
          else if (action === 'category') setFilter('collection', element.getAttribute('data-collection'));
          else if (action === 'reset-filters') {
            resetFilters();
            host.querySelector('[data-flashcards-filter="search"]').focus();
          }
        });
      });
      host.querySelectorAll('[data-flashcards-filter]').forEach(element => {
        const name = element.getAttribute('data-flashcards-filter');
        const eventName = name === 'search' ? 'input' : 'change';
        element.addEventListener(eventName, () => setFilter(name, element.value));
      });
    }

    return { render, reveal, rate, next: () => move(1), prev: () => move(-1), setFilter, resetFilters, setDeck, getState: () => ({ ...state }) };
  }

  return { cardState, isDue, filterCards, summarizeCards, normalizeDecks, renderPage, create };
});
