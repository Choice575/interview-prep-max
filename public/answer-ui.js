(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAnswerUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';
  function escape(value) {
    return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function parts(answer, shortAnswer) {
    const full = String(answer || '').trim();
    if (shortAnswer && String(shortAnswer).trim() !== full) return {short:String(shortAnswer).trim(),full};
    if (full.length <= 420) return {short:full,full:''};
    const boundaries = [...full.matchAll(/[.!?](?=\s+[А-ЯЁ]|$)|;(?=\s*[А-ЯЁа-яё])/gu)]
      .map(match=>match.index+1).filter(index=>index>=60&&index<=420);
    // Never cut in the middle of an inline command or remove the full answer.
    const end = boundaries.slice(0,2).reverse().find(index=>(full.slice(0,index).match(/`/g)||[]).length%2===0);
    if (!end || end >= full.length-80) return {short:full,full:''};
    return {short:full.slice(0,end).replace(/;$/,'.'),full};
  }
  function paragraphs(text) {
    return String(text || '').split(/\n\s*\n/).map(part=>'<p>'+escape(part)+'</p>').join('');
  }
  // detailsHtml is trusted markup assembled by the caller from escaped fields.
  function render(answer, shortAnswer, detailsHtml = '') {
    const result=parts(answer,shortAnswer);
    return '<div class="answer-short">'+paragraphs(result.short)+'</div>'
      +(result.full||detailsHtml?'<details class="answer-details"><summary>Подробнее: объяснение и примеры</summary><div class="answer-full">'+(result.full?paragraphs(result.full):'')+detailsHtml+'</div></details>':'');
  }
  return {parts,render,escape};
});
