const AICoach = require('../ai-coach.js');

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

function endpointFromEnv(env) {
  if (env.IPMAX_AI_ENDPOINT) return env.IPMAX_AI_ENDPOINT;
  const base = (env.IPMAX_AI_BASE_URL || '').replace(/\/$/, '');
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
    caution: 'Рекомендации основаны на агрегатах этой контрольной.'
  };
}

function createAiService(env = process.env, dependencies = {}) {
  const provider = (env.IPMAX_AI_PROVIDER || '').trim().toLowerCase();
  const endpoint = endpointFromEnv(env);
  const apiKey = env.IPMAX_AI_API_KEY || '';
  const model = env.IPMAX_AI_MODEL || '';
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const mock = provider === 'mock';
  const enabled = mock || ((provider === 'openai-compatible' || !provider) && !!endpoint && !!apiKey && !!model);

  function status() {
    return {
      enabled,
      provider: mock ? 'mock' : enabled ? 'openai-compatible' : 'disabled',
      model: enabled && !mock ? model : null
    };
  }

  async function review(rawPayload) {
    const payload = AICoach.normaliseReviewPayload(rawPayload);
    if (!payload.control.attempted) throw serviceError('Control session has no answers', 'INVALID_REVIEW_INPUT', 400);
    if (!enabled) throw serviceError('AI backend is not configured', 'AI_NOT_CONFIGURED', 503);
    if (mock) return createMockReview(payload);
    if (typeof fetchImpl !== 'function') throw serviceError('Fetch is unavailable on the server', 'AI_UNAVAILABLE', 503);

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.min(60000, Number(env.IPMAX_AI_TIMEOUT_MS) || 15000));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
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
