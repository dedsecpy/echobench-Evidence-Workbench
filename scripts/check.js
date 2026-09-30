import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
for (const directory of ['src', 'web', 'scripts', 'test']) {
  for (const file of await readdir(directory)) if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', path.join(directory, file)], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) { console.error(result.stderr || result.error); process.exitCode = 1; }
  }
}
if (!process.exitCode) console.log('All JavaScript syntax checks passed.');
