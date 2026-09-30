import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateFixtures } from '../src/fixtures.js';
import { runExperiment } from '../src/experiment.js';
import { AnnotationStore, exportAnnotated, annotationAgreement, validateAnnotation } from '../src/annotations.js';
import { startServer } from '../src/server.js';
import { ModelProvider } from '../src/provider.js';
import { isPublicAddress, publicGet, robotsPolicy, extractHTML, collectManifest } from '../src/collector.js';

async function temp(t) { const dir = await mkdtemp(path.join(os.tmpdir(), 'echobench-test-')); t.after(async () => { const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(resolved).startsWith('echobench-test-')); await rm(resolved, { recursive: true, force: true }); }); return dir; }
const fixture = generateFixtures({ events: 1 })[0];
function annotation(record, name = 'reviewer-1') { return { annotator: name, truth: 'unknown', truthRationale: '', documents: record.documents.map(d => ({ documentId: d.id, relation: 'insufficient', familyId: `unknown:${d.id}`, quote: '', lineageRelation: 'unknown', parentId: null, notes: '' })) }; }

test('end-to-end demo writes auditable results, figures and completion marker', async t => {
  const dir = await temp(t); const records = generateFixtures({ events: 4 });
  const result = await runExperiment(records, { output: dir, methods: ['raw', 'echo'], bootstrap: 50 });
  assert.equal(result.rows.length, records.length * 2); assert.ok(result.manifest.disclaimer.includes('SYNTHETIC DIAGNOSTIC'));
  const html = await readFile(path.join(dir, 'report.html'), 'utf8'); assert.ok(html.includes('SYNTHETIC DIAGNOSTIC')); assert.ok(html.includes('False corroboration proxy'));
  const complete = JSON.parse(await readFile(path.join(dir, 'complete.json'), 'utf8')); assert.equal(complete.complete, true);
  const exact = result.inflation.summaries.find(r => r.method === 'echo' && r.scenario === 'exact'); assert.equal(exact.deltaProbabilityTrue.estimate, 0);
});
test('real claims cannot silently use the fixture parser', async () => {
  await assert.rejects(runExperiment([{ ...fixture, kind: 'real' }]), /Real claims require/);
});
test('annotation history preserves reviewers and rejects stale revisions', async t => {
  const dir = await temp(t); const store = new AnnotationStore(dir);
  const a = await store.save(fixture, annotation(fixture), 0); assert.equal(a.revision, 1);
  await assert.rejects(store.save(fixture, annotation(fixture), 0), /revision conflict/);
  const b = await store.save(fixture, annotation(fixture, 'reviewer-2'), 1); assert.equal(b.history.length, 2);
  const exported = await exportAnnotated([fixture], dir, 'reviewer-1'); assert.equal(exported[0].gold.truth, 'unknown');
  const stats = await annotationAgreement([fixture], dir, 'reviewer-1', 'reviewer-2'); assert.equal(stats.sharedCases, 1); assert.equal(stats.relation.agreement, 1); assert.equal(stats.sameFamilyPairs, null);
  await assert.rejects(store.load({ ...fixture, claim: 'Changed claim' }), /Case changed/);
});
test('annotators cannot silently assert lineage or invent evidence', () => {
  const a = annotation(fixture); a.documents[0].familyId = 'f1'; assert.throws(() => validateAnnotation(a, fixture), /Unknown lineage/);
  const b = annotation(fixture); b.documents[0].relation = 'supports'; b.documents[0].quote = 'invented'; assert.throws(() => validateAnnotation(b, fixture), /verbatim/);
  const c = annotation(fixture); c.truth = 'true'; assert.throws(() => validateAnnotation(c, fixture), /rationale/);
});
test('workbench binds loopback, hides gold, serves UI, and blocks cross-origin edits', async t => {
  const dir = await temp(t); const server = await startServer([fixture], { annotationDirectory: dir, port: 0 });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ui = await fetch(base); assert.equal(ui.status, 200); assert.ok((await ui.text()).includes('Evidence workbench'));
  const result = await (await fetch(`${base}/api/cases/${fixture.id}`)).json(); assert.equal(result.record.gold, undefined); assert.equal(result.annotation.revision, 0);
  const body = JSON.stringify({ expectedRevision: 0, annotation: annotation(fixture) });
  const blocked = await fetch(`${base}/api/cases/${fixture.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' }, body }); assert.equal(blocked.status, 403);
  const saved = await fetch(`${base}/api/cases/${fixture.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base }, body }); assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
  const stale = await fetch(`${base}/api/cases/${fixture.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base }, body }); assert.equal(stale.status, 409);
  const traversal = await fetch(`${base}/api/cases/%2E%2E%2F.env`); assert.equal(traversal.status, 404);
});
test('model calls strip gold, preserve repeat identity, cache, and enforce budgets', async t => {
  const dir = await temp(t); const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push(JSON.parse(options.body)); const output = { verdict: 'unknown', probabilityTrue: 0.5, citations: [], explanation: 'Evidence is conflicting.' };
    return new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  };
  const provider = new ModelProvider({ model: 'test-model', cacheDir: dir, maxCalls: 2, fetchImpl: fakeFetch });
  const first = await provider.predict(fixture); assert.equal(first.cacheHit, false);
  const cached = await provider.predict(fixture); assert.equal(cached.cacheHit, true); assert.equal(cached.incurredUsage, null);
  await provider.predict(fixture, { repeat: 1 }); assert.equal(requests.length, 2);
  await assert.rejects(provider.predict(fixture, { repeat: 2 }), /budget/);
  const sent = JSON.parse(requests[0].messages[1].content); assert.equal(sent.gold, undefined); assert.equal(sent.scenario, undefined);
  assert.ok(!sent.id.includes('exact')); assert.equal(requests[0].max_completion_tokens, 4096);
});
test('bad model output cannot enter evaluation even if JSON is valid', async t => {
  const provider = new ModelProvider({ model: 'test-model', cacheDir: await temp(t), fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdict: 'true', probabilityTrue: 1.2, citations: ['missing'], explanation: '' }) }, finish_reason: 'stop' }] })) });
  await assert.rejects(provider.predict(fixture), /probabilityTrue/);
});
test('model endpoint credentials never redirect to another host', () => {
  assert.throws(() => new ModelProvider({ model: 'x', baseURL: 'http://api.example/v1' }), /HTTPS/);
  assert.throws(() => new ModelProvider({ model: 'x', baseURL: 'https://user:pass@api.example/v1' }), /credentials/);
});
test('collector rejects local, private, reserved, IPv6 mapped and non-http targets', async () => {
  for (const address of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.1.1','192.0.2.1','::1','::ffff:127.0.0.1','fc00::1','2001:0db8::1','2001::1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true); assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(publicGet('file:///etc/passwd'), /public HTTP/);
  await assert.rejects(publicGet('http://localhost/', { lookup: async () => [{ address: '127.0.0.1', family: 4 }] }), /Private or reserved/);
});
test('robots policy uses specific agents, longest matches and allow ties', () => {
  const robots = 'User-agent: *\nDisallow: /\nUser-agent: EchoBenchBot\nDisallow: /private\nAllow: /private/open\nCrawl-delay: 2';
  assert.equal(robotsPolicy(robots, 'https://site.example/news').allowed, true);
  assert.equal(robotsPolicy(robots, 'https://site.example/private/x').allowed, false);
  assert.equal(robotsPolicy(robots, 'https://site.example/private/open/x').allowed, true);
  assert.equal(robotsPolicy(robots, 'https://site.example/news').delaySeconds, 2);
  assert.equal(robotsPolicy('User-agent: *\nDisallow: /a*\nAllow: /a*', 'https://site.example/abc').allowed, true);
  assert.equal(robotsPolicy('User-agent: *\nDisallow: /*.pdf$', 'https://site.example/a.pdf').allowed, false);
});
test('HTML extraction strips scripts, keeps article and does not mistake links for lineage', () => {
  const result = extractHTML('<html lang="en"><head><title>A &amp; B</title></head><body><nav>Junk</nav><article><p>Claim &#49;.</p><a href="/origin">Source</a><script>attack()</script></article></body></html>', 'https://site.example/article');
  assert.equal(result.title, 'A & B'); assert.ok(result.text.includes('Claim 1.')); assert.ok(!result.text.includes('attack')); assert.ok(!result.text.includes('Junk'));
  assert.equal(result.outgoingLinks[0].url, 'https://site.example/origin'); assert.deepEqual(result.attributions, []);
});
test('collection honors robots, records failures, hashes snapshots and handles redirects', async t => {
  const output = await temp(t); const urls = [];
  const get = async url => {
    urls.push(url);
    if (url.endsWith('/robots.txt')) return { status: 200, headers: {}, body: 'User-agent: *\nDisallow: /private' };
    if (url.endsWith('/redirect')) return { status: 302, headers: { location: '/story' }, body: '' };
    return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html lang="en"><article>A public measurement.</article></html>' };
  };
  const manifest = [{ id: 'real-case', eventId: 'real-event', claim: 'A claim.', urls: ['https://site.example/redirect','https://site.example/private'] }];
  const result = await collectManifest(manifest, { output, delayMs: 0, get }); assert.equal(result.cases.length, 1); assert.equal(result.errors.length, 1); assert.ok(!urls.some(u => u.endsWith('/private')));
  assert.equal(result.cases[0].documents[0].url, 'https://site.example/story'); assert.equal(result.cases[0].documents[0].retrieval.sha256.length, 64);
  const raw = await readFile(path.join(output, result.cases[0].documents[0].retrieval.rawFile), 'utf8'); assert.ok(raw.includes('public measurement'));
});
