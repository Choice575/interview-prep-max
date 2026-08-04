(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxRouter = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Страницы приложения: значения data-page в боковом меню плюс catalog и chapter.
  // Список закрытый: неизвестный хеш уводит на главную, а не в пустую страницу.
  const PAGES = [
    'home', 'study', 'catalog', 'chapter', 'practices', 'external', 'qbank', 'exam', 'analytics',
    'trainers', 'achievements',
    // The individual trainers keep their own routes: the hub is a way in, not a
    // replacement, and old deep links must not start resolving to the home page.
    'subnet', 'ts', 'cmd', 'labs', 'code', 'ansible', 'dockerfile', 'k8s', 'ports',
    'git', 'regex', 'tips', 'interview'
  ];

  const HOME = { page: 'home', courseSlug: null, chapterId: null };

  function isValidPage(page) {
    return PAGES.indexOf(page) !== -1;
  }

  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      // Битая escape-последовательность (%zz) — не роняем разбор.
      return '';
    }
  }

  /**
   * Режет хеш на сегменты. Ведущие пустые отбрасываются ('#//study' -> study),
   * внутренние СОХРАНЯЮТСЯ: иначе '#/course//chapter/x' схлопнется и слово
   * 'chapter' встанет на место slug — курс с таким именем «найдётся» из ничего.
   */
  function segments(raw) {
    const parts = String(raw || '').replace(/^#/, '').split('/');
    let start = 0;
    while (start < parts.length && parts[start] === '') start += 1;
    return parts.slice(start);
  }

  /**
   * Хеш -> маршрут. Никогда не бросает и всегда возвращает валидный объект:
   * неизвестный или сломанный хеш даёт главную.
   *
   *   ''                                  -> home
   *   '#/study'                           -> { page: 'study' }
   *   '#/course/git'                      -> { page: 'chapter', courseSlug: 'git' }
   *   '#/course/git/chapter/ch_git_w4d1'  -> { page: 'chapter', courseSlug, chapterId }
   */
  function parseHash(hash) {
    const parts = segments(hash);
    if (!parts.length) return Object.assign({}, HOME);

    if (parts[0] === 'course') {
      const slug = decode(parts[1] || '');
      if (!slug) return Object.assign({}, HOME);
      if (parts[2] === 'chapter') {
        const chapterId = decode(parts[3] || '');
        return { page: 'chapter', courseSlug: slug, chapterId: chapterId || null };
      }
      return { page: 'chapter', courseSlug: slug, chapterId: null };
    }

    const page = decode(parts[0]);
    if (!isValidPage(page)) return Object.assign({}, HOME);
    return { page: page, courseSlug: null, chapterId: null };
  }

  /**
   * Маршрут -> хеш. Обратен parseHash для всех валидных маршрутов.
   * Главная даёт '#/' — пустой хеш браузер выкидывает из адресной строки.
   */
  function buildHash(route) {
    const page = route && route.page;
    if (!page || !isValidPage(page)) return '#/';
    if (page === 'chapter' && route.courseSlug) {
      const slug = encodeURIComponent(route.courseSlug);
      if (route.chapterId) {
        return '#/course/' + slug + '/chapter/' + encodeURIComponent(route.chapterId);
      }
      return '#/course/' + slug;
    }
    if (page === 'home') return '#/';
    return '#/' + page;
  }

  // Два маршрута ведут в одно место — чтобы не переписывать хеш без нужды
  // и не плодить лишние записи в истории браузера.
  function sameRoute(left, right) {
    if (!left || !right) return false;
    return left.page === right.page
      && (left.courseSlug || null) === (right.courseSlug || null)
      && (left.chapterId || null) === (right.chapterId || null);
  }

  return {
    PAGES: PAGES,
    isValidPage: isValidPage,
    parseHash: parseHash,
    buildHash: buildHash,
    sameRoute: sameRoute
  };
});
