import path from 'node:path';
import { assessFixture } from './fixtures.js';
import { validateDataset, validateAssessment, publicCase } from './schema.js';
import { inferLineage, METHODS } from './lineage.js';
import { analyze } from './guard.js';
import { summarize, pairwiseScores, pairedInflation, clusterBootstrap, mean } from './metrics.js';
import { hash, writeJSONL, writeJSON, sourceFingerprint } from './io.js';
import { writeReport } from './report.js';

function evaluatedRow(record, method, prediction, graph, extra = {}) {
  const goldFamilies = record.gold ? Object.fromEntries(Object.entries(record.gold.documentLabels).map(([id, label]) => [id, label.familyId])) : null;
  const familyIds = goldFamilies ? Object.values(goldFamilies).filter(id => !id.startsWith('unknown:')) : [];
  return { caseId: record.id, eventId: record.eventId, kind: record.kind, scenario: record.scenario ?? null, copyCount: record.copyCount ?? null,
    truth: record.gold?.truth ?? 'unknown', method, ...prediction,
    hasDuplicateGoldFamilies: familyIds.length !== new Set(familyIds).size,
    citationRelations: prediction.citations.map(id => record.gold?.documentLabels[id]?.relation ?? 'unlabelled'),
    lineageMetrics: goldFamilies ? pairwiseScores(goldFamilies, graph.assignment) : null,
    predictedFamilies: graph.families.length, ...extra };
}

export async function runExperiment(records, { output = 'outputs/demo', methods = ['raw', 'domain', 'exact', 'lexical', 'echo', 'echo-no-links', 'echo-no-text'],
  assessmentMap, embeddings, provider, repeats = 1, threshold = 0.78, acceptThreshold = 0.8, bootstrap = 1000, seed = 20260930, onProgress = () => {} } = {}) {
  validateDataset(records); const rows = []; const traces = []; const started = new Date().toISOString();
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error('repeats must be a positive integer');
  const agentMethods = ['agent-raw', 'agent-diverse', 'agent-echo'];
  for (const method of methods) if (![...METHODS, ...agentMethods].includes(method)) throw new Error(`Unknown method ${method}`);
  if (methods.some(m => agentMethods.includes(m)) && !provider) throw new Error('Agent methods require --provider model');
  // Fail before writing results if the requested assessment mode cannot handle every case.
  if (!provider && !assessmentMap && records.some(r => r.kind !== 'synthetic')) throw new Error('Real claims require imported assessments or a model provider.');
  if (assessmentMap) for (const record of records) {
    if (!assessmentMap[record.id]) throw new Error(`Missing imported assessment for ${record.id}`);
    validateAssessment(assessmentMap[record.id], record.documents);
  }
  for (const record of records) for (let repeat = 0; repeat < repeats; repeat++) {
    onProgress(`${record.id} · repetition ${repeat + 1}/${repeats}`);
    let assessmentCall;
    const assessment = assessmentMap?.[record.id] ?? (provider ? (assessmentCall = await provider.assess(record, repeat)).output : assessFixture(record));
    validateAssessment(assessment, record.documents);
    traces.push({ caseId: record.id, repeat, assessment, call: assessmentCall ? { fingerprint: assessmentCall.fingerprint, model: assessmentCall.model, usage: assessmentCall.usage, incurredUsage: assessmentCall.incurredUsage, cacheHit: assessmentCall.cacheHit } : null });
    for (const method of methods) {
      const graph = inferLineage(publicCase(record).documents, { method: method === 'agent-echo' ? 'echo' : method.startsWith('agent-') ? 'raw' : method, threshold, embeddings: embeddings?.[record.id] });
      const analysis = analyze(record, assessment, graph, { acceptThreshold });
      let prediction = analysis, modelCall;
      if (agentMethods.includes(method)) { modelCall = await provider.predict(record, { method, graph, analysis, repeat }); prediction = modelCall.output; }
      rows.push(evaluatedRow(record, method, prediction, graph, { repeat,
        call: modelCall ? { fingerprint: modelCall.fingerprint, model: modelCall.model, usage: modelCall.usage, incurredUsage: modelCall.incurredUsage, cacheHit: modelCall.cacheHit } : null }));
      traces.push({ caseId: record.id, repeat, method, graph });
    }
    // Checkpoint after each completed case; cache also persists earlier API calls if one fails.
    await writeJSONL(path.join(output, 'predictions.jsonl'), rows);
    await writeJSONL(path.join(output, 'traces.jsonl'), traces);
  }
  const byMethod = Object.fromEntries(methods.map(m => [m, summarize(rows.filter(r => r.method === m), { threshold: acceptThreshold })]));
  const inflationRows = pairedInflation(rows); const inflation = [];
  for (const method of methods) for (const scenario of [...new Set(inflationRows.map(r => r.scenario))]) {
    const selected = inflationRows.filter(r => r.method === method && r.scenario === scenario && r.copyCount === 10);
    if (selected.length) inflation.push({ method, scenario, copyCount: 10, deltaProbabilityTrue: clusterBootstrap(selected, sample => mean(sample.map(r => r.deltaProbabilityTrue)), { seed, repetitions: bootstrap }) });
  }
  const confidenceIntervals = Object.fromEntries(methods.map(method => [method, clusterBootstrap(rows.filter(r => r.method === method), sample => summarize(sample, { threshold: acceptThreshold }).falseCorroborationProxy.rate, { seed, repetitions: bootstrap })]));
  const real = records.some(r => r.kind === 'real');
  const manifest = { schemaVersion: '1.0', softwareVersion: '0.1.0', sourceHash: await sourceFingerprint(), startedAt: started, finishedAt: new Date().toISOString(), datasetHash: hash(records), nodeVersion: process.version,
    methods, repeats, threshold, acceptThreshold, bootstrap, seed, recordCount: records.length, eventCount: new Set(records.map(r => r.eventId)).size,
    provider: provider ? { baseURL: provider.baseURL, model: provider.model, maxCalls: provider.maxCalls, incurredCalls: provider.calls } : null,
    assessmentSource: assessmentMap ? 'imported_assessments' : provider ? 'model' : 'fixture-parser',
    disclaimer: real ? 'Research prototype. Source genealogy and confidence estimates require human validation and held-out calibration; this run alone does not establish generalization.' : 'SYNTHETIC DIAGNOSTIC ONLY. Fictional templated claims and a fixture parser test the pipeline. These are not measured results for real research agents, and heuristic scores are not calibrated probabilities.' };
  const result = { rows, manifest, summary: { methods: byMethod, falseCorroborationIntervals: confidenceIntervals }, inflation: { summaries: inflation, pairs: inflationRows } };
  await writeReport(output, result);
  await writeJSON(path.join(output, 'complete.json'), { complete: true, finishedAt: manifest.finishedAt, datasetHash: manifest.datasetHash });
  return result;
}
