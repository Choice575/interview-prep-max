const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSyncService, validateSnapshot, safeEqual } = require('./server/sync-service.js');

const TOKEN = 'test-token-with-enough-length-1234';

async function withService(run, env) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ipmax-sync-'));
  try {
    const service = createSyncService({ IPMAX_SYNC_TOKEN: TOKEN, IPMAX_SYNC_DIR: dir, ...(env || {}) });
    await run(service, dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function snapshot(state, updatedAt, deviceId) {
  return { snapshotVersion: 1, updatedAt, deviceId: deviceId || 'device-a', state };
}

test('a short token is rejected at startup', () => {
  assert.throws(() => createSyncService({ IPMAX_SYNC_TOKEN: 'too-short' }), /at least 24 characters/);
});

test('sync is disabled without a token and refuses requests', async () => {
  const service = createSyncService({});
  assert.equal(service.status().enabled, false);
  assert.throws(() => service.authorise('Bearer ' + TOKEN), error => error.code === 'SYNC_NOT_CONFIGURED' && error.status === 503);
});

test('authorisation accepts only the exact bearer token', async () => {
  await withService(async service => {
    assert.equal(service.authorise('Bearer ' + TOKEN), true);
    assert.equal(service.authorise('bearer ' + TOKEN), true, 'схема регистронезависима по RFC 7235');
    for (const header of ['', 'Bearer', 'Bearer wrong-token-value-padding-1234', TOKEN, 'Basic ' + TOKEN]) {
      assert.throws(() => service.authorise(header), error => error.code === 'SYNC_UNAUTHORIZED' && error.status === 401, JSON.stringify(header));
    }
  });
});

test('the snapshot and its backup are written with owner-only permissions', async () => {
  // Снимок — это личный прогресс целиком: ответы, журнал, заметки. Секретов в
  // нём нет (токен исключён), но читать его другим пользователям ОС незачем.
  // По умолчанию fsp.open давал 0644 — поймано на реальном Linux-контейнере.
  if (process.platform === 'win32') return; // Windows игнорирует POSIX-режимы
  await withService(async (service, dir) => {
    service.authorise('Bearer ' + TOKEN);
    await service.push(snapshot({ study_progress: { w1d1: 'done' } }, 1000));
    assert.equal(fs.statSync(path.join(dir, 'snapshot.json')).mode & 0o777, 0o600);

    // Резервная копия создаётся через copyFile: режим должен унаследоваться,
    // иначе прогресс утекает через .backup при верных правах на основном файле.
    await service.push(snapshot({ study_progress: { w1d2: 'done' } }, 2000));
    const backup = fs.readdirSync(dir).find(name => name.includes('backup'));
    assert.ok(backup, 'ожидалась резервная копия после второй записи');
    assert.equal(fs.statSync(path.join(dir, backup)).mode & 0o777, 0o600, 'backup: ' + backup);
  });
});

test('token comparison does not leak length or content', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('short', 'a-much-longer-value'), false, 'разная длина не должна бросать исключение');
});

test('pull on an empty server returns an empty snapshot', async () => {
  await withService(async service => {
    const result = await service.pull();
    assert.deepEqual(result.snapshot.state, {});
    assert.equal(result.snapshot.updatedAt, 0);
    assert.equal(service.status().hasSnapshot, false);
  });
});

test('push persists the snapshot and pull reads it back', async () => {
  await withService(async (service, dir) => {
    await service.push(snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 10 } } }, 1000));
    assert.ok(fs.existsSync(path.join(dir, 'snapshot.json')));
    const result = await service.pull();
    assert.deepEqual(Object.keys(result.snapshot.state.qprog), ['1']);
    const status = service.status();
    assert.equal(status.hasSnapshot, true);
    assert.ok(status.updatedAt > 0);
  });
});

test('two devices pushing different answers both keep their progress', async () => {
  await withService(async service => {
    await service.push(snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 100 } } }, 1000, 'phone'));
    await service.push(snapshot({ qprog: { 2: { correct: 1, wrong: 0, lastSeen: 200 } } }, 2000, 'laptop'));
    const result = await service.pull();
    assert.deepEqual(Object.keys(result.snapshot.state.qprog).sort(), ['1', '2']);
  });
});

