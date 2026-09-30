import { mkdir, readFile, writeFile, rename, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
export async function sourceFingerprint() {
  const folder = new URL('./', import.meta.url);
  const files = (await readdir(folder)).filter(name => name.endsWith('.js')).sort();
  return hash(await Promise.all(files.map(async name => ({ name, source: await readFile(new URL(name, folder), 'utf8') }))));
}
export async function readJSONL(file) {
  const text = await readFile(file, 'utf8');
  return text.split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON at ${file}:${i + 1}`); }
  });
}
export async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}
export const writeJSON = (file, data) => writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
export const writeJSONL = (file, records) => writeAtomic(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
export async function exists(file) { try { await access(file); return true; } catch { return false; } }
export function rng(seed = 20260930) {
  let state = Number(seed) >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
export function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
