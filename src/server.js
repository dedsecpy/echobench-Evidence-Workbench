import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AnnotationStore } from './annotations.js';
import { publicCase, validateDataset } from './schema.js';
import { inferLineage } from './lineage.js';
import { hash } from './io.js';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
export function createApp(records, { annotationDirectory = 'annotations' } = {}) {
  validateDataset(records); const store = new AnnotationStore(annotationDirectory);
  const cases = new Map(records.map(r => [r.id, r]));
  return http.createServer(async (req, res) => {
    const port = req.socket.localPort; const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    function send(status, value, type = 'application/json; charset=utf-8') { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(value) : value); }
    try {
      if (!allowedHosts.includes(req.headers.host)) return send(403, { error: 'Invalid host' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && staticFiles[url.pathname]) { const [file, type] = staticFiles[url.pathname]; return send(200, await readFile(path.join(WEB_DIR, file)), type); }
      if (req.method === 'GET' && url.pathname === '/api/cases') return send(200, { datasetHash: hash(records), cases: records.map(r => ({ id: r.id, claim: r.claim, kind: r.kind, documents: r.documents.length })) });
      if (!url.pathname.startsWith('/api/cases/')) return send(404, { error: 'Not found' });
      const id = decodeURIComponent(url.pathname.slice('/api/cases/'.length)); const record = cases.get(id);
      if (!record) return send(404, { error: 'Case not found' });
      if (req.method === 'GET') {
        const annotation = await store.load(record);
        return send(200, { record: { ...publicCase(record), kind: record.kind }, annotation, graph: inferLineage(publicCase(record).documents) });
      }
      if (req.method !== 'PUT') return send(405, { error: 'Method not allowed' });
      if (!allowedHosts.map(h => `http://${h}`).includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Same-origin annotation request required' });
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'JSON required' });
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) return send(413, { error: 'Annotation too large' }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const saved = await store.save(record, body.annotation, body.expectedRevision);
      return send(200, saved);
    } catch (error) { send(error.status ?? 400, { error: error.message }); }
  });
}
export async function startServer(records, options = {}) {
  const server = createApp(records, options); const port = options.port ?? 4317;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
