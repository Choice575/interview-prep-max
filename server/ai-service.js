const AICoach = require('../ai-coach.js');
const { createAiSettingsStore } = require('./ai-settings.js');

const SYSTEM_PROMPT = [
  'Ты — технический наставник по DevOps-собеседованиям.',
  'Разбери только переданные агрегаты контрольной, не выдумывай факты о пользователе.',
  'Верни строго JSON без markdown: summary, strengths, gaps, nextSteps, caution.',
  'strengths, gaps и nextSteps — массивы максимум из трёх коротких строк.',
  'Ответ пиши по-русски, конкретно и без общих мотивационных фраз.'
].join(' ');

function serviceError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function endpointFrom(config) {
  if (config.endpoint) return config.endpoint;
  const base = String(config.baseUrl || '').replace(/\/+$/, '');
  return base ? base + '/chat/completions' : '';
}

function extractContent(response) {
  const content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item && item.text || '').join('');
  return '';
}

function parseReviewResponse(response) {
  const content = extractContent(response).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (_) { throw serviceError('AI provider returned invalid JSON', 'AI_BAD_RESPONSE', 502); }
  const review = AICoach.normaliseReview(parsed);
  if (!review) throw serviceError('AI provider returned an incomplete review', 'AI_BAD_RESPONSE', 502);
  return review;
}

function createMockReview(payload) {
  const local = AICoach.buildLocalReview(payload);
  return {
    ...local,
    summary: 'AI-разбор готов. ' + local.summary,
    caution: 'Рекомендации основаны на агрегатах этой контрольной.',
    // buildLocalReview ставит source:'local'. Отдавать его из mock-ответа
    // противоречиво: клиент всё равно перезапишет поле на 'ai', но сам ответ
    // эндпоинта утверждал бы, что разбор локальный.
    source: 'mock'
  };
}

// Конфигурация читается на каждом запросе, а не один раз при старте: иначе
// настройки, сохранённые из UI, применялись бы только после перезапуска
// сервера — то есть UI-настройки были бы бесполезны.
function describe(config) {
  const provider = String(config.provider || '').trim().toLowerCase();
  const endpoint = endpointFrom(config);
  const mock = provider === 'mock';
  const enabled = mock || ((provider === 'openai-compatible' || !provider) && !!endpoint && !!config.apiKey && !!config.model);
  return { provider, endpoint, mock, enabled, apiKey: config.apiKey || '', model: config.model || '' };
}

function createAiService(env = process.env, dependencies = {}) {
  const settings = dependencies.settingsStore || createAiSettingsStore(env, dependencies);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;

  function status() {
    // Синхронно: роут /api/ai/status отвечает без await, а форма ответа
    // зафиксирована в server.test.js.
    const view = describe(settings.resolveSync());
    return {
      enabled: view.enabled,
      provider: view.mock ? 'mock' : view.enabled ? 'openai-compatible' : 'disabled',
      model: view.enabled && !view.mock ? view.model : null
    };
  }

  async function review(rawPayload) {
    const payload = AICoach.normaliseReviewPayload(rawPayload);
    if (!payload.control.attempted) throw serviceError('Control session has no answers', 'INVALID_REVIEW_INPUT', 400);
    const config = await settings.resolve();
    const view = describe(config);
    const { endpoint, apiKey, model, mock } = view;
    if (!view.enabled) throw serviceError('AI backend is not configured', 'AI_NOT_CONFIGURED', 503);
    if (mock) return createMockReview(payload);
    if (typeof fetchImpl !== 'function') throw serviceError('Fetch is unavailable on the server', 'AI_UNAVAILABLE', 503);

    const temperature = Number.isFinite(config.temperature) ? config.temperature : 0.2;
    const maxTokens = Number.isFinite(config.maxTokens) ? config.maxTokens : 700;
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.min(60000, Number(config.timeoutMs) || 15000));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(payload) }
          ]
        }),
        signal: controller.signal
      });
    } catch (error) {
      const timeoutFailure = error && error.name === 'AbortError';
      throw serviceError(timeoutFailure ? 'AI provider timed out' : 'AI provider is unavailable', timeoutFailure ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', timeoutFailure ? 504 : 502);
    } finally {
      clearTimeout(timeout);
    }

    let data;
    try { data = await response.json(); }
    catch (_) { throw serviceError('AI provider returned a non-JSON response', 'AI_BAD_RESPONSE', 502); }
    if (!response.ok) throw serviceError('AI provider rejected the request', 'AI_PROVIDER_ERROR', 502);
    return parseReviewResponse(data);
  }

  return { status, review };
}

module.exports = { createAiService, parseReviewResponse, serviceError };
