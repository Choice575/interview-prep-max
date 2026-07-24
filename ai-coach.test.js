const test = require('node:test');
const assert = require('node:assert/strict');
const AICoach = require('./ai-coach.js');

test('builds a privacy-safe aggregate from a control session', () => {
  const payload = AICoach.buildReviewPayload({
    profile: { role: 'SRE', level: 'Middle' },
    plan: { roleLabel: 'SRE', level: 'Middle', daysUntil: 9, focus: { topic: 'Linux' } },
    session: {
      id: 'control-1', questionIds: [1, 2, 3], topics: ['Linux', 'Terraform'], startedAt: 1,
      attempts: [
        { questionId: 1, topic: 'Linux', score: 0, responseSeconds: 40, at: 2, answer: 'secret text' },
        { questionId: 2, topic: 'Terraform', score: 1, responseSeconds: 20, at: 3 }
      ]
    }
  });

  assert.deepEqual(payload.profile, { role: 'SRE', level: 'Middle', daysUntilInterview: 9 });
  assert.equal(payload.control.attempted, 2);
  assert.equal(payload.control.total, 3);
  assert.equal(payload.control.accuracy, 50);
  assert.equal(payload.control.topics[0].topic, 'Linux');
  assert.doesNotMatch(JSON.stringify(payload), /secret text/);
  assert.doesNotMatch(JSON.stringify(payload), /questionId/);
});

test('aggregates reserved topic names without touching object prototypes', () => {
  const payload = AICoach.buildReviewPayload({
    session: {
      questionIds: ['1'],
      attempts: [{ questionId: '1', topic: '__proto__', score: 1, responseSeconds: 10 }]
    }
  });

  assert.equal(payload.control.topics[0].topic, '__proto__');
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'attempted'), false);
});

test('uses a deterministic local review when the backend is unavailable', async () => {
  const payload = AICoach.normaliseReviewPayload({
    profile: { role: 'DevOps', level: 'Senior' },
    control: { attempted: 3, total: 5, accuracy: 67, topics: [{ topic: 'Kubernetes', attempted: 2, accuracy: 50, averageSeconds: 30 }] }
  });
  const result = await AICoach.review(payload, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.source, 'local');
  assert.match(result.gaps[0], /Kubernetes/);
  assert.equal(result.nextSteps.length, 3);
  assert.equal(result.fallbackReason, 'offline');
});

test('normalises a successful backend review', async () => {
  const result = await AICoach.requestReview({ control: { attempted: 1, total: 1, accuracy: 100 } }, {
    fetchImpl: async (_url, request) => {
      assert.equal(request.method, 'POST');
      return {
        ok: true,
        json: async () => ({ review: { summary: 'Готово', strengths: ['Linux'], gaps: [], nextSteps: ['Повторить'] } })
      };
    }
  });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.nextSteps, ['Повторить']);
});

test('does not label a strong preliminary topic as a gap', () => {
  const result = AICoach.buildLocalReview({
    control: { attempted: 1, total: 10, accuracy: 100, topics: [{ topic: 'Сети', attempted: 1, accuracy: 100, averageSeconds: 20 }] }
  });
  assert.match(result.strengths[0], /Сети/);
  assert.match(result.gaps[0], /предварительный/);
  assert.doesNotMatch(result.gaps[0], /Наибольшего внимания/);
  assert.match(result.nextSteps[0], /оставшиеся 9/);
});
