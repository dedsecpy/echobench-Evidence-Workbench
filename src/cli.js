#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJSON, readJSONL, writeJSON, writeJSONL, hash, sourceFingerprint } from './io.js';
import { generateFixtures } from './fixtures.js';
import { validateDataset, publicCase } from './schema.js';
import { runExperiment } from './experiment.js';
import { ModelProvider } from './provider.js';
import { startServer } from './server.js';
import { collectManifest } from './collector.js';
import { exportAnnotated, annotationAgreement } from './annotations.js';
import { splitDataset } from './split.js';

const HELP = `EchoBench / EchoGuard — research prototype (Node 22+)

  node src/cli.js demo                         Offline diagnostic + report
  node src/cli.js generate --output FILE       Synthetic cases (JSONL)
  node src/cli.js validate --dataset FILE      Validate case schema
  node src/cli.js evaluate --dataset FILE      Baseline / agent experiment
  node src/cli.js serve --dataset FILE         Local evidence workbench
  node src/cli.js collect --manifest FILE      Collect selected public URLs
  node src/cli.js split --dataset FILE         Source/event-disjoint split
  node src/cli.js public --dataset FILE        Export cases without gold
  node src/cli.js export --dataset FILE --annotator NAME
  node src/cli.js agreement --dataset FILE --annotators A,B

Options:
  --output PATH               Output file or directory (depends on command)
  --events N --seed N          Synthetic generator (12 events; seed 20260930)
  --methods LIST              raw,domain,exact,lexical,echo,echo-no-links,echo-no-text
                              Optional: semantic,agent-raw,agent-diverse,agent-echo
  --provider fixture|model    Default fixture (only bundled synthetic data)
  --assessments FILE          Imported per-case document assessments (JSON object)
  --embeddings FILE           Imported {caseId:{docId:[numbers]}} for semantic baseline
  --model ID --base-url URL   Model endpoint, configurable through environment
  --max-calls N --limit N     Required explicit --limit for model runs; budget defaults 20
  --repeats N                 Independent API samples; fixture repeats must stay 1
  --json-mode                Use json_object rather than strict JSON Schema
  --threshold N              Lexical grouping threshold (0.78; freeze before test)
  --accept-threshold N       Decision score threshold (0.8; uncalibrated)
  --bootstrap N              Event-cluster bootstrap repetitions (1000)
  --annotations DIR          Local annotation store (annotations)
  --port N                   Workbench binds 127.0.0.1 (4317)
  --resume                   Resume an identical interrupted run using cached requests

Demo scores use a fixture parser and heuristic evidence aggregation. They are not
measured performance of real research agents or calibrated probabilities.
`;

