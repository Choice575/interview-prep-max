(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxExternalTasksUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const DIFFICULTY_LABELS = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };
  const EVIDENCE_LABELS = { screenshot: 'Скриншот', link: 'Ссылка', text: 'Текст/вывод' };

  const PROGRESS_KEY='external_tasks_completed';
  const RECOVERY_KEY='external_tasks_completed_recovery';
  function readProgress(store) {
    let raw;
    try { raw=store.getItem(PROGRESS_KEY); }
    catch (_) { return {ok:false,data:{},reason:'unavailable'}; }
    if(raw===null) return {ok:true,data:{}};
    try {
      const data=JSON.parse(raw);
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.values(data).some(value=>!value||typeof value!=='object'||Array.isArray(value))) throw new Error('Invalid progress');
      return {ok:true,data};
    } catch (_) { return {ok:false,data:{},reason:'corrupt',raw}; }
  }
  function saveProgress(store,id,entry) {
    const previous=readProgress(store);
    if(previous.reason==='unavailable') return {ok:false};
    try {
      // Backup must succeed before replacing an unreadable record. Never erase
      // earlier recovery data: keep each distinct raw value in the same backup.
      if(previous.reason==='corrupt') {
        const old=store.getItem(RECOVERY_KEY);
        let backups=[];
        if(old!==null) { try {backups=JSON.parse(old);} catch (_) {backups=[{raw:old}];} }
        if(!Array.isArray(backups)) backups=[{raw:old}];
        if(!backups.some(item=>item&&item.raw===previous.raw)) backups.push({savedAt:Date.now(),raw:previous.raw});
        store.setItem(RECOVERY_KEY,JSON.stringify(backups));
      }
      store.setItem(PROGRESS_KEY,JSON.stringify({...previous.data,[id]:entry}));
      return {ok:true,recovered:previous.reason==='corrupt'};
    } catch (_) { return {ok:false}; }
  }

  // Returns the task list or empty array
  function tasksOf(dataset) {
    return dataset && Array.isArray(dataset.tasks) ? dataset.tasks : [];
  }

  // Renders the task list as cards
  function renderTaskList(dataset, completedMap) {
    const tasks = tasksOf(dataset);
    if (!tasks.length) return '<div class="empty-state"><p>Задания пока недоступны.</p></div>';
    const completed = completedMap || {};
    return '<div class="external-tasks-grid">' + tasks.map(task => {
      const done = !!completed[task.id];
      const badge = done ? '<span class="task-badge task-done">✓ Выполнено</span>' 
        : '<span class="task-badge task-pending">⏳ К выполнению</span>';
      const evidenceList = task.evidenceType.map(t => EVIDENCE_LABELS[t] || t).join(', ');
      return '<article class="external-task-card' + (done ? ' completed' : '') + '" data-task-id="' + task.id + '">'
        + '<div class="task-card-header"><h3>' + escapeHtml(task.title) + '</h3>' + badge + '</div>'
        + '<div class="task-meta"><span class="task-difficulty">' + DIFFICULTY_LABELS[task.difficulty] 
        + '</span><span class="task-topic">' + escapeHtml(task.topic) + '</span><span class="task-points">'
        + task.points + ' очков</span></div>'
        + '<p class="task-description">' + escapeHtml(task.description) + '</p>'
        + '<div class="task-footer"><span class="task-evidence">Доказательство: ' + evidenceList + '</span>'
        + '<button type="button" class="btn btn-primary btn-submit-evidence" data-task-id="' + task.id 
        + '">' + (done ? 'Изменить' : 'Отправить') + '</button></div></article>';
    }).join('') + '</div>';
  }

  // Renders the evidence submission modal body for a given task
  function renderEvidenceModal(task) {
    if (!task) return '<p>Задание не найдено.</p>';
    const types = task.evidenceType || [];
    let inputs = '';
    if (types.includes('text')) {
      inputs += '<div class="form-group"><label for="evidence-text">Текст / вывод команды</label>'
        + '<textarea id="evidence-text" class="form-input" rows="6" placeholder="Вставьте вывод команды или описание..."></textarea></div>';
    }
    if (types.includes('link')) {
      inputs += '<div class="form-group"><label for="evidence-link">Ссылка (GitHub, gist, скриншот)</label>'
        + '<input type="url" id="evidence-link" class="form-input" placeholder="https://..."></div>';
    }
    if (types.includes('screenshot')) {
      inputs += '<div class="form-group"><label for="evidence-file">Скриншот (локальное хранение)</label>'
        + '<input type="file" id="evidence-file" accept="image/*" class="form-input"></div>';
    }
    return '<div class="evidence-modal-body"><h2>' + escapeHtml(task.title) + '</h2>'
      + '<p class="task-instructions">' + escapeHtml(task.description) + '</p>'
      + '<form id="evidence-form"><p id="evidence-error" role="alert" hidden></p>' + inputs
      + '<div class="form-actions"><button type="button" class="btn btn-secondary" id="evidence-cancel">Отмена</button>'
      + '<button type="submit" class="btn btn-primary" id="evidence-submit">Отправить</button></div></form></div>';
  }

  // Collect evidence from the modal form
  function collectEvidence() {
    const text = document.getElementById('evidence-text')?.value.trim() || null;
    const link = document.getElementById('evidence-link')?.value.trim() || null;
    const file = document.getElementById('evidence-file')?.files[0] || null;
    return { text, link, file };
  }

  // Validate that at least one evidence field is filled
  function validateEvidence(evidence) {
    return !!(evidence.text || evidence.link || evidence.file);
  }

  return { 
    escapeHtml, tasksOf, renderTaskList, renderEvidenceModal, readProgress, saveProgress,
    collectEvidence, validateEvidence, DIFFICULTY_LABELS, EVIDENCE_LABELS 
  };
});
