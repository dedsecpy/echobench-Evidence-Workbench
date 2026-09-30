export const RELATIONS = ['supports', 'contradicts', 'insufficient'];
export const TRUTHS = ['true', 'false', 'unknown'];
export const LINEAGE_RELATIONS = ['copied_from', 'translated_from', 'cites_for_claim', 'independent_observation', 'unknown'];

function assert(condition, message) { if (!condition) throw new Error(message); }
export function validateCase(record, { requireGold = false } = {}) {
  assert(record && typeof record === 'object', 'Case must be an object');
  assert(record.schemaVersion === '1.0', 'schemaVersion must be 1.0');
  assert(typeof record.id === 'string' && /^[a-zA-Z0-9_.-]+$/.test(record.id), 'Case id must be a safe nonempty identifier');
  assert(typeof record.claim === 'string' && record.claim.trim(), `${record.id}: claim is required`);
  assert(['synthetic', 'real'].includes(record.kind), `${record.id}: kind must be synthetic or real`);
  assert(typeof record.eventId === 'string' && record.eventId, `${record.id}: eventId is required for grouped evaluation`);
  if (record.scenario != null) assert(typeof record.scenario === 'string' && /^[a-zA-Z0-9_.-]+$/.test(record.scenario), `${record.id}: scenario must be a safe identifier`);
  if (record.copyCount != null) assert(Number.isInteger(record.copyCount) && record.copyCount >= 1, `${record.id}: copyCount must be a positive integer`);
  assert(Array.isArray(record.documents) && record.documents.length > 0, `${record.id}: documents required`);
  const ids = new Set(); const urls = new Set();
  for (const doc of record.documents) {
    assert(typeof doc.id === 'string' && /^[a-zA-Z0-9_.-]+$/.test(doc.id) && !ids.has(doc.id), `${record.id}: invalid/duplicate document id`);
    ids.add(doc.id);
    let url; try { url = new URL(doc.url); } catch { throw new Error(`${record.id}: invalid URL`); }
    assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, `${record.id}: document URL must be HTTP(S) without credentials`);
    assert(!urls.has(url.href), `${record.id}: duplicate document URL`); urls.add(url.href);
    assert(typeof doc.text === 'string' && doc.text.trim(), `${record.id}/${doc.id}: text required`);
    assert(typeof doc.language === 'string' && doc.language, `${doc.id}: language required`);
    if (doc.publishedAt != null) assert(Number.isFinite(Date.parse(doc.publishedAt)), `${doc.id}: invalid publication date`);
    if (doc.outgoingLinks != null) {
      assert(Array.isArray(doc.outgoingLinks), `${doc.id}: outgoingLinks must be an array`);
      for (const link of doc.outgoingLinks) {
        let target; try { target = new URL(link.url); } catch { throw new Error(`${doc.id}: invalid link URL`); }
        assert(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password, `${doc.id}: links must use HTTP(S) without credentials`);
        if (link.anchor != null) assert(typeof link.anchor === 'string', `${doc.id}: link anchor must be text`);
        if (link.context != null) assert(typeof link.context === 'string', `${doc.id}: link context must be text`);
      }
    }
    if (doc.attributions != null) {
      assert(Array.isArray(doc.attributions), `${doc.id}: attributions must be an array`);
      for (const a of doc.attributions) {
        assert(typeof a.url === 'string' && typeof a.quote === 'string' && a.quote.length > 0 && doc.text.includes(a.quote), `${doc.id}: attribution needs an exact observed text quote`);
        let target; try { target = new URL(a.url); } catch { throw new Error(`${doc.id}: invalid attribution URL`); }
        assert(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password, `${doc.id}: attribution URL must be HTTP(S) without credentials`);
      }
    }
  }
  if (requireGold || record.gold) {
    assert(record.gold && TRUTHS.includes(record.gold.truth), `${record.id}: gold.truth required`);
    assert(record.gold.documentLabels && typeof record.gold.documentLabels === 'object', `${record.id}: gold.documentLabels required`);
    for (const doc of record.documents) {
      const label = record.gold.documentLabels[doc.id];
      assert(label && RELATIONS.includes(label.relation), `${doc.id}: gold relation required`);
      assert(typeof label.familyId === 'string' && label.familyId, `${doc.id}: gold familyId required (use unknown:<id> when unresolved)`);
    }
    for (const id of Object.keys(record.gold.documentLabels)) assert(ids.has(id), `${record.id}: gold label for unknown document ${id}`);
  }
  return record;
}
export function validateDataset(records, options) {
  assert(Array.isArray(records) && records.length > 0, 'Dataset is empty');
  const ids = new Set();
  for (const record of records) { validateCase(record, options); assert(!ids.has(record.id), `Duplicate case ${record.id}`); ids.add(record.id); }
  return records;
}
// Explicit allowlist: benchmark gold, scenario labels and generator internals never reach a model.
export function publicCase(record) {
  return {
    id: record.id, claim: record.claim,
    documents: record.documents.map(d => ({
      id: d.id, url: d.url, title: d.title ?? '', text: d.text, language: d.language,
      publishedAt: d.publishedAt ?? null, author: d.author ?? null,
      attributions: (d.attributions ?? []).map(a => ({ url: a.url, quote: a.quote })),
      outgoingLinks: (d.outgoingLinks ?? []).map(link => ({ url: link.url, anchor: link.anchor ?? '', context: link.context ?? '' }))
    }))
  };
}
export function validateAssessment(assessment, documents) {
  assert(assessment && Array.isArray(assessment.documents), 'Invalid assessment');
  const expected = new Set(documents.map(d => d.id)); const seen = new Set();
  for (const d of assessment.documents) {
    assert(expected.has(d.documentId) && !seen.has(d.documentId), 'Missing, duplicate or unknown assessment document'); seen.add(d.documentId);
    assert(RELATIONS.includes(d.relation), 'Invalid assessment relation');
    assert(Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1, 'Assessment confidence must be in [0,1]');
    assert(typeof d.quote === 'string', 'Assessment quote required');
    const text = documents.find(x => x.id === d.documentId).text;
    assert(d.relation === 'insufficient' || (d.quote.length > 0 && text.includes(d.quote)), 'Evidence quote must occur verbatim in the document');
  }
  assert(seen.size === expected.size, 'Assessment must include every document');
  return assessment;
}
export function validatePrediction(prediction, documents) {
  assert(prediction && TRUTHS.includes(prediction.verdict), 'Invalid prediction verdict');
  assert(Number.isFinite(prediction.probabilityTrue) && prediction.probabilityTrue >= 0 && prediction.probabilityTrue <= 1, 'probabilityTrue must be in [0,1]');
  assert(Array.isArray(prediction.citations) && prediction.citations.every(id => documents.some(d => d.id === id)), 'Invalid citation ids');
  assert(typeof prediction.explanation === 'string', 'Prediction explanation required');
  return prediction;
}
