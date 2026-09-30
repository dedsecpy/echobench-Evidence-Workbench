import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { hash, writeJSONL } from './io.js';
import { validateDataset } from './schema.js';

export const USER_AGENT = 'EchoBenchBot/0.1 (research source collector)';
export function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (net.isIP(address) === 6) {
    const s = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase(); const first = parseInt(s.split(':')[0], 16);
    // Conservative public IPv6 allowlist: global unicast, excluding documentation/transition ranges.
    return first >= 0x2000 && first <= 0x3fff && !s.startsWith('2001:db8:') && !s.startsWith('2002:') && !s.startsWith('2001:0:') && !s.startsWith('2001::');
  }
  return false;
}

export async function publicGet(value, { limitBytes = 2_000_000, timeoutMs = 20000, lookup = dns.lookup } = {}) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Collector only permits public HTTP(S) on standard ports');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private or reserved network address blocked');
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the resolved public IP while preserving hostname for TLS and HTTP Host.
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => options.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)
    }, res => {
      let total = 0; const chunks = [];
      res.on('data', chunk => { total += chunk.length; if (total > limitBytes) { req.destroy(new Error('Response exceeds byte limit')); return; } chunks.push(chunk); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), url: url.href }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error('Source request timed out')), timeoutMs);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
}

export function robotsPolicy(text, url, agent = 'echobenchbot') {
  const groups = []; let current = { agents: [], rules: [], delays: [] }; let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line || !line.includes(':')) continue;
    const colon = line.indexOf(':'); const key = line.slice(0, colon).toLowerCase(); const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (hasRules) { groups.push(current); current = { agents: [], rules: [], delays: [] }; hasRules = false; }
      current.agents.push(value.toLowerCase());
    } else if (current.agents.length && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true;
      if (key === 'crawl-delay') { const n = Number(value); if (Number.isFinite(n) && n >= 0) current.delays.push(n); }
      else if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  if (current.agents.length) groups.push(current);
  const specificity = g => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : agent.includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(specificity)); const matched = groups.filter(g => specificity(g) === best && best >= 0);
  const u = new URL(url); const target = u.pathname + u.search; const matches = [];
  for (const rule of matched.flatMap(g => g.rules)) {
    const end = rule.pattern.endsWith('$'); const pattern = end ? rule.pattern.slice(0, -1) : rule.pattern;
    const regex = '^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : '');
    if (new RegExp(regex).test(target)) matches.push({ ...rule, specificity: pattern.replaceAll('*', '').length });
  }
  matches.sort((a, b) => b.specificity - a.specificity || Number(b.allow) - Number(a.allow));
  return { allowed: !matches.length || matches[0].allow, delaySeconds: Math.max(0, ...matched.flatMap(g => g.delays)), matchedRule: matches[0]?.pattern ?? null };
}

function decode(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[entity.toLowerCase()]));
}
export function extractHTML(html, url) {
  const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '');
  const clean = html.replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const body = clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? clean;
  const text = decode(body.replace(/<\/(p|div|h[1-6]|li|section|article)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  const links = [];
  for (const match of clean.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { const target = new URL(decode(match[1]), url); if (['http:', 'https:'].includes(target.protocol)) links.push({ url: target.href, anchor: decode(match[2].replace(/<[^>]+>/g, '').trim()) }); } catch { /* unusable link */ }
  }
  const language = html.match(/<html\b[^>]*lang\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'und';
  return { title, text, language, outgoingLinks: links, attributions: [], extraction: 'simple-html-v1; human passage and attribution review required' };
}

export async function collectManifest(manifest, { output = 'data/collected', delayMs = 1500, get = publicGet, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onProgress = () => {} } = {}) {
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 100) throw new Error('Manifest must contain 1–100 claim entries per collection batch');
  const cases = [], errors = [], robots = new Map(), last = new Map(); let pageCount = 0;
  const seenIds = new Set();
  for (const entry of manifest) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(entry.id) || seenIds.has(entry.id) || typeof entry.claim !== 'string' || !entry.claim || typeof entry.eventId !== 'string' || !entry.eventId || !Array.isArray(entry.urls) || !entry.urls.length) throw new Error('Each manifest entry needs a unique safe id, claim, eventId and nonempty urls');
    seenIds.add(entry.id); pageCount += entry.urls.length;
    for (const url of entry.urls) new URL(url);
  }
  if (pageCount > 500) throw new Error('Manifest exceeds 500 pages; split into reviewable batches');
  await mkdir(output, { recursive: true });
  async function policy(url) {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      const response = await get(`${origin}/robots.txt`);
      if (response.status === 404 || response.status === 410) robots.set(origin, '');
      else if (response.status >= 200 && response.status < 300) robots.set(origin, response.body);
      else throw new Error(`robots.txt unavailable (${response.status}); collection skipped`);
    }
    const p = robotsPolicy(robots.get(origin), url);
    if (!p.allowed) throw new Error(`robots.txt disallows this path (${p.matchedRule})`);
    const interval = Math.max(delayMs, p.delaySeconds * 1000);
    if (interval > 60000) throw new Error('robots.txt requests crawl delay above 60 seconds; schedule separately');
    const wait = interval - (Date.now() - (last.get(origin) ?? 0)); if (wait > 0) await sleep(wait);
    last.set(origin, Date.now()); return p;
  }
  for (const entry of manifest) {
    const docs = []; const seenURLs = new Set();
    for (const initial of entry.urls) {
      onProgress(initial);
      try {
        let url = new URL(initial).href, response, p; const visited = new Set();
        for (let redirect = 0; redirect < 6; redirect++) {
          if (visited.has(url)) throw new Error('Redirect loop'); visited.add(url);
          p = await policy(url); response = await get(url);
          if (response.status >= 300 && response.status < 400 && response.headers.location) { url = new URL(response.headers.location, url).href; response = null; continue; }
          break;
        }
        if (!response) throw new Error('Too many redirects');
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        if (!/text\/html|application\/xhtml\+xml|text\/plain/.test(response.headers['content-type'] ?? '')) throw new Error('Only HTML or plain text supported');
        if (seenURLs.has(url)) throw new Error('Duplicate final URL'); seenURLs.add(url);
        const extracted = /text\/plain/.test(response.headers['content-type']) ? { title: '', text: response.body.trim(), language: 'und', outgoingLinks: [], attributions: [], extraction: 'plain-text-v1' } : extractHTML(response.body, url);
        if (!extracted.text) throw new Error('No readable text');
        const digest = hash(response.body); const rawFile = path.join(output, 'raw', `${digest}.txt`);
        await mkdir(path.dirname(rawFile), { recursive: true }); await writeFile(rawFile, response.body, { encoding: 'utf8', flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
        docs.push({ id: `doc-${hash(url).slice(0, 12)}`, url, ...extracted, publishedAt: null, author: null,
          retrieval: { requestedUrl: initial, retrievedAt: new Date().toISOString(), sha256: digest, rawFile: path.relative(output, rawFile), robots: p } });
      } catch (error) { errors.push({ caseId: entry.id, url: initial, error: error.message }); }
    }
    if (docs.length) cases.push({ schemaVersion: '1.0', id: entry.id, eventId: entry.eventId, kind: 'real', claim: entry.claim, documents: docs, provenance: { collector: USER_AGENT, status: 'unannotated', intendedUse: 'local research review' } });
  }
  if (cases.length) validateDataset(cases);
  await writeJSONL(path.join(output, 'cases.jsonl'), cases); await writeJSONL(path.join(output, 'errors.jsonl'), errors);
  return { cases, errors };
}
