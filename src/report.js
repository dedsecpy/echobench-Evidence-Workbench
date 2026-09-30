import path from 'node:path';
import { escapeHTML as esc, writeAtomic, writeJSON } from './io.js';
import { mean } from './metrics.js';

export function figureSVG(rows, scenario = 'exact') {
  const methods = [...new Set(rows.map(r => r.method))]; const colors = ['#536cf5', '#e58b42', '#8b6ccf', '#35a88e', '#be5b87', '#1d768c', '#9c852d', '#7e8696'];
  const width = 840, height = 430, left = 65, top = 55, plotW = 550, plotH = 290;
  const counts = [...new Set(rows.filter(r => r.scenario === scenario).map(r => r.copyCount))].filter(Number.isFinite).sort((a, b) => a - b);
  const max = Math.max(2, ...counts); const x = n => left + (n - 1) / (max - 1) * plotW; const y = p => top + (1 - p) * plotH;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img"><title>Probability assigned to the claim versus supporting document count</title><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial,sans-serif" fill="#25334c"><text x="${left}" y="26" font-size="18">${esc(scenario)}: duplication sensitivity</text>`;
  for (let p = 0; p <= 1.001; p += 0.2) svg += `<path d="M${left},${y(p)}h${plotW}" stroke="#e5eaf2"/><text x="${left - 12}" y="${y(p) + 4}" text-anchor="end" font-size="12">${p.toFixed(1)}</text>`;
  for (const n of counts) svg += `<text x="${x(n)}" y="${top + plotH + 23}" text-anchor="middle" font-size="12">${n}</text>`;
  methods.forEach((method, i) => {
    const points = counts.map(n => ({ n, p: mean(rows.filter(r => r.method === method && r.scenario === scenario && r.copyCount === n).map(r => r.probabilityTrue)) })).filter(v => v.p != null);
    if (!points.length) return;
    const color = colors[i % colors.length];
    svg += `<polyline points="${points.map(v => `${x(v.n)},${y(v.p)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    for (const v of points) svg += `<circle cx="${x(v.n)}" cy="${y(v.p)}" r="3.5" fill="${color}"/>`;
    svg += `<rect x="645" y="${65 + i * 25}" width="12" height="3" fill="${color}"/><text x="665" y="${71 + i * 25}" font-size="12">${esc(method)}</text>`;
  });
  svg += `<text x="${left + plotW/2}" y="389" text-anchor="middle" font-size="13">Supporting documents (including original)</text><text transform="translate(18,200) rotate(-90)" text-anchor="middle" font-size="13">Probability assigned to claim</text><text x="${left}" y="415" font-size="11">${rows.every(r => r.kind === 'synthetic') ? 'SYNTHETIC DIAGNOSTIC ONLY. Heuristic scores are not calibrated probabilities.' : 'Inspect provenance and confidence type before interpreting this figure.'}</text></g></svg>`;
  return svg;
}
const number = x => x == null ? 'n/a' : (x * 100).toFixed(1) + '%';
export async function writeReport(directory, result) {
  await writeJSON(path.join(directory, 'summary.json'), result.summary);
  await writeJSON(path.join(directory, 'run.json'), result.manifest);
  await writeJSON(path.join(directory, 'inflation.json'), result.inflation);
  const scenarios = [...new Set(result.rows.map(r => r.scenario))].filter(Boolean);
  for (const scenario of scenarios) await writeAtomic(path.join(directory, `figure-${scenario}.svg`), figureSVG(result.rows, scenario));
  const table = Object.entries(result.summary.methods).map(([method, s]) => `<tr><td>${esc(method)}</td><td>${s.n}</td><td>${number(s.coverage)}</td><td>${number(s.selectiveAccuracy)}</td><td>${s.brier == null ? 'n/a' : s.brier.toFixed(3)}</td><td>${number(s.ece)}</td><td>${number(s.falseCorroborationProxy.rate)}</td><td>${number(s.familyPairF1)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EchoBench experiment report</title><style>body{font:16px/1.6 system-ui;color:#25334c;background:#f5f7fc;max-width:1150px;margin:40px auto;padding:0 24px}h1{font-size:32px}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;border-bottom:1px solid #e4e8f0;text-align:left;font-size:14px}.notice{padding:20px;background:#fff4d9;border-radius:12px}img{width:100%;max-width:840px;background:white;margin:24px 0;border-radius:12px}code{font-size:13px}</style><h1>EchoBench · experiment report</h1><p class="notice">${esc(result.manifest.disclaimer)}</p><p>${result.rows.length} evaluated predictions · dataset hash <code>${esc(result.manifest.datasetHash)}</code></p><table><thead><tr><th>Method</th><th>N</th><th>Coverage</th><th>Selective accuracy</th><th>Brier</th><th>ECE</th><th>False corroboration proxy</th><th>Family pair F1</th></tr></thead><tbody>${table}</tbody></table><p>Accuracy is computed only on known truths. Abstention is reported through coverage. The false corroboration proxy is conditional false acceptance; the paired experiment establishes sensitivity to duplication. Family F1 excludes unresolved gold lineage labels. Heuristic scores are uncalibrated.</p>${scenarios.map(s => `<img src="figure-${esc(s)}.svg" alt="${esc(s)} duplication sensitivity">`).join('')}<p>See <a href="summary.json">summary.json</a>, <a href="predictions.jsonl">predictions.jsonl</a>, <a href="inflation.json">paired differences</a>, and <a href="run.json">run manifest</a> for auditable results.</p></html>`;
  await writeAtomic(path.join(directory, 'report.html'), html);
}
