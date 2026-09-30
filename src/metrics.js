import { rng } from './io.js';

export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function pairwiseScores(gold, predicted) {
  const ids = Object.keys(gold).filter(id => gold[id] && !gold[id].startsWith('unknown:'));
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const actual = gold[ids[i]] === gold[ids[j]]; const found = predicted[ids[i]] === predicted[ids[j]];
    if (actual && found) tp++; else if (found) fp++; else if (actual) fn++; else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : null; const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null;
  // Adjusted Rand index, computed from all document pairs (equivalent to contingency-count form).
  const total = tp + fp + fn + tn; const sameGold = tp + fn; const samePred = tp + fp;
  const expected = total ? sameGold * samePred / total : 0; const max = (sameGold + samePred) / 2;
  const ari = total === 0 ? null : max === expected ? (fp === 0 && fn === 0 ? 1 : 0) : (tp - expected) / (max - expected);
  return { tp, fp, fn, tn, precision, recall, f1, ari, evaluatedDocuments: ids.length };
}

export function calibration(rows, bins = 10) {
  const known = rows.filter(r => ['true', 'false'].includes(r.truth));
  const buckets = Array.from({ length: bins }, (_, i) => ({ lower: i / bins, upper: (i + 1) / bins, count: 0, scores: [], labels: [] }));
  for (const r of known) { const b = buckets[Math.min(bins - 1, Math.floor(r.probabilityTrue * bins))]; b.count++; b.scores.push(r.probabilityTrue); b.labels.push(r.truth === 'true' ? 1 : 0); }
  const reliability = buckets.map(b => ({ lower: b.lower, upper: b.upper, count: b.count, probability: mean(b.scores), frequencyTrue: mean(b.labels) }));
  const ece = known.length ? reliability.reduce((sum, b) => sum + (b.count ? b.count / known.length * Math.abs(b.probability - b.frequencyTrue) : 0), 0) : null;
  return { brier: mean(known.map(r => (r.probabilityTrue - (r.truth === 'true' ? 1 : 0)) ** 2)), ece, reliability, knownTruthCount: known.length };
}

export function summarize(rows, { threshold = 0.8 } = {}) {
  const known = rows.filter(r => ['true', 'false'].includes(r.truth)); const accepted = known.filter(r => r.verdict !== 'unknown');
  const falseClaims = rows.filter(r => r.truth === 'false');
  const duplicateFalse = falseClaims.filter(r => r.hasDuplicateGoldFamilies);
  const highFalse = falseClaims.filter(r => r.verdict === 'true' && r.probabilityTrue >= threshold);
  const duplicateHigh = duplicateFalse.filter(r => r.verdict === 'true' && r.probabilityTrue >= threshold);
  const citationRelations = rows.flatMap(r => r.citationRelations ?? []).filter(relation => ['supports', 'contradicts', 'insufficient'].includes(relation));
  const alignedCitations = rows.filter(r => r.verdict !== 'unknown').flatMap(r => (r.citationRelations ?? []).filter(relation => ['supports', 'contradicts', 'insufficient'].includes(relation)).map(relation => Number(relation === (r.verdict === 'true' ? 'supports' : 'contradicts'))));
  return {
    n: rows.length, knownTruthCount: known.length, unknownTruthCount: rows.length - known.length,
    accuracyWithAbstentionAsError: mean(known.map(r => Number(r.verdict === r.truth))),
    coverage: known.length ? accepted.length / known.length : null,
    selectiveAccuracy: mean(accepted.map(r => Number(r.verdict === r.truth))),
    highConfidenceFalseAcceptance: { numerator: highFalse.length, denominator: falseClaims.length, rate: falseClaims.length ? highFalse.length / falseClaims.length : null },
    falseCorroborationProxy: { numerator: duplicateHigh.length, denominator: duplicateFalse.length, rate: duplicateFalse.length ? duplicateHigh.length / duplicateFalse.length : null,
      note: 'Conditional false-acceptance proxy; causal attribution requires the paired confidence-inflation experiment.' },
    citationSupportsClaimFraction: citationRelations.length ? citationRelations.filter(x => x === 'supports').length / citationRelations.length : null,
    citationVerdictAlignmentFraction: mean(alignedCitations),
    ...calibration(rows),
    familyPairF1: mean(rows.map(r => r.lineageMetrics?.f1).filter(x => x != null)),
    familyARI: mean(rows.map(r => r.lineageMetrics?.ari).filter(x => x != null))
  };
}

// Resample whole events so transformed copies of one claim never act as independent trials.
export function clusterBootstrap(rows, statistic, { seed = 20260930, repetitions = 1000 } = {}) {
  const groups = new Map(); for (const r of rows) { if (!groups.has(r.eventId)) groups.set(r.eventId, []); groups.get(r.eventId).push(r); }
  const events = [...groups.values()]; if (events.length < 2) return { estimate: statistic(rows), low: null, high: null, events: events.length, repetitions: 0 };
  const random = rng(seed); const values = [];
  for (let i = 0; i < repetitions; i++) {
    const sample = []; for (let j = 0; j < events.length; j++) sample.push(...events[Math.floor(random() * events.length)]);
    const value = statistic(sample); if (Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  return { estimate: statistic(rows), low: values.length ? values[Math.floor((values.length - 1) * 0.025)] : null, high: values.length ? values[Math.floor((values.length - 1) * 0.975)] : null, events: events.length, repetitions, seed };
}
export function pairedInflation(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.copyCount)) continue;
    const key = JSON.stringify([r.eventId, r.scenario, r.method, r.repeat ?? 0]);
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
  }
  const paired = [];
  for (const group of groups.values()) {
    const base = group.find(r => r.copyCount === 1); if (!base) continue;
    for (const r of group.filter(r => r.copyCount > 1)) paired.push({ eventId: r.eventId, scenario: r.scenario, method: r.method, repeat: r.repeat ?? 0, copyCount: r.copyCount, truth: r.truth, deltaProbabilityTrue: r.probabilityTrue - base.probabilityTrue, deltaFalseConfidence: r.truth === 'false' ? r.probabilityTrue - base.probabilityTrue : null });
  }
  return paired;
}