test('concurrent pushes do not lose an update', async () => {
  // Без сериализации оба запроса прочитали бы один снимок и второй затёр бы
  // результат первого.
  await withService(async service => {
    await Promise.all([
      service.push(snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 10 } } }, 1000, 'a')),
      service.push(snapshot({ qprog: { 2: { correct: 1, wrong: 0, lastSeen: 20 } } }, 1001, 'b')),
      service.push(snapshot({ qprog: { 3: { correct: 1, wrong: 0, lastSeen: 30 } } }, 1002, 'c'))
    ]);
    const result = await service.pull();
    assert.deepEqual(Object.keys(result.snapshot.state.qprog).sort(), ['1', '2', '3']);
  });
});

test('push reports conflicts for cursor keys', async () => {
  await withService(async service => {
    await service.push(snapshot({ study_position: { week: 2, day: 1 }, theme: 'dark' }, 1000, 'a'));
    const result = await service.push(snapshot({ study_position: { week: 5, day: 3 }, theme: 'light' }, 5000, 'b'));
    assert.ok(result.conflicts.includes('study_position'));
    assert.deepEqual(result.snapshot.state.study_position, { week: 5, day: 3 });
  });
});

test('unknown state keys are rejected', async () => {
  await withService(async service => {
    await assert.rejects(
      () => service.push(snapshot({ evil_key: 1 }, 1000)),
      error => error.code === 'INVALID_SNAPSHOT' && error.status === 400
    );
  });
});

test('local-only keys are not accepted from the network', async () => {
  // progress_backup — копия всего состояния; принимать его значило бы удвоить
  // трафик и позволить клиенту подменить резервную копию.
  await withService(async service => {
    for (const key of ['storage_schema', 'curriculum_version', 'progress_backup']) {
      await assert.rejects(() => service.push(snapshot({ [key]: 1 }, 1000)), error => error.code === 'INVALID_SNAPSHOT');
    }
  });
});

test('prototype pollution attempts are rejected', async () => {
  await withService(async service => {
    const payload = JSON.parse('{"snapshotVersion":1,"updatedAt":1,"deviceId":"x","state":{"qprog":{"__proto__":{"polluted":true}}}}');
    await assert.rejects(() => service.push(payload), error => error.code === 'INVALID_SNAPSHOT');
    assert.equal({}.polluted, undefined);
  });
});

test('oversized snapshots are rejected before touching disk', async () => {
  await withService(async (service, dir) => {
    const big = { history: Array.from({ length: 4000 }, (_, i) => ({ date: 'd' + i, topic: 'Linux'.repeat(20), correct: true })) };
    await assert.rejects(
      () => service.push(snapshot(big, 1000)),
      error => error.code === 'SNAPSHOT_TOO_LARGE' && error.status === 413
    );
    assert.equal(fs.existsSync(path.join(dir, 'snapshot.json')), false);
  }, { IPMAX_SYNC_MAX_BYTES: '65536' });
});

test('malformed snapshots are rejected', async () => {
  await withService(async service => {
    for (const bad of [null, 'text', [], {}, { state: null }, { state: 'x', updatedAt: 1 }, { state: {}, updatedAt: -5 }, { state: {}, updatedAt: 'soon' }]) {
      await assert.rejects(() => service.push(bad), error => error.code === 'INVALID_SNAPSHOT');
    }
  });
});

test('validateSnapshot accepts a realistic payload', () => {
  const payload = snapshot({
    qprog: { 12: { correct: 3, wrong: 1, lastSeen: 1700000000000, ease: 2.4, interval: 6, times: [12, 9] } },
    stats: { total: 40, correct: 28 },
    history: [{ date: '2026-08-01', topic: 'Linux', correct: true }],
    study_progress: { w1d1: 'done' }, study_position: { week: 1, day: 2 },
    coach_journal: [{ id: 'n1', topic: 'Linux', note: 'вывод', at: 1700000000000 }]
  }, 1700000000000);
  const result = validateSnapshot(payload, 1024 * 1024);
  assert.equal(result.updatedAt, 1700000000000);
  assert.deepEqual(result.state.study_progress, { w1d1: 'done' });
});

