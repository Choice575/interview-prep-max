(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxDate = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const DAY_MS = 86400000;

  function utcDayStamp(year, month, day) {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date;
  }

  function parseDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = utcDayStamp(year, month, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day };
  }

  function isValidDateKey(value) { return parseDateKey(value) !== null; }

  function localDateKey(now) {
    const date = new Date(Number.isFinite(now) ? now : Date.now());
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function daysUntil(targetKey, now) {
    const target = parseDateKey(targetKey);
    if (!target) return null;
    const today = new Date(Number.isFinite(now) ? now : Date.now());
    const targetStamp = utcDayStamp(target.year, target.month, target.day).getTime();
    const todayStamp = utcDayStamp(today.getFullYear(), today.getMonth() + 1, today.getDate()).getTime();
    return Math.round((targetStamp - todayStamp) / DAY_MS);
  }

  return { isValidDateKey, localDateKey, daysUntil };
});
