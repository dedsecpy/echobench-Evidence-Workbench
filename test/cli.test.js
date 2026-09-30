import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function command(args) { return spawnSync(process.execPath, ['src/cli.js', ...args], { cwd: root, encoding: 'utf8', windowsHide: true }); }
async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'echobench-cli-'));
  t.after(async () => { const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('echobench-cli-')); await rm(resolved, { recursive: true, force: true }); }); return dir;
}
test('CLI default seed, generation, validation, demo, and overwrite protection work', async t => {
  const dir = await temporary(t), data = path.join(dir, 'cases.jsonl'), output = path.join(dir, 'run');
  let result = command(['generate','--events','3','--output',data]); assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.includes('72 cases'));
  result = command(['validate','--dataset',data]); assert.equal(result.status, 0, result.stderr);
  result = command(['evaluate','--dataset',data,'--methods','raw,echo','--bootstrap','10','--output',output]); assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(await readFile(path.join(output, 'summary.json'), 'utf8')); assert.equal(summary.methods.raw.n, 72);
  result = command(['evaluate','--dataset',data,'--methods','raw,echo','--bootstrap','10','--output',output]); assert.equal(result.status, 1); assert.ok(result.stderr.includes('Run exists'));
  result = command(['demo','--events','2','--methods','raw,echo','--bootstrap','10','--output',path.join(dir,'demo')]); assert.equal(result.status, 0, result.stderr);
  result = command(['split','--dataset',data,'--output',path.join(dir,'split')]); assert.equal(result.status, 0, result.stderr);
});
test('CLI refuses an excessive model plan before making requests or creating a run', async t => {
  const dir = await temporary(t), data = path.join(dir, 'cases.jsonl'), output = path.join(dir, 'run');
  assert.equal(command(['generate','--events','1','--output',data]).status, 0);
  const result = command(['evaluate','--dataset',data,'--provider','model','--model','test-model','--limit','2','--max-calls','1','--output',output]);
  assert.equal(result.status, 1); assert.ok(result.stderr.includes('above --max-calls'));
  await assert.rejects(access(path.join(output, 'request.json')));
});
test('CLI requires an explicit limit for model runs', async t => {
  const dir = await temporary(t), data = path.join(dir, 'cases.jsonl');
  assert.equal(command(['generate','--events','1','--output',data]).status, 0);
  const result = command(['evaluate','--dataset',data,'--provider','model']); assert.equal(result.status, 1); assert.ok(result.stderr.includes('--limit'));
});