test('sync validates bounded diagnostic review history entries', () => {
  const review = {
    schemaVersion: 2,
    verdict: { levelEstimate: 'Middle', readiness: 58, summary: 'Нужна практика.' },
    diagnostics: [{ concept: 'Probes', severity: 'high', problemType: 'concept_confusion', evidence: ['Факт'], explanation: 'Разбор', confidence: 0.8 }],
    actionPlan: [{ priority: 1, task: 'Повторить', practice: '5 вопросов', successCriterion: '4/5', page: 'exam', topic: 'Kubernetes' }],
    studyPlan: [], retest: { topics: ['Kubernetes'], categories: ['scenario'], levels: ['Middle'], size: 5, successCriterion: '4/5' }, caution: ''
  };
  const valid = snapshot({ ai_review_history: [{
    id: 'ai-review-1000', at: 1000, source: 'ai', metrics: { accuracy: 50, attempted: 2, total: 2 }, review
  }] }, 1000);
  assert.equal(validateSnapshot(valid, 1024 * 1024).state.ai_review_history.length, 1);

  const malformed = snapshot({ ai_review_history: [{ id: 'broken', at: 1000, review: { schemaVersion: 2 } }] }, 1000);
  assert.throws(() => validateSnapshot(malformed, 1024 * 1024), error => error.code === 'INVALID_SNAPSHOT');
});

test('sync validates bounded compact interview AI history entries', () => {
  const entry = {
    id: 'star-1-1000', at: 1000, kind: 'star', itemId: 'star-1', topic: 'Инцидент', source: 'ai', overallScore: 72,
    dimensions: { correctness: 70, completeness: 75, structure: 80, tradeoffs: 60 },
    summary: 'Основа есть.', gaps: ['Добавить результат']
  };
  const valid = snapshot({ interview_ai_history: [{ ...entry, answer: 'private answer must be stripped', evidence: ['private evidence'] }] }, 1000);
  const normalised = validateSnapshot(valid, 1024 * 1024).state.interview_ai_history;
  assert.equal(normalised.length, 1);
  assert.equal('answer' in normalised[0], false);
  assert.equal('evidence' in normalised[0], false);

  const malformed = snapshot({ interview_ai_history: [{ id: 'broken', at: 1000, answer: 'private' }] }, 1000);
  assert.throws(() => validateSnapshot(malformed, 1024 * 1024), error => error.code === 'INVALID_SNAPSHOT');
});

test('a corrupt snapshot file falls back to the backup instead of wiping progress', async () => {
  await withService(async (service, dir) => {
    await service.push(snapshot({ qprog: { 1: { correct: 5, wrong: 0, lastSeen: 10 } } }, 1000));
    await service.push(snapshot({ qprog: { 2: { correct: 5, wrong: 0, lastSeen: 20 } } }, 2000));
    // Обрезанный файл имитирует падение диска или процесса на записи.
    await fsp.writeFile(path.join(dir, 'snapshot.json'), '{"state":{"qprog":', 'utf8');
    const result = await service.pull();
    assert.ok(Object.keys(result.snapshot.state.qprog || {}).length > 0, 'прогресс должен восстановиться из резервной копии');
  });
});

test('no temporary files are left behind after a write', async () => {
  await withService(async (service, dir) => {
    await service.push(snapshot({ daily: { '2026-08-01': 3 } }, 1000));
    await service.push(snapshot({ daily: { '2026-08-02': 4 } }, 2000));
    const leftovers = (await fsp.readdir(dir)).filter(name => name.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });
});

test('the stored snapshot stays valid JSON across many pushes', async () => {
  await withService(async (service, dir) => {
    for (let i = 1; i <= 12; i++) {
      await service.push(snapshot({ qprog: { [i]: { correct: 1, wrong: 0, lastSeen: i * 10 } } }, i * 1000, 'dev-' + i));
    }
    const raw = await fsp.readFile(path.join(dir, 'snapshot.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(Object.keys(parsed.state.qprog).length, 12);
  });
});

test('updatedAt stays the client clock so device edits can still win', () => {
  // Подмена updatedAt серверным временем делала бы снимок навсегда «свежее»
  // любого устройства, и правки курсора/настроек не побеждали бы никогда.
  return withService(async service => {
    const result = await service.push(snapshot({ theme: 'dark' }, 1));
    assert.equal(result.snapshot.updatedAt, 1);
    const later = await service.push(snapshot({ theme: 'light' }, 5000, 'device-b'));
    assert.equal(later.snapshot.state.theme, 'light', 'устройство со свежими логическими часами должно выигрывать');
  });
});

test('revision and storedAt track server-side changes independently', async () => {
  await withService(async service => {
    const first = await service.push(snapshot({ theme: 'dark' }, 10));
    assert.equal(first.snapshot.revision, 1);
    assert.ok(first.snapshot.storedAt > 0);
    const second = await service.push(snapshot({ theme: 'dark' }, 5));
    assert.equal(second.snapshot.revision, 2, 'ревизия растёт даже при устаревших часах клиента');
    assert.equal(service.status().revision, 2);
  });
});
