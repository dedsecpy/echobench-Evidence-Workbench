import { hash } from './io.js';

export function normalize(text) { return text.normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
export function contentText(doc) {
  let text = doc.text;
  // Remove only observed attribution passages, rather than deleting arbitrary content.
  for (const a of doc.attributions ?? []) text = text.replace(a.quote, '');
  return normalize(text);
}
export function shingles(text, n = 3) {
  const tokens = normalize(text).split(/\s+/).filter(Boolean); const result = new Set();
  for (let i = 0; i <= tokens.length - n; i++) result.add(tokens.slice(i, i + n).join(' '));
  return result;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) throw new Error('Embedding vectors must be finite, nonempty and have the same dimension');
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const norm = Math.sqrt(a.reduce((sum, x) => sum + x*x, 0) * b.reduce((sum, x) => sum + x*x, 0));
  return norm ? dot / norm : 0;
}
export function canonicalURL(value) { const u = new URL(value); u.hash = ''; return u.href; }

class UnionFind {
  constructor(keys) { this.parents = new Map(keys.map(k => [k, k])); }
  find(key) { if (!this.parents.has(key)) this.parents.set(key, key); const parent = this.parents.get(key); if (parent !== key) this.parents.set(key, this.find(parent)); return this.parents.get(key); }
  union(a, b) { const x = this.find(a); const y = this.find(b); if (x !== y) this.parents.set(y, x); }
}

function directedCycles(edges, ids) {
  const graph = new Map(ids.map(id => [id, []]));
  for (const e of edges.filter(e => e.type === 'observed_attribution')) if (graph.has(e.from) && graph.has(e.to)) graph.get(e.from).push(e.to);
  let serial = 0; const indices = new Map(); const lows = new Map(); const stack = []; const onStack = new Set(); const cycles = [];
  function visit(v) {
    indices.set(v, serial); lows.set(v, serial++); stack.push(v); onStack.add(v);
    for (const w of graph.get(v)) {
      if (!indices.has(w)) { visit(w); lows.set(v, Math.min(lows.get(v), lows.get(w))); }
      else if (onStack.has(w)) lows.set(v, Math.min(lows.get(v), indices.get(w)));
    }
    if (lows.get(v) === indices.get(v)) {
      const component = []; let w; do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
      if (component.length > 1 || graph.get(v).includes(v)) cycles.push(component.sort());
    }
  }
  for (const v of ids) if (!indices.has(v)) visit(v);
  return cycles;
}

export const METHODS = ['raw', 'domain', 'exact', 'lexical', 'semantic', 'echo', 'echo-no-links', 'echo-no-text'];
export function inferLineage(documents, { method = 'echo', threshold = 0.78, semanticThreshold = 0.95, embeddings } = {}) {
  if (!METHODS.includes(method)) throw new Error(`Unknown method ${method}`);
  if (!(threshold >= 0 && threshold <= 1)) throw new Error('threshold must be in [0,1]');
  if (!(semanticThreshold >= 0 && semanticThreshold <= 1)) throw new Error('semanticThreshold must be in [0,1]');
  if (method === 'semantic' && !embeddings) throw new Error('semantic baseline requires imported embeddings');
  if (method === 'semantic') {
    const reference = embeddings[documents[0].id];
    for (const doc of documents) cosine(reference, embeddings[doc.id]);
  }
  const ids = documents.map(d => d.id); const uf = new UnionFind(ids); const edges = [];
  const urls = new Map(documents.map(d => [canonicalURL(d.url), d.id]));
  const useLinks = ['echo', 'echo-no-text'].includes(method);
  const useExact = ['exact', 'lexical', 'echo', 'echo-no-links'].includes(method);
  const useLexical = ['lexical', 'echo', 'echo-no-links'].includes(method);
  if (useLinks) for (const doc of documents) for (const a of doc.attributions ?? []) {
    if (!a.quote || !doc.text.includes(a.quote)) continue;
    const url = canonicalURL(a.url); const target = urls.get(url) ?? `external:${url}`;
    uf.union(doc.id, target);
    const targetDoc = documents.find(d => d.id === target);
    edges.push({ from: doc.id, to: target, type: 'observed_attribution', score: 1, quote: a.quote,
      timeConflict: Boolean(targetDoc?.publishedAt && doc.publishedAt && Date.parse(targetDoc.publishedAt) > Date.parse(doc.publishedAt)) });
  }
  const texts = new Map(documents.map(d => [d.id, contentText(d)]));
  const grams = new Map(documents.map(d => [d.id, shingles(texts.get(d.id))]));
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j]; let type = null, score = 0;
    if (method === 'domain' && new URL(a.url).hostname === new URL(b.url).hostname) { type = 'same_hostname'; score = 1; }
    else if (useExact && texts.get(a.id) && texts.get(a.id) === texts.get(b.id)) { type = 'identical_passage'; score = 1; }
    else if (useLexical && grams.get(a.id).size >= 8 && grams.get(b.id).size >= 8 && (score = jaccard(grams.get(a.id), grams.get(b.id))) >= threshold) type = 'possible_text_derivation';
    else if (method === 'semantic') {
      if (!embeddings[a.id] || !embeddings[b.id]) throw new Error('Missing embedding for a document');
      score = cosine(embeddings[a.id], embeddings[b.id]); if (score >= semanticThreshold) type = 'semantic_similarity';
    }
    if (type) { uf.union(a.id, b.id); edges.push({ from: a.id, to: b.id, type, score }); }
  }
  const grouped = new Map();
  for (const id of ids) { const root = uf.find(id); if (!grouped.has(root)) grouped.set(root, []); grouped.get(root).push(id); }
  const families = [...grouped.values()].map(members => {
    members.sort(); const familyId = `family-${hash(members).slice(0, 12)}`;
    const evidence = edges.filter(e => members.includes(e.from) && (members.includes(e.to) || e.to.startsWith('external:')));
    return { id: familyId, members, independence: 'unknown', basis: evidence.length ? 'estimated_shared_lineage' : 'unresolved_singleton' };
  }).sort((a, b) => a.members[0].localeCompare(b.members[0]));
  return { method, threshold, families, assignment: Object.fromEntries(families.flatMap(f => f.members.map(id => [id, f.id]))), edges,
    cycles: directedCycles(edges, ids), unknownIndependence: families.length,
    note: 'Clusters estimate information dependence. Distinct clusters do not prove independent observation; attribution does not establish truth.' };
}
