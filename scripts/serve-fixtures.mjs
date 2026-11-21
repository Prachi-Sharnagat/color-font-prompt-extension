// Serves fixtures/ on http://localhost:5178 for manual analyzer testing.
// Usage: npm run fixtures
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('fixtures');
const PORT = Number(process.env.PORT) || 5178;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

async function index() {
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
  const links = files.map((f) => `<li><a href="/${f}">${f}</a></li>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Fixtures</title><h1>Analyzer fixtures</h1><ul>${links}</ul>`;
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (path === '/') {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(await index());
      return;
    }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Fixtures at http://localhost:${PORT}/`);
});
