'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { openDb } = require('./lib/db.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8322;
const PUBLIC_DIR = path.join(__dirname, 'public');

const db = openDb();

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const STATUSES = ['todo', 'doing', 'done'];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function rowToCategory(row) {
  const counts = db
    .prepare('SELECT status, COUNT(*) AS n FROM tasks WHERE category_id = ? GROUP BY status')
    .all(row.id);
  const byStatus = { todo: 0, doing: 0, done: 0 };
  for (const c of counts) byStatus[c.status] = c.n;
  return { id: row.id, name: row.name, position: row.position, notes: row.notes || '', counts: byStatus };
}

function rowToTask(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    title: row.title,
    status: row.status,
    position: row.position,
  };
}

function nextPosition(categoryId, status) {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE category_id = ? AND status = ?')
    .get(categoryId, status);
  return row.pos;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  // /api/categories
  if (parts[1] === 'categories' && !parts[2]) {
    if (req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM categories ORDER BY position, id').all();
      return sendJson(res, 200, rows.map(rowToCategory));
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'name requis' });
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM categories').get().pos;
      const info = db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)').run(name, pos);
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
      return sendJson(res, 201, rowToCategory(row));
    }
  }

  // /api/categories/reorder
  if (parts[1] === 'categories' && parts[2] === 'reorder' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const stmt = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(i, id));
    return sendJson(res, 200, { ok: true });
  }

  // /api/categories/:id
  if (parts[1] === 'categories' && parts[2] && parts[2] !== 'reorder') {
    const id = Number(parts[2]);
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (typeof body.name === 'string' && body.name.trim()) {
        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(body.name.trim(), id);
      }
      if (typeof body.notes === 'string') {
        db.prepare('UPDATE categories SET notes = ? WHERE id = ?').run(body.notes, id);
      }
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      if (!row) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, rowToCategory(row));
    }
    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // /api/tasks
  if (parts[1] === 'tasks' && !parts[2]) {
    if (req.method === 'GET') {
      const categoryId = url.searchParams.get('category_id');
      const rows = categoryId
        ? db
            .prepare('SELECT * FROM tasks WHERE category_id = ? ORDER BY status, position, id')
            .all(Number(categoryId))
        : db.prepare('SELECT * FROM tasks ORDER BY category_id, status, position, id').all();
      return sendJson(res, 200, rows.map(rowToTask));
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const title = (body.title || '').trim();
      const categoryId = Number(body.category_id);
      const status = STATUSES.includes(body.status) ? body.status : 'todo';
      if (!title || !categoryId) return sendJson(res, 400, { error: 'title et category_id requis' });
      const pos = nextPosition(categoryId, status);
      const info = db
        .prepare('INSERT INTO tasks (category_id, title, status, position) VALUES (?, ?, ?, ?)')
        .run(categoryId, title, status, pos);
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
      return sendJson(res, 201, rowToTask(row));
    }
  }

  // /api/tasks/reorder
  if (parts[1] === 'tasks' && parts[2] === 'reorder' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const status = STATUSES.includes(body.status) ? body.status : null;
    if (!status) return sendJson(res, 400, { error: 'status invalide' });
    const stmt = db.prepare('UPDATE tasks SET status = ?, position = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(status, i, id));
    return sendJson(res, 200, { ok: true });
  }

  // /api/tasks/:id
  if (parts[1] === 'tasks' && parts[2] && parts[2] !== 'reorder') {
    const id = Number(parts[2]);
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (typeof body.title === 'string' && body.title.trim()) {
        db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(body.title.trim(), id);
      }
      if (STATUSES.includes(body.status)) {
        const pos = typeof body.position === 'number' ? body.position : nextPosition(id, body.status);
        db.prepare('UPDATE tasks SET status = ?, position = ? WHERE id = ?').run(body.status, pos, id);
      }
      if (typeof body.category_id === 'number') {
        db.prepare('UPDATE tasks SET category_id = ? WHERE id = ?').run(body.category_id, id);
      }
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!row) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, rowToTask(row));
    }
    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'route inconnue' });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: 'erreur serveur' });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Todo sur http://localhost:${PORT}`);
});
