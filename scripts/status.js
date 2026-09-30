import { readFile } from 'node:fs/promises';
const summary = JSON.parse(await readFile('outputs/demo/summary.json', 'utf8'));
const inflation = JSON.parse(await readFile('outputs/demo/inflation.json', 'utf8'));
console.log('SYNTHETIC DIAGNOSTIC ONLY: heuristic scores; not measured real-agent performance.');
for (const method of ['raw', 'exact', 'echo', 'echo-no-links']) {
  const result = summary.methods[method]; const exact = inflation.summaries.find(x => x.method === method && x.scenario === 'exact');
  console.log(JSON.stringify({ method, predictions: result.n, coverage: result.coverage, falseCorroborationProxy: result.falseCorroborationProxy, exactDuplicationScoreChange: exact?.deltaProbabilityTrue.estimate }));
}
try {
  const pilot = (await readFile('data/pilot-public/cases.jsonl', 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  console.log(JSON.stringify({ realPilotClaims: pilot.length, documents: pilot.flatMap(r => r.documents).map(d => ({ url: d.url, title: d.title, characters: d.text.length, sha256: d.retrieval.sha256 })) }));
} catch { console.log('Real pilot is not available.'); }
