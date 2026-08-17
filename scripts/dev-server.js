/**
 * Servidor de desarrollo local — emula cómo Vercel sirve /api en producción,
 * para poder probar el proyecto completo (frontend + API) sin desplegar.
 * En Vercel real NO se usa este archivo: el ruteo de /api es automático
 * a partir de la estructura de carpetas.
 *
 * Uso:
 *   DATABASE_URL="postgres://..." JWT_SECRET="..." node scripts/dev-server.js
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

const routes = [
  { pattern: /^\/api\/auth\/login$/, file: 'api/auth/login.js' },
  { pattern: /^\/api\/auth\/logout$/, file: 'api/auth/logout.js' },
  { pattern: /^\/api\/auth\/me$/, file: 'api/auth/me.js' },
  { pattern: /^\/api\/personas$/, file: 'api/personas/index.js' },
  { pattern: /^\/api\/personas\/(\d+)$/, file: 'api/personas/[id].js', params: ['id'] },
  { pattern: /^\/api\/accesos$/, file: 'api/accesos/index.js' },
  { pattern: /^\/api\/accesos\/(\d+)\/salida$/, file: 'api/accesos/[id]/salida.js', params: ['id'] },
  { pattern: /^\/api\/exportar\/json$/, file: 'api/exportar/json.js' },
  { pattern: /^\/api\/exportar\/csv$/, file: 'api/exportar/csv.js' },
  { pattern: /^\/api\/auditoria$/, file: 'api/auditoria/index.js' },
  { pattern: /^\/api\/usuarios$/, file: 'api/usuarios/index.js' },
  { pattern: /^\/api\/usuarios\/(\d+)$/, file: 'api/usuarios/[id].js', params: ['id'] }
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

function makeRes(rawRes) {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    setHeader(k, v) { rawRes.setHeader(k, v); return this; },
    json(obj) {
      rawRes.statusCode = statusCode;
      rawRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      rawRes.end(JSON.stringify(obj));
    },
    send(data) {
      rawRes.statusCode = statusCode;
      rawRes.end(data);
    }
  };
}

async function readBody(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

async function handleApi(req, res, pathname, searchParams) {
  const match = routes.find(r => r.pattern.test(pathname));
  if (!match) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Ruta de API no encontrada.' }));
    return;
  }

  const groups = pathname.match(match.pattern);
  const query = Object.fromEntries(searchParams.entries());
  if (match.params) {
    match.params.forEach((name, i) => { query[name] = groups[i + 1]; });
  }

  const mod = await import(path.join(ROOT, match.file) + `?t=${Date.now()}`);
  const handler = mod.default;

  const fakeReq = { method: req.method, headers: req.headers, query, body: await readBody(req) };
  const fakeRes = makeRes(res);

  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
  }
}

async function handleStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(ROOT, decodeURIComponent(filePath));
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const safeUrl = req.url.replace(/^\/+/, '/');
  const url = new URL(safeUrl, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url.pathname, url.searchParams);
  } else {
    await handleStatic(req, res, url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Servidor de desarrollo en http://localhost:${PORT}`);
});
