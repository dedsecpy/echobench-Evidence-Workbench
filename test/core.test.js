import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, assessFixture } from '../src/fixtures.js';
import { validateCase, validateDataset, publicCase, validateAssessment } from '../src/schema.js';
import { inferLineage, cosine } from '../src/lineage.js';
import { analyze, aggregateEvidence } from '../src/guard.js';
import { summarize, calibration, pairwiseScores, clusterBootstrap, pairedInflation, mean } from '../src/metrics.js';
import { splitDataset } from '../src/split.js';

const cases = generateFixtures({ events: 8 });
const sample = (scenario, count = 10) => cases.find(r => r.scenario === scenario && r.copyCount === count);
test('generator is deterministic, valid and counterbalances truth', () => {
  validateDataset(cases, { requireGold: true });
  assert.deepEqual(cases, generateFixtures({ events: 8 }));
  assert.equal(cases.length, 8 * 6 * 4);
  assert.equal(cases.filter(r => r.gold.truth === 'false').length, cases.length / 2);
});
test('different seeds produce different worlds', () => assert.notDeepEqual(cases, generateFixtures({ events: 8, seed: 123 })));
test('model input allowlist excludes gold and experimental metadata', () => {
  const record = structuredClone(sample('exact')); record.documents[0].familyId = 'SECRET'; record.documents[0].gold = 'SECRET';
  const input = publicCase(record); const serialized = JSON.stringify(input);
  assert.ok(!serialized.includes('SECRET')); assert.equal(input.gold, undefined); assert.equal(input.kind, undefined);
  assert.equal(input.scenario, undefined); assert.equal(input.copyCount, undefined); assert.equal(input.provenance, undefined);
});
test('reject duplicate IDs, empty documents and invalid gold', () => {
  assert.throws(() => validateDataset([cases[0], cases[0]]), /Duplicate case/);
  assert.throws(() => validateCase({ ...cases[0], documents: [] }), /documents/);
  const record = structuredClone(cases[0]); record.gold.documentLabels = {}; assert.throws(() => validateCase(record), /gold relation/);
});
test('schema rejects unobserved attribution passages', () => {
  const record = structuredClone(cases[0]); record.documents[0].attributions = [{ url: 'https://example.org', quote: 'not present' }]; assert.throws(() => validateCase(record), /exact observed text/);
});
test('scenario names cannot escape the report directory', () => {
  assert.throws(() => validateCase({ ...cases[0], scenario: '../../outside' }), /safe identifier/);
});
test('fixture assessment requires every source and exact evidence quotes', () => {
  for (const record of cases) validateAssessment(assessFixture(record), record.documents);
  const record = sample('exact'); const assessment = assessFixture(record); assessment.documents[0].quote = 'invented'; assert.throws(() => validateAssessment(assessment, record.documents), /verbatim/);
});
test('fixture parser refuses real records', () => assert.throws(() => assessFixture({ ...cases[0], kind: 'real' }), /restricted/));
test('exact copies on ten domains form one estimated supporting family', () => {
  const record = sample('exact'); const graph = inferLineage(record.documents); assert.equal(graph.families.length, 3);
  assert.equal(graph.families.find(f => f.members.includes('d0')).members.length, 10);
  assert.ok(graph.families.every(f => f.independence === 'unknown'));
});
test('cross-language attribution works without claiming translation semantics', () => {
  const graph = inferLineage(sample('translation').documents); assert.equal(graph.families.length, 3);
  assert.equal(graph.edges.filter(e => e.type === 'observed_attribution').length, 9);
});
test('circular evidence is detected and does not establish a primary source', () => {
  const graph = inferLineage(sample('circular').documents); assert.equal(graph.cycles.length, 1); assert.equal(graph.cycles[0].length, 10); assert.equal(graph.families.length, 3);
  assert.ok(graph.edges.some(e => e.timeConflict));
});
test('same topic and claim do not automatically merge independent observations', () => {
  const graph = inferLineage(sample('independent').documents); assert.equal(graph.families.length, 12);
});
test('unknown hidden rewrites remain a documented failure case', () => {
  const graph = inferLineage(sample('hidden_paraphrase').documents); assert.ok(graph.families.length > 3);
});
test('link-only and text-only ablations isolate their mechanisms', () => {
  const record = sample('translation');
  assert.equal(inferLineage(record.documents, { method: 'echo-no-text' }).families.length, 3);
  assert.ok(inferLineage(record.documents, { method: 'echo-no-links' }).families.length > 3);
  assert.equal(inferLineage(sample('exact').documents, { method: 'echo-no-text' }).families.length, 12);
});
test('common external ancestor clusters documents even when upstream is absent', () => {
  const record = sample('paraphrase'); const docs = record.documents.filter(d => d.id !== 'd0');
  const graph = inferLineage(docs); assert.equal(graph.families.length, 3); assert.ok(graph.edges.some(e => e.to.startsWith('external:')));
});
test('family ids and scores are invariant to document ordering', () => {
  const record = sample('exact'); const left = inferLineage(record.documents); const right = inferLineage([...record.documents].reverse());
  assert.deepEqual(left.families, right.families);
  assert.equal(aggregateEvidence(assessFixture(record), left).probabilityTrue, aggregateEvidence(assessFixture(record), right).probabilityTrue);
});
test('duplicate-count inflation disappears only for detected lineages', () => {
  const one = sample('exact', 1), ten = sample('exact', 10);
  const score = (r, method) => analyze(r, assessFixture(r), inferLineage(r.documents, { method })).probabilityTrue;
  assert.ok(score(ten, 'raw') - score(one, 'raw') > 0.6);
  assert.equal(score(ten, 'echo'), score(one, 'echo'));
});
test('contradictory documents in one family do not create repeated votes', () => {
  const assessment = { documents: [{ documentId: 'a', relation: 'supports', confidence: 0.9 }, { documentId: 'b', relation: 'contradicts', confidence: 0.9 }] };
  const p = aggregateEvidence(assessment, { families: [{ id: 'f', members: ['a', 'b'] }] });
  assert.equal(p.probabilityTrue, 0.5); assert.equal(p.verdict, 'unknown'); assert.equal(p.familyVotes[0].internallyConflicting, true);
});
test('leave-one-family-out records sensitivities rather than declaring causation', () => {
  const record = sample('exact'); const prediction = analyze(record, assessFixture(record), inferLineage(record.documents));
  assert.equal(prediction.leaveFamilyOut.length, 3); assert.equal(prediction.confirmedIndependentFamilies, null); assert.equal(prediction.searchPlan.status, 'planned_only');
  assert.equal(prediction.confidenceType, 'uncalibrated_evidence_score');
});
test('semantic baseline requires actual vectors and validates dimensions', () => {
  assert.throws(() => inferLineage(cases[0].documents, { method: 'semantic' }), /requires imported embeddings/);
  assert.throws(() => cosine([1, 2], [1]), /same dimension/); assert.equal(cosine([1, 0], [1, 0]), 1);
});
test('pairwise family metrics ignore unresolved labels and handle degenerate cases', () => {
  const perfect = pairwiseScores({ a: 'x', b: 'x', c: 'y', d: 'unknown:d' }, { a: '1', b: '1', c: '2', d: '1' }); assert.equal(perfect.f1, 1); assert.equal(perfect.ari, 1); assert.equal(perfect.evaluatedDocuments, 3);
  assert.equal(pairwiseScores({ a: 'x' }, { a: '1' }).f1, null);
});
test('metrics report denominators and exclude unknown truth from calibration', () => {
  const rows = [
    { truth: 'true', verdict: 'true', probabilityTrue: 1, hasDuplicateGoldFamilies: false },
    { truth: 'false', verdict: 'false', probabilityTrue: 0, hasDuplicateGoldFamilies: true },
    { truth: 'unknown', verdict: 'unknown', probabilityTrue: 0.5, hasDuplicateGoldFamilies: false }
  ]; const s = summarize(rows); assert.equal(s.brier, 0); assert.equal(s.ece, 0); assert.equal(s.knownTruthCount, 2); assert.equal(s.coverage, 1); assert.equal(s.falseCorroborationProxy.denominator, 1);
  assert.equal(calibration([]).ece, null); assert.equal(summarize([]).selectiveAccuracy, null);
});
test('bootstrap resamples events, is reproducible, and does not invent intervals for one event', () => {
  const rows = [{ eventId: 'a', x: 0 }, { eventId: 'a', x: 0 }, { eventId: 'b', x: 1 }]; const fn = r => mean(r.map(x => x.x));
  const first = clusterBootstrap(rows, fn, { repetitions: 100 }); assert.deepEqual(first, clusterBootstrap(rows, fn, { repetitions: 100 })); assert.equal(first.events, 2);
  assert.equal(clusterBootstrap(rows.slice(0, 2), fn).low, null);
});
test('paired inflation matches the same event, method, scenario and repetition', () => {
  const rows = [{ eventId: 'a', method: 'x', scenario: 'exact', copyCount: 1, probabilityTrue: 0.3, truth: 'false' }, { eventId: 'a', method: 'x', scenario: 'exact', copyCount: 10, probabilityTrue: 0.9, truth: 'false' }];
  assert.ok(Math.abs(pairedInflation(rows)[0].deltaFalseConfidence - 0.6) < 1e-10);
});
test('split keeps event variants and overlapping exact sources together', () => {
  const split = splitDataset(cases); const assignments = split.manifest.assignments;
  assert.equal(split.train.length + split.validation.length + split.test.length, cases.length);
  for (const name of ['train','validation','test']) for (const r of split[name]) assert.equal(assignments[r.eventId], name);
  assert.deepEqual(split, splitDataset(cases));
  const overlap = structuredClone(cases); const different = overlap.find(r => r.eventId !== overlap[0].eventId); different.documents[0].url = overlap[0].documents[0].url;
  const grouped = splitDataset(overlap); assert.equal(grouped.manifest.assignments[different.eventId], grouped.manifest.assignments[overlap[0].eventId]);
});
