#!/usr/bin/env node
/**
 * RequestDesk mock API: zero dependencies, in-memory, deterministic seed.
 *
 *   node mock-api/server.js
 *
 * Env:
 *   PORT        default 3001
 *   LATENCY_MS  default 300   (artificial delay on every response)
 *   FAIL_RATE   default 0     (0..1 probability of a random 503, never on /__reset or /health)
 *   SEED        default 42
 */
'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT || 3001);
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 300);
let FAIL_RATE = Number(process.env.FAIL_RATE ?? 0);
const SEED = Number(process.env.SEED || 42);

// ---------------------------------------------------------------- domain
const CATEGORIES = ['hardware', 'software', 'access', 'facilities'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'blocked', 'resolved'];
const PRIORITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const SLA_HOURS = { critical: 4, high: 24, medium: 72, low: 120 };
const TRANSITIONS = {
  open: ['in_progress', 'blocked', 'resolved'],
  in_progress: ['open', 'blocked', 'resolved'],
  blocked: ['open', 'in_progress'],
  resolved: ['open'],
};
const SORT_FIELDS = ['createdAt', 'updatedAt', 'slaDueAt', 'priority'];

const USERS = [
  { id: 'u1', name: 'Priya Natarajan', team: 'Service Desk' },
  { id: 'u2', name: 'Marcus Webb', team: 'Service Desk' },
  { id: 'u3', name: 'Aiko Tanaka', team: 'Infrastructure' },
  { id: 'u4', name: 'Diego Alvarez', team: 'Infrastructure' },
  { id: 'u5', name: 'Fatima Okafor', team: 'Identity' },
  { id: 'u6', name: 'Liam O\'Connor', team: 'Identity' },
  { id: 'u7', name: 'Sofia Rossi', team: 'Workplace' },
  { id: 'u8', name: 'Noah Kim', team: 'Workplace' },
];

const TITLES = {
  hardware: ['Laptop will not power on', 'Replace cracked monitor', 'Docking station flickers', 'Keyboard missing keys', 'Request second monitor', 'Battery drains in 1 hour'],
  software: ['Install VS Code extension pack', 'Licence for design tool', 'Excel crashes on macro', 'VPN client update fails', 'Outlook search not indexing', 'Upgrade Node runtime on build agent'],
  access: ['Grant access to finance share', 'Reset MFA device', 'Add to #incident-response channel', 'Production DB read access', 'Remove leaver from groups', 'SSO login loop on HR portal'],
  facilities: ['Meeting room AV not working', 'Desk booking for new starter', 'Air-con too cold on floor 3', 'Broken chair at desk 4B', 'Badge does not open lab door', 'Request standing desk'],
};

// ---------------------------------------------------------------- seed
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let db;
function seed() {
  const rand = mulberry32(SEED);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const requests = [];
  const comments = [];
  let commentSeq = 1;

  for (let i = 0; i < 64; i++) {
    const category = pick(CATEGORIES);
    const priority = pick(['low', 'medium', 'medium', 'high', 'high', 'critical']);
    const createdAt = new Date(now - Math.floor(rand() * 14 * 24 * 3600e3));
    const status = pick(['open', 'open', 'in_progress', 'in_progress', 'blocked', 'resolved']);
    const assigneeId = status === 'open' && rand() < 0.6 ? null : pick(USERS).id;
    const req = {
      id: `REQ-${1001 + i}`,
      title: pick(TITLES[category]),
      description: `Raised via portal. Category: ${category}. Please action at your earliest convenience.`,
      category,
      priority,
      status,
      assigneeId,
      requesterId: pick(USERS).id,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      slaDueAt: new Date(createdAt.getTime() + SLA_HOURS[priority] * 3600e3).toISOString(),
      version: 1,
    };
    requests.push(req);

    const n = Math.floor(rand() * 4);
    for (let c = 0; c < n; c++) {
      comments.push({
        id: `c${commentSeq++}`,
        requestId: req.id,
        authorId: pick(USERS).id,
        body: pick(['Looking into this now.', 'Can you share a screenshot?', 'Waiting on vendor.', 'Escalated to Infrastructure.', 'Fixed. Please confirm.']),
        createdAt: new Date(createdAt.getTime() + (c + 1) * 3600e3).toISOString(),
      });
    }
  }
  // Records carried over from the legacy system import.
  requests[0].title = 'Access to "R&D <Prototype>" share & wiki';
  requests[1].assigneeId = 'u999';
  [0, 1].forEach((i, n) => {
    const r = requests[i];
    const t = new Date(now - (20 + n * 10) * 60e3);
    r.createdAt = r.updatedAt = t.toISOString();
    r.slaDueAt = new Date(t.getTime() + SLA_HOURS[r.priority] * 3600e3).toISOString();
  });
  db = { requests, comments, nextId: 1001 + requests.length, nextComment: commentSeq };
}
seed();

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-Match, Idempotency-Key',
  });
  res.end(payload);
}
const error = (res, status, message, extra = {}) => send(res, status, { message, ...extra });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
  });
}

