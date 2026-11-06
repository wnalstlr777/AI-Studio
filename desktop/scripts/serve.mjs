import './build.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
createServer(async (req,res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.gif':'image/gif'})[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
}).listen(1420, '127.0.0.1', () => console.log('UI preview: http://127.0.0.1:1420 (native functions unavailable)'));
