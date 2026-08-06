const crypto = require('node:crypto');

// Единый разбор Bearer-токена для sync и admin-эндпоинтов. Две копии этой
// логики неизбежно разъехались бы: в одной починили бы регистр схемы или
// timing-safe сравнение, в другой забыли.

function authError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Сравнение постоянного времени. Обычное `===` выходит на первом несовпавшем
 * символе, что даёт побитовый оракул для перебора токена. Сравниваем хеши:
 * timingSafeEqual требует равной длины, а сама длина токена утекать не должна.
 */
function safeEqual(left, right) {
  const one = crypto.createHash('sha256').update(Buffer.from(String(left), 'utf8')).digest();
  const two = crypto.createHash('sha256').update(Buffer.from(String(right), 'utf8')).digest();
  return crypto.timingSafeEqual(one, two);
}

function extractBearer(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  return match ? match[1].trim() : '';
}

/**
 * Проверяет заголовок Authorization против ожидаемого токена.
 * `notConfiguredCode` разделяет два разных состояния: функция выключена
 * (503, настраивать нечего) и токен неверен (401, доступ запрещён).
 */
function requireBearer(header, expected, notConfiguredCode) {
  if (!expected) throw authError('Feature is not configured', notConfiguredCode || 'NOT_CONFIGURED', 503);
  const provided = extractBearer(header);
  if (!provided || !safeEqual(provided, expected)) throw authError('Unauthorized', 'UNAUTHORIZED', 401);
  return true;
}

module.exports = { safeEqual, extractBearer, requireBearer, authError };