function csv(params, key, allowed) {
  const v = params.get(key);
  if (!v) return null;
  const list = v.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((x) => !allowed.includes(x));
  if (bad.length) throw { status: 400, message: `Invalid ${key}: ${bad.join(', ')}` };
  return list;
}

function validateNewRequest(body) {
  const errors = {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 5 || title.length > 120) errors.title = 'Title must be 5–120 characters';
  if (body.description != null && (typeof body.description !== 'string' || body.description.length > 2000))
    errors.description = 'Description must be at most 2000 characters';
  if (!CATEGORIES.includes(body.category)) errors.category = `Category must be one of: ${CATEGORIES.join(', ')}`;
  if (!PRIORITIES.includes(body.priority)) errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}`;
  if (body.requesterId != null && !USERS.some((u) => u.id === body.requesterId)) errors.requesterId = 'Unknown requester';
  return { errors, title };
}

// ---------------------------------------------------------------- routes
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '');
  const params = url.searchParams;
  const m = (re) => path.match(re);

  if (req.method === 'OPTIONS') return send(res, 204);
  if (path === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && path === '/api/__reset') { seed(); return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && path === '/api/__chaos') {
    const body = await readJson(req);
    FAIL_RATE = Math.min(1, Math.max(0, Number(body.failRate) || 0));
    return send(res, 200, { failRate: FAIL_RATE });
  }

  await sleep(LATENCY_MS);
  if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) return error(res, 503, 'Service temporarily unavailable');

  // GET /api/users
  if (req.method === 'GET' && path === '/api/users') return send(res, 200, USERS);

  // GET /api/requests
  if (req.method === 'GET' && path === '/api/requests') {
    let items = db.requests.slice();
    const q = (params.get('q') || '').trim().toLowerCase();
    if (q) items = items.filter((r) => (r.title + ' ' + r.description).toLowerCase().includes(q));
    const st = csv(params, 'status', STATUSES);
    if (st) items = items.filter((r) => st.includes(r.status));
    const pr = csv(params, 'priority', PRIORITIES);
    if (pr) items = items.filter((r) => pr.includes(r.priority));
    const a = params.get('assigneeId');
    if (a) items = items.filter((r) => (a === 'none' ? r.assigneeId === null : r.assigneeId === a));

    const sortRaw = params.get('sort') || '-createdAt';
    const desc = sortRaw.startsWith('-');
    const field = sortRaw.replace(/^-/, '');
    if (!SORT_FIELDS.includes(field)) return error(res, 400, `Invalid sort: ${sortRaw}`);
    items.sort((x, y) => {
      const cmp = field === 'priority'
        ? PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority]
        : x[field].localeCompare(y[field]);
      return desc ? -cmp : cmp;
    });

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '20', 10) || 20));
    const total = items.length;
    items = items.slice((page - 1) * pageSize, page * pageSize);
    return send(res, 200, { items, total, page, pageSize });
  }

  // POST /api/requests
  if (req.method === 'POST' && path === '/api/requests') {
    const body = await readJson(req);
    const { errors, title } = validateNewRequest(body);
    if (Object.keys(errors).length) return error(res, 400, 'Validation failed', { errors });
    const now = new Date();
    const created = {
      id: `REQ-${db.nextId++}`,
      title,
      description: body.description || '',
      category: body.category,
      priority: body.priority,
      status: 'open',
      assigneeId: null,
      requesterId: body.requesterId || 'u1',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      slaDueAt: new Date(now.getTime() + SLA_HOURS[body.priority] * 3600e3).toISOString(),
      version: 1,
    };
    db.requests.unshift(created);
    return send(res, 201, created);
  }

  // /api/requests/:id
  let match = m(/^\/api\/requests\/([^/]+)$/);
  if (match) {
    const item = db.requests.find((r) => r.id === decodeURIComponent(match[1]));
    if (!item) return error(res, 404, 'Request not found');

    if (req.method === 'GET') return send(res, 200, item);

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const errors = {};
      if (typeof body.version !== 'number') errors.version = 'version is required';
      if (body.status !== undefined && !STATUSES.includes(body.status)) errors.status = 'Invalid status';
      if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) errors.priority = 'Invalid priority';
      if (body.assigneeId !== undefined && body.assigneeId !== null && !USERS.some((u) => u.id === body.assigneeId))
        errors.assigneeId = 'Unknown assignee';
      const unknown = Object.keys(body).filter((k) => !['status', 'priority', 'assigneeId', 'version'].includes(k));
      if (unknown.length) errors._ = `Fields not patchable: ${unknown.join(', ')}`;
      if (Object.keys(errors).length) return error(res, 400, 'Validation failed', { errors });

      if (body.version !== item.version)
        return error(res, 409, 'Request was modified by someone else', { current: item });
      if (body.status !== undefined && body.status !== item.status && !TRANSITIONS[item.status].includes(body.status))
        return error(res, 422, `Cannot move from ${item.status} to ${body.status}`);

      if (body.status !== undefined) item.status = body.status;
      if (body.assigneeId !== undefined) item.assigneeId = body.assigneeId;
      if (body.priority !== undefined && body.priority !== item.priority) {
        item.priority = body.priority;
        item.slaDueAt = new Date(new Date(item.createdAt).getTime() + SLA_HOURS[item.priority] * 3600e3).toISOString();
      }
      item.version += 1;
      item.updatedAt = new Date().toISOString();
      return send(res, 200, item);
    }
    return error(res, 405, 'Method not allowed');
  }

  // /api/requests/:id/comments
  match = m(/^\/api\/requests\/([^/]+)\/comments$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!db.requests.some((r) => r.id === id)) return error(res, 404, 'Request not found');
    if (req.method === 'GET') {
      return send(res, 200, db.comments.filter((c) => c.requestId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const errors = {};
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (text.length < 1 || text.length > 1000) errors.body = 'Comment must be 1–1000 characters';
      if (!USERS.some((u) => u.id === body.authorId)) errors.authorId = 'Unknown author';
      if (Object.keys(errors).length) return error(res, 400, 'Validation failed', { errors });
      const comment = { id: `c${db.nextComment++}`, requestId: id, authorId: body.authorId, body: text, createdAt: new Date().toISOString() };
      db.comments.push(comment);
      return send(res, 201, comment);
    }
    return error(res, 405, 'Method not allowed');
  }

  return error(res, 404, `No route for ${req.method} ${path}`);
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e && e.status) return error(res, e.status, e.message);
      if (e && e.message === 'invalid json') return error(res, 400, 'Body must be valid JSON');
      console.error(e);
      error(res, 500, 'Internal server error');
    });
  })
  .listen(PORT, () => {
    console.log(`RequestDesk mock API on http://localhost:${PORT}/api  (latency ${LATENCY_MS}ms, failRate ${FAIL_RATE})`);
  });
