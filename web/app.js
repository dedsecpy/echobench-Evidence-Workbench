const $ = id => document.getElementById(id);
let library = [], current = null, saveData = null, dirty = false;
function element(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
async function api(url, options) { const response = await fetch(url, options); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Request failed'); return body; }
function optionSelect(options, value) { const select = element('select'); for (const [key, label] of options) { const option = element('option', label); option.value = key; select.append(option); } select.value = value; return select; }
function field(labelText, input, name, wide = false) { const label = element('label', labelText, wide ? 'wide' : ''); input.dataset.field = name; label.append(input); return label; }
function renderLibrary() {
  const query = $('search').value.toLowerCase(); const filtered = library.filter(c => `${c.id} ${c.claim}`.toLowerCase().includes(query));
  $('library-count').textContent = `${filtered.length} of ${library.length} claims`; $('case-list').replaceChildren();
  for (const c of filtered) { const button = element('button'); button.setAttribute('aria-current', String(current?.id === c.id)); button.append(element('small', c.id), element('span', c.claim)); button.onclick = () => loadCase(c.id); $('case-list').append(button); }
}
function annotationForUser() { return saveData?.history.filter(h => h.annotator === $('annotator').value).at(-1) ?? null; }
function renderDocuments() {
  const annotation = annotationForUser(); $('truth').value = annotation?.truth ?? 'unknown'; $('truth-rationale').value = annotation?.truthRationale ?? '';
  $('documents').replaceChildren();
  for (const d of current.documents) {
    const label = annotation?.documents.find(x => x.documentId === d.id);
    const card = element('article', null, 'document'); card.dataset.documentId = d.id;
    const head = element('header'); const link = element('a', d.url); link.href = d.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    head.append(element('div', `${d.id} · ${d.language.toUpperCase()} · ${d.publishedAt ?? 'Publication date unknown'}`, 'doc-meta'), element('h3', d.title || 'Untitled source'), link);
    const passage = element('pre', d.text, 'passage');
    const fields = element('div', null, 'labels');
    fields.append(field('Relation to claim', optionSelect([['insufficient','Insufficient'],['supports','Supports'],['contradicts','Contradicts']], label?.relation ?? 'insufficient'), 'relation'));
    const family = element('input'); family.value = label?.familyId ?? `unknown:${d.id}`;
    fields.append(field('Source family ID', family, 'familyId'));
    fields.append(field('Evidence origin', optionSelect([['unknown','Unknown'],['independent_observation','Independent observation'],['copied_from','Copied from'],['translated_from','Translated from'],['cites_for_claim','Cites source for claim']], label?.lineageRelation ?? 'unknown'), 'lineageRelation'));
    fields.append(field('Parent source', optionSelect([['','None / unresolved'], ...current.documents.filter(x => x.id !== d.id).map(x => [x.id, x.id])], label?.parentId ?? ''), 'parentId'));
    const quote = element('textarea'); quote.rows = 2; quote.value = label?.quote ?? ''; quote.placeholder = 'Paste an exact passage from the source.';
    fields.append(field('Verbatim evidence passage', quote, 'quote', true));
    const notes = element('textarea'); notes.rows = 2; notes.value = label?.notes ?? ''; notes.placeholder = 'Explain shared origin, independent observation, missing source, or contradictory evidence.';
    fields.append(field('Lineage rationale / notes', notes, 'notes', true)); card.append(head, passage, fields); $('documents').append(card);
  }
  dirty = false; $('save-status').textContent = annotation ? `Loaded ${annotation.annotator} · revision ${annotation.revision}` : 'New annotation. Gold labels are hidden.';
}
async function loadCase(id) {
  if (dirty && !confirm('Unsaved annotation changes will be lost. Continue?')) return;
  try {
    $('loading').hidden = false; $('loading').textContent = 'Loading sources…';
    const data = await api(`/api/cases/${encodeURIComponent(id)}`); current = data.record; saveData = data.annotation;
    $('claim').textContent = current.claim; $('case-id').textContent = current.id; $('case-kind').textContent = current.kind === 'synthetic' ? 'Synthetic diagnostic' : 'Real sources · awaiting validation';
    $('stats').replaceChildren();
    for (const [value, label] of [[current.documents.length,'Documents'],[data.graph.families.length,'Estimated families'],[data.graph.cycles.length,'Citation cycles']]) { const stat = element('div', null, 'stat'); stat.append(element('strong', value), element('span', label)); $('stats').append(stat); }
    $('families').replaceChildren(); $('edges').replaceChildren();
    for (const f of data.graph.families) { const card = element('article', null, 'family'); const members = element('div', null, 'members'); for (const id of f.members) members.append(element('span', id, 'member')); card.append(element('h3', f.id), element('small', `${f.basis} · independence unknown`), members); $('families').append(card); }
    if (!data.graph.edges.length) $('edges').append(element('p', 'No shared-origin relationships detected. This does not establish independence.'));
    for (const edge of data.graph.edges) { const row = element('div', `${edge.from} → ${edge.to} · ${edge.type} · score ${edge.score.toFixed(2)}`, 'edge'); if (edge.timeConflict) row.append(element('em', ' · date conflict: attribution predates its target')); $('edges').append(row); }
    renderDocuments(); renderLibrary(); $('workspace').hidden = false; $('loading').hidden = true;
  } catch (error) { $('loading').textContent = error.message; }
}
$('search').addEventListener('input', renderLibrary);
$('annotator').value = localStorage.getItem('echobench.annotator') ?? 'reviewer-1';
$('annotator').addEventListener('change', () => {
  if (dirty && !confirm('Switching annotators will discard unsaved changes. Continue?')) { $('annotator').value = localStorage.getItem('echobench.annotator') ?? 'reviewer-1'; return; }
  localStorage.setItem('echobench.annotator', $('annotator').value); if (current) renderDocuments();
});
$('sources-panel').addEventListener('input', event => { if (event.target.id !== 'annotator') { dirty = true; $('save-status').textContent = 'Unsaved changes'; } });
for (const tab of ['sources', 'lineage']) $(tab + '-tab').onclick = () => {
  for (const name of ['sources', 'lineage']) { $(name + '-tab').setAttribute('aria-selected', String(name === tab)); $(name + '-panel').hidden = name !== tab; }
};
$('save').onclick = async () => {
  try {
    $('save').disabled = true;
    const documents = [...document.querySelectorAll('.document')].map(card => {
      const fields = Object.fromEntries([...card.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]));
      return { documentId: card.dataset.documentId, ...fields, parentId: fields.parentId || null };
    });
    const annotation = { annotator: $('annotator').value, truth: $('truth').value, truthRationale: $('truth-rationale').value, documents };
    saveData = await api(`/api/cases/${encodeURIComponent(current.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annotation, expectedRevision: saveData.revision }) });
    dirty = false; $('save-status').textContent = `Saved · revision ${saveData.revision}`;
  } catch (error) { $('save-status').textContent = error.message; } finally { $('save').disabled = false; }
};
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
try { const data = await api('/api/cases'); library = data.cases; renderLibrary(); if (library.length) await loadCase(library[0].id); else $('loading').textContent = 'No claims available.'; } catch (error) { $('loading').textContent = error.message; }
