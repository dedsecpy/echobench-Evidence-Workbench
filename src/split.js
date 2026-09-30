import { hash, rng, shuffle } from './io.js';
import { contentText, canonicalURL } from './lineage.js';

// Event variants and cases sharing an exact source stay in the same partition.
export function splitDataset(records, { seed = 20260930, train = 0.7, validation = 0.15 } = {}) {
  if (!(train > 0 && validation > 0 && train + validation < 1)) throw new Error('Invalid split ratios');
  const parents = new Map(records.map(r => [r.eventId, r.eventId]));
  function find(id) { if (parents.get(id) !== id) parents.set(id, find(parents.get(id))); return parents.get(id); }
  function union(a, b) { const x = find(a), y = find(b); if (x !== y) parents.set(y, x); }
  const owners = new Map();
  for (const r of records) for (const d of r.documents) {
    for (const key of [`url:${canonicalURL(d.url)}`, `text:${hash(contentText(d))}`]) {
      if (owners.has(key)) union(r.eventId, owners.get(key)); else owners.set(key, r.eventId);
    }
  }
  const groups = new Map(); for (const r of records) { const root = find(r.eventId); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(r); }
  if (groups.size < 3) throw new Error('At least three independent event/source groups are required for train/validation/test splits');
  const order = shuffle([...groups.keys()].sort(), rng(seed)); const n = order.length;
  const trainCount = Math.min(n - 2, Math.max(1, Math.floor(n * train)));
  const validationCount = Math.min(n - trainCount - 1, Math.max(1, Math.floor(n * validation)));
  const result = { train: [], validation: [], test: [] }; const assignments = {};
  order.forEach((group, i) => { const name = i < trainCount ? 'train' : i < trainCount + validationCount ? 'validation' : 'test'; result[name].push(...groups.get(group)); for (const r of groups.get(group)) assignments[r.eventId] = name; });
  return { ...result, manifest: { seed, datasetHash: hash(records), independentSourceGroups: n, assignments, counts: Object.fromEntries(Object.entries(result).map(([name, rows]) => [name, rows.length])),
    note: 'Exact source overlap and event IDs are grouped. Near-duplicate or undiscovered common origins still require a leakage audit.' } };
}
