const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const INBOX_SECRET = String(process.env.INBOX_SECRET || 'demo-inbox-secret');
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.json');

function ensureInboxStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, '[]', 'utf8');
}

function readInbox() {
  ensureInboxStore();
  try {
    const raw = fs.readFileSync(INBOX_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeInbox(items) {
  ensureInboxStore();
  fs.writeFileSync(INBOX_FILE, JSON.stringify(items, null, 2), 'utf8');
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-HFA-Inbox-Token',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  const auth = String(req.headers.authorization || '');
  const token = String(req.headers['x-hfa-inbox-token'] || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer === INBOX_SECRET || token === INBOX_SECRET;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sanitizePathname(pn) {
  const clean = decodeURIComponent(pn.split('?')[0]);
  if (clean === '/') return '/index.html';
  return clean;
}

function serveStatic(req, res) {
  const pathname = sanitizePathname(new URL(req.url, `http://${req.headers.host}`).pathname);
  const filePath = path.join(ROOT, pathname.replace(/^\/+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/submissions') {
    try {
      const body = await parseJsonBody(req);
      const fields = body && typeof body === 'object' ? body : {};
      const inbox = readInbox();
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item = {
        id,
        receivedAt: new Date().toISOString(),
        page: String(fields.__page || fields.page || ''),
        kind: String(fields.__kind || fields.kind || 'contact'),
        data: fields,
        ip: req.socket.remoteAddress || ''
      };
      inbox.unshift(item);
      writeInbox(inbox.slice(0, 2000));
      return json(res, 200, { ok: true, id });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message || 'Bad request' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/inbox') {
    if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 100)));
    const items = readInbox().slice(0, limit);
    return json(res, 200, { ok: true, items });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/inbox/')) {
    if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
    const id = url.pathname.split('/').pop();
    const items = readInbox();
    const next = items.filter(it => String(it.id) !== String(id));
    writeInbox(next);
    return json(res, 200, { ok: true, deleted: items.length - next.length });
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  ensureInboxStore();
  console.log(`Proto site server running on http://localhost:${PORT}`);
  console.log(`Inbox API: GET http://localhost:${PORT}/api/inbox`);
});
