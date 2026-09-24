(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxCommandCheck = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Проверка введённой команды в тренажёре (аудит B8). Точное сравнение строк
  // отклоняло верные ответы: «ss -ltnp» вместо «ss -tlnp», «-l -t» вместо «-lt».
  // Здесь команда разбирается на слова, а короткие флаги сравниваются как
  // множество. Аргументы и длинные опции сравниваются по порядку.

  function tokenize(command) {
    const tokens = [];
    const text = String(command || '').trim();
    let current = '';
    let quote = null;
    let started = false;
    for (const char of text) {
      if (quote) {
        if (char === quote) quote = null; else current += char;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; started = true; continue; }
      if (/\s/.test(char)) {
        if (started) { tokens.push(current); current = ''; started = false; }
        continue;
      }
      current += char;
      started = true;
    }
    if (started) tokens.push(current);
    return tokens;
  }

  // Разбивает конвейер на отдельные команды: «a | b» сравнивается по частям.
  function segments(tokens) {
    const parts = [[]];
    tokens.forEach(token => {
      if (token === '|' || token === '&&' || token === ';') parts.push([token], []);
      else parts[parts.length - 1].push(token);
    });
    return parts.filter(part => part.length);
  }

  function isShortFlagGroup(token) {
    return /^-[A-Za-z]+$/.test(token);
  }

  function describe(part) {
    const flags = new Set();
    const rest = [];
    part.forEach((token, index) => {
      if (index > 0 && isShortFlagGroup(token)) [...token.slice(1)].forEach(flag => flags.add(flag));
      else rest.push(token);
    });
    return { rest, flags };
  }

  function sameSet(left, right) {
    return left.size === right.size && [...left].every(item => right.has(item));
  }

  function equivalent(answer, expected) {
    const left = segments(tokenize(answer));
    const right = segments(tokenize(expected));
    if (!left.length || left.length !== right.length) return false;
    return left.every((part, index) => {
      const a = describe(part);
      const b = describe(right[index]);
      return sameSet(a.flags, b.flags) && a.rest.length === b.rest.length && a.rest.every((token, position) => token === b.rest[position]);
    });
  }

  // Подсказка при ошибке: какие короткие флаги лишние или пропущены.
  function hint(answer, expected) {
    const left = segments(tokenize(answer));
    const right = segments(tokenize(expected));
    if (!left.length) return 'Введите команду.';
    if (left.length !== right.length || left[0][0] !== right[0][0]) return 'Другая команда или конвейер.';
    const a = describe(left[0]);
    const b = describe(right[0]);
    const missing = [...b.flags].filter(flag => !a.flags.has(flag)).map(flag => '-' + flag);
    const extra = [...a.flags].filter(flag => !b.flags.has(flag)).map(flag => '-' + flag);
    const notes = [];
    if (missing.length) notes.push('не хватает ' + missing.join(' '));
    if (extra.length) notes.push('лишние ' + extra.join(' '));
    return notes.length ? 'Почти: ' + notes.join(', ') + '.' : 'Команда та же, но аргументы отличаются.';
  }

  function check(answer, task) {
    const expected = task && Array.isArray(task.opts) ? task.opts[task.answer] : '';
    const accepted = [expected].concat(Array.isArray(task && task.accept) ? task.accept : []).filter(Boolean);
    const ok = accepted.some(item => equivalent(answer, item));
    return { ok, expected, hint: ok ? '' : hint(answer, expected) };
  }

  return { tokenize, equivalent, hint, check };
});
