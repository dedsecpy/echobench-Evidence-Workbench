import path from 'node:path';
import { readJSON, writeJSON, exists, hash } from './io.js';
import { RELATIONS, TRUTHS, LINEAGE_RELATIONS, validateCase } from './schema.js';

export function validateAnnotation(annotation, record) {
  if (!annotation || typeof annotation.annotator !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(annotation.annotator)) throw new Error('Annotator must be 1–80 letters, numbers, dots, underscores or hyphens');
  if (!TRUTHS.includes(annotation.truth)) throw new Error('Truth must be true, false or unknown');
  if (typeof annotation.truthRationale !== 'string' || annotation.truthRationale.length > 10000) throw new Error('Truth rationale is required');
  if (annotation.truth !== 'unknown' && !annotation.truthRationale.trim()) throw new Error('Known truth requires a rationale with an inspectable primary reference');
  if (!Array.isArray(annotation.documents) || annotation.documents.length !== record.documents.length) throw new Error('Annotate every document');
  const ids = new Set();
  for (const label of annotation.documents) {
    const doc = record.documents.find(d => d.id === label.documentId);
    if (!doc || ids.has(label.documentId)) throw new Error('Invalid/duplicate annotation document'); ids.add(label.documentId);
    if (!RELATIONS.includes(label.relation) || !LINEAGE_RELATIONS.includes(label.lineageRelation)) throw new Error('Invalid relation');
    if (typeof label.familyId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(label.familyId)) throw new Error('Invalid family identifier');
    if (typeof label.quote !== 'string' || (label.relation !== 'insufficient' && (!label.quote || !doc.text.includes(label.quote)))) throw new Error('Supports/contradicts requires a verbatim evidence quote');
    if (label.parentId !== null && !record.documents.some(d => d.id === label.parentId)) throw new Error('Parent must be a document id or null');
    if (label.parentId === label.documentId) throw new Error('A document cannot be its own parent');
    if (['copied_from', 'translated_from', 'cites_for_claim'].includes(label.lineageRelation) && !label.parentId) throw new Error('A derivative lineage relation requires a parent document');
    if (typeof label.notes !== 'string' || label.notes.length > 10000) throw new Error('Notes must be text, up to 10000 characters');
  }
  for (const label of annotation.documents) {
    if (label.parentId) {
      const parent = annotation.documents.find(d => d.documentId === label.parentId);
      if (label.familyId !== parent.familyId) throw new Error('A derivative document and its parent must have the same family id');
    }
    if (label.lineageRelation === 'unknown' && !label.familyId.startsWith('unknown:')) throw new Error('Unknown lineage must use unknown:<documentId> rather than claiming independence');
  }
  return annotation;
}
export class AnnotationStore {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  file(record) { return path.join(this.directory, `${record.id}.json`); }
  async load(record) {
    const file = this.file(record);
    if (!(await exists(file))) return { caseId: record.id, datasetCaseHash: hash(record), revision: 0, history: [] };
    const data = await readJSON(file); if (data.datasetCaseHash !== hash(record)) throw new Error('Case changed since annotation; use a new annotation directory'); return data;
  }
  save(record, annotation, expectedRevision) {
    const task = this.queue.then(async () => {
      validateAnnotation(annotation, record);
      const data = await this.load(record);
      if (expectedRevision !== data.revision) { const error = new Error('Annotation revision conflict. Reload before saving.'); error.status = 409; throw error; }
      const entry = { ...annotation, savedAt: new Date().toISOString(), revision: data.revision + 1 };
      const next = { ...data, revision: entry.revision, history: [...data.history, entry] };
      await writeJSON(this.file(record), next); return next;
    });
    this.queue = task.catch(() => {}); return task;
  }
}
export function latestFor(store, annotator) { return store.history.filter(h => h.annotator === annotator).at(-1) ?? null; }
export async function exportAnnotated(records, directory, annotator) {
  const store = new AnnotationStore(directory); const result = [];
  for (const record of records) {
    const annotation = latestFor(await store.load(record), annotator);
    if (!annotation) throw new Error(`No annotation by ${annotator} for ${record.id}`);
    const annotated = { ...record, gold: { truth: annotation.truth, rationale: annotation.truthRationale,
      documentLabels: Object.fromEntries(annotation.documents.map(d => [d.documentId, { relation: d.relation, familyId: d.familyId, lineageRelation: d.lineageRelation, parentId: d.parentId, quote: d.quote, notes: d.notes }])) },
      annotationProvenance: { annotator, revision: annotation.revision, savedAt: annotation.savedAt } };
    validateCase(annotated, { requireGold: true }); result.push(annotated);
  }
  return result;
}

function kappa(pairs) {
  if (!pairs.length) return null;
  const categories = [...new Set(pairs.flat())]; const n = pairs.length;
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const expected = categories.reduce((sum, c) => sum + pairs.filter(p => p[0] === c).length / n * pairs.filter(p => p[1] === c).length / n, 0);
  return { n, agreement: observed, kappa: expected === 1 ? null : (observed - expected) / (1 - expected) };
}
export async function annotationAgreement(records, directory, first, second) {
  const store = new AnnotationStore(directory); const relations = [], lineagePairs = [], truthPairs = []; let sharedCases = 0;
  for (const record of records) {
    const saved = await store.load(record); const a = latestFor(saved, first); const b = latestFor(saved, second);
    if (!a || !b) continue; sharedCases++; truthPairs.push([a.truth, b.truth]);
    const left = Object.fromEntries(a.documents.map(d => [d.documentId, d])); const right = Object.fromEntries(b.documents.map(d => [d.documentId, d]));
    for (const doc of record.documents) relations.push([left[doc.id].relation, right[doc.id].relation]);
    for (let i = 0; i < record.documents.length; i++) for (let j = i + 1; j < record.documents.length; j++) {
      const x = record.documents[i].id, y = record.documents[j].id;
      if ([left[x], left[y], right[x], right[y]].some(d => d.familyId.startsWith('unknown:'))) continue;
      lineagePairs.push([String(left[x].familyId === left[y].familyId), String(right[x].familyId === right[y].familyId)]);
    }
  }
  return { annotators: [first, second], sharedCases, relation: kappa(relations), sameFamilyPairs: kappa(lineagePairs), truth: kappa(truthPairs),
    note: 'Descriptive agreement only; correlated document pairs are not independent samples. Undefined kappa is null.' };
}
