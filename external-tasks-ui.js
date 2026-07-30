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
      + '<form id="evidence-form">' + inputs
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
    escapeHtml, tasksOf, renderTaskList, renderEvidenceModal, 
    collectEvidence, validateEvidence, DIFFICULTY_LABELS, EVIDENCE_LABELS 
  };
});