function int(value, fallback, min = 1, max = 100000) {
  const result = value == null ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Expected integer in [${min},${max}], got ${value}`);
  return result;
}
function fraction(value, fallback) { const n = value == null ? fallback : Number(value); if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('Expected fraction in [0,1]'); return n; }
async function dataset(file) { if (!file) throw new Error('--dataset FILE required'); return validateDataset(await readJSONL(file)); }
async function freshFile(file) { if (await exists(file)) throw new Error(`Output already exists: ${file}. Choose a new output path.`); }
async function evaluation(records, options) {
  const output = options.output ?? 'outputs/experiment';
  const model = options.provider === 'model';
  if (options.provider && !['fixture', 'model'].includes(options.provider)) throw new Error('provider must be fixture or model');
  if (model && !options.limit) throw new Error('Model runs require --limit N to make the request count explicit.');
  if (options.limit) records = records.slice(0, int(options.limit, 1));
  const methods = options.methods?.split(',').map(s => s.trim()) ?? (model ? ['agent-raw', 'agent-diverse', 'agent-echo'] : ['raw', 'domain', 'exact', 'lexical', 'echo', 'echo-no-links', 'echo-no-text']);
  if (new Set(methods).size !== methods.length) throw new Error('Duplicate methods');
  const repeats = int(options.repeats, 1, 1, 20);
  if (!model && repeats !== 1) throw new Error('Offline/imported assessments are deterministic. Do not count repeated outputs as independent trials.');
  const threshold = fraction(options.threshold, 0.78), acceptThreshold = fraction(options['accept-threshold'], 0.8);
  const assessmentMap = options.assessments ? await readJSON(options.assessments) : undefined;
  const embeddings = options.embeddings ? await readJSON(options.embeddings) : undefined;
  const provider = model ? new ModelProvider({ model: options.model, baseURL: options['base-url'], maxCalls: int(options['max-calls'], 20), cacheDir: path.join(output, 'cache'), format: options['json-mode'] ? 'json_object' : 'json_schema' }) : undefined;
  const bootstrap = int(options.bootstrap, 1000, 10, 10000);
  const plannedCalls = records.length * repeats * ((assessmentMap ? 0 : model ? 1 : 0) + methods.filter(m => m.startsWith('agent-')).length);
  if (provider && !options.resume && plannedCalls > provider.maxCalls) throw new Error(`Plan needs ${plannedCalls} calls, above --max-calls ${provider.maxCalls}. Reduce --limit/--methods or explicitly increase the budget.`);
  const configuration = { datasetHash: hash(records), sourceHash: await sourceFingerprint(), methods, repeats, threshold, acceptThreshold, bootstrap, seed: int(options.seed, 20260930, 0, 4294967295),
    assessmentHash: assessmentMap ? hash(assessmentMap) : null, embeddingsHash: embeddings ? hash(embeddings) : null, model: provider?.model ?? null, baseURL: provider?.baseURL ?? null, format: provider?.format ?? null };
  const planFile = path.join(output, 'request.json');
  if (await exists(planFile)) {
    if (!options.resume) throw new Error(`Run exists at ${output}. Use a new directory or --resume for an identical interrupted run.`);
    const saved = await readJSON(planFile); if (hash(saved) !== hash(configuration)) throw new Error('Resume configuration differs from the saved run');
    if (await exists(path.join(output, 'complete.json'))) throw new Error('Run is already complete. Choose a new directory for a new experiment.');
  } else { if (options.resume) throw new Error('Nothing to resume'); await writeJSON(planFile, configuration); }
  console.log(`Cases: ${records.length} | events: ${new Set(records.map(r => r.eventId)).size} | methods: ${methods.length} | planned requests before cache: ${plannedCalls}`);
  let progress = 0;
  const result = await runExperiment(records, { output, methods, assessmentMap, embeddings, provider, repeats, threshold, acceptThreshold,
    bootstrap, seed: configuration.seed,
    onProgress: message => { if (model || progress++ % 24 === 0) console.log(message); } });
  console.log(`Report: ${path.resolve(output, 'report.html')}`);
  console.log(result.manifest.disclaimer);
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const spec = Object.fromEntries(['output', 'dataset', 'manifest', 'events', 'seed', 'methods', 'provider', 'assessments', 'embeddings', 'model', 'base-url', 'max-calls', 'limit', 'repeats', 'threshold', 'accept-threshold', 'bootstrap', 'annotations', 'annotator', 'annotators', 'port'].map(name => [name, { type: 'string' }]));
  Object.assign(spec, { help: { type: 'boolean', short: 'h' }, 'json-mode': { type: 'boolean' }, resume: { type: 'boolean' } });
  const { values: options, positionals } = parseArgs({ args: argv, options: spec, allowPositionals: true });
  const command = positionals[0]; if (!command || options.help) { console.log(HELP); return; }
  if (positionals.length > 1) throw new Error('Unexpected positional argument');
  const annotations = options.annotations ?? 'annotations';
  if (command === 'demo') {
    const records = generateFixtures({ events: int(options.events, 12, 1, 100), seed: int(options.seed, 20260930, 0, 4294967295) });
    const output = options.output ?? 'outputs/demo'; const file = path.join(output, 'cases.jsonl');
    if (!options.resume) await freshFile(file);
    await writeJSONL(file, records); return evaluation(records, { ...options, output });
  }
  if (command === 'generate') {
    const output = options.output ?? 'data/synthetic.jsonl'; await freshFile(output);
    const records = generateFixtures({ events: int(options.events, 12, 1, 100), seed: int(options.seed, 20260930, 0, 4294967295) }); validateDataset(records);
    await writeJSONL(output, records); console.log(`${records.length} cases generated at ${path.resolve(output)}`); return;
  }
  if (command === 'collect') {
    if (!options.manifest) throw new Error('--manifest FILE required');
    const output = options.output ?? 'data/collected'; await freshFile(path.join(output, 'cases.jsonl'));
    const result = await collectManifest(await readJSON(options.manifest), { output, onProgress: url => console.log(`Collecting ${url}`) });
    console.log(`${result.cases.length} claims collected; ${result.errors.length} URLs skipped. Inspect errors.jsonl and review text before annotation.`);
    if (!result.cases.length) process.exitCode = 1;
    return;
  }
  const records = await dataset(options.dataset ?? (command === 'serve' ? 'outputs/demo/cases.jsonl' : undefined));
  if (command === 'validate') { console.log(`Valid: ${records.length} cases / ${new Set(records.map(r => r.eventId)).size} events`); return; }
  if (command === 'evaluate') return evaluation(records, options);
  if (command === 'serve') {
    const server = await startServer(records, { annotationDirectory: annotations, port: int(options.port, 4317, 1, 65535) });
    console.log(`Evidence workbench: http://127.0.0.1:${server.address().port}`);
    console.log(`Annotations: ${path.resolve(annotations)}. Press Ctrl+C to stop.`);
    return server;
  }
  if (command === 'split') {
    const output = options.output ?? 'data/splits'; const result = splitDataset(records, { seed: int(options.seed, 20260930, 0, 4294967295) });
    for (const name of ['train', 'validation', 'test']) await freshFile(path.join(output, `${name}.jsonl`));
    for (const name of ['train', 'validation', 'test']) await writeJSONL(path.join(output, `${name}.jsonl`), result[name]);
    await writeJSON(path.join(output, 'split.json'), result.manifest); console.log(JSON.stringify(result.manifest.counts)); return;
  }
  if (command === 'public') { const output = options.output ?? 'data/public.jsonl'; await freshFile(output); await writeJSONL(output, records.map(publicCase)); console.log(`Gold-free export: ${output} (model input format, not a labelled benchmark file)`); return; }
  if (command === 'export') {
    if (!options.annotator) throw new Error('--annotator NAME required; choose the adjudicator explicitly');
    const output = options.output ?? 'data/annotated.jsonl'; await freshFile(output);
    await writeJSONL(output, await exportAnnotated(records, annotations, options.annotator)); console.log(`Annotated cases: ${output}`); return;
  }
  if (command === 'agreement') {
    const names = options.annotators?.split(','); if (!names || names.length !== 2 || names[0] === names[1]) throw new Error('--annotators A,B requires two different annotators');
    const agreement = await annotationAgreement(records, annotations, ...names); console.log(JSON.stringify(agreement, null, 2)); if (options.output) { await freshFile(options.output); await writeJSON(options.output, agreement); } return;
  }
  throw new Error(`Unknown command: ${command}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`EchoBench: ${error.message}`); process.exitCode = 1; });
}
