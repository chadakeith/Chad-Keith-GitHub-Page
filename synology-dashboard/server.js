'use strict';

const path = require('path');
const express = require('express');

const PORT = parseInt(process.env.PORT || '3000', 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10) * 1000;
const COMPLETE_STATUS_IDS = (process.env.COMPLETE_STATUS_IDS || '5')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
const WEEK_START_DAY = (process.env.WEEK_START_DAY || 'monday').toLowerCase();

const AUTOTASK_USER = process.env.AUTOTASK_USER;
const AUTOTASK_SECRET = process.env.AUTOTASK_SECRET;
const AUTOTASK_INTEGRATION_CODE = process.env.AUTOTASK_INTEGRATION_CODE;

if (!AUTOTASK_USER || !AUTOTASK_SECRET || !AUTOTASK_INTEGRATION_CODE) {
  console.error('Missing AUTOTASK_USER / AUTOTASK_SECRET / AUTOTASK_INTEGRATION_CODE env vars.');
  process.exit(1);
}

const headers = {
  UserName: AUTOTASK_USER,
  Secret: AUTOTASK_SECRET,
  ApiIntegrationCode: AUTOTASK_INTEGRATION_CODE,
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

let zoneBasePromise = null;
async function getZoneBase() {
  if (zoneBasePromise) return zoneBasePromise;
  zoneBasePromise = (async () => {
    const url = `https://webservices.autotask.net/atservicesrest/V1.0/zoneInformation?user=${encodeURIComponent(AUTOTASK_USER)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`zoneInformation HTTP ${res.status}`);
    const data = await res.json();
    if (!data.url) throw new Error('zoneInformation returned no url');
    let base = data.url.replace(/\/+$/, '');
    if (!/\/V1\.0$/i.test(base)) base += '/V1.0';
    return base;
  })().catch(err => { zoneBasePromise = null; throw err; });
  return zoneBasePromise;
}

async function queryAll(baseUrl, entity, body) {
  const items = [];
  let url = `${baseUrl}/${entity}/query`;
  let isFirst = true;
  while (url) {
    const opts = isFirst
      ? { method: 'POST', headers, body: JSON.stringify(body) }
      : { method: 'GET', headers };
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${entity} query HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = await res.json();
    if (Array.isArray(data.items)) items.push(...data.items);
    url = data.pageDetails && data.pageDetails.nextPageUrl ? data.pageDetails.nextPageUrl : null;
    isFirst = false;
  }
  return items;
}

function startOfThisWeek(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun
  let diff;
  if (WEEK_START_DAY === 'sunday') {
    diff = -dow;
  } else {
    diff = dow === 0 ? -6 : 1 - dow; // Monday-start
  }
  d.setDate(d.getDate() + diff);
  return d;
}

function isoNoMs(date) {
  // Autotask accepts ISO 8601; trim milliseconds to keep filters tidy.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function fetchOpenTickets(baseUrl) {
  const body = {
    Filter: COMPLETE_STATUS_IDS.length === 1
      ? [{ op: 'noteq', field: 'status', value: COMPLETE_STATUS_IDS[0] }]
      : [{ op: 'notIn', field: 'status', value: COMPLETE_STATUS_IDS }],
    IncludeFields: ['id', 'ticketNumber', 'status', 'assignedResourceID', 'createDate']
  };
  return queryAll(baseUrl, 'Tickets', body);
}

async function fetchClosedThisWeek(baseUrl, weekStart) {
  const completedFilter = {
    op: 'and',
    items: [
      COMPLETE_STATUS_IDS.length === 1
        ? { op: 'eq', field: 'status', value: COMPLETE_STATUS_IDS[0] }
        : { op: 'in', field: 'status', value: COMPLETE_STATUS_IDS },
      { op: 'gte', field: 'completedDate', value: isoNoMs(weekStart) }
    ]
  };
  const body = {
    Filter: [completedFilter],
    IncludeFields: ['id', 'ticketNumber', 'status', 'assignedResourceID', 'completedDate']
  };
  return queryAll(baseUrl, 'Tickets', body);
}

async function fetchResources(baseUrl, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const body = {
      Filter: [{ op: 'in', field: 'id', value: chunk }],
      IncludeFields: ['id', 'firstName', 'lastName', 'email', 'title', 'isActive']
    };
    const items = await queryAll(baseUrl, 'Resources', body);
    for (const r of items) map.set(r.id, r);
  }
  return map;
}

function tally(tickets) {
  const counts = new Map();
  let unassigned = 0;
  for (const t of tickets) {
    const rid = t.assignedResourceID;
    if (rid == null) { unassigned += 1; continue; }
    counts.set(rid, (counts.get(rid) || 0) + 1);
  }
  return { counts, unassigned };
}

function fmtName(r, id) {
  if (!r) return `Resource ${id}`;
  const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return name || r.email || `Resource ${id}`;
}

async function buildSnapshot() {
  const baseUrl = await getZoneBase();
  const weekStart = startOfThisWeek();
  const [openTickets, closedTickets] = await Promise.all([
    fetchOpenTickets(baseUrl),
    fetchClosedThisWeek(baseUrl, weekStart)
  ]);

  const open = tally(openTickets);
  const closed = tally(closedTickets);
  const allIds = new Set([...open.counts.keys(), ...closed.counts.keys()]);
  const resources = await fetchResources(baseUrl, [...allIds]);

  const members = [...allIds].map(id => {
    const r = resources.get(id);
    return {
      id,
      name: fmtName(r, id),
      title: r && r.title ? r.title : '',
      active: r ? r.isActive !== false : true,
      open: open.counts.get(id) || 0,
      closedThisWeek: closed.counts.get(id) || 0
    };
  }).sort((a, b) => b.open - a.open || b.closedThisWeek - a.closedThisWeek || a.name.localeCompare(b.name));

  return {
    openTotal: openTickets.length,
    openUnassigned: open.unassigned,
    closedThisWeekTotal: closedTickets.length,
    closedUnassigned: closed.unassigned,
    members,
    weekStart: weekStart.toISOString(),
    weekStartDay: WEEK_START_DAY,
    completeStatusIds: COMPLETE_STATUS_IDS,
    fetchedAt: new Date().toISOString()
  };
}

let cache = { data: null, ts: 0, inflight: null };
async function getSnapshot({ fresh } = {}) {
  const now = Date.now();
  if (!fresh && cache.data && (now - cache.ts) < CACHE_TTL_MS) return cache.data;
  if (cache.inflight) return cache.inflight;
  cache.inflight = buildSnapshot()
    .then(data => { cache.data = data; cache.ts = Date.now(); return data; })
    .finally(() => { cache.inflight = null; });
  return cache.inflight;
}

const app = express();
app.disable('x-powered-by');

app.get('/api/tickets', async (req, res) => {
  try {
    const fresh = req.query.fresh === '1';
    const data = await getSnapshot({ fresh });
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('[api/tickets]', e);
    res.status(502).json({ error: e.message || String(e) });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.listen(PORT, () => {
  console.log(`autotask-dashboard listening on :${PORT}`);
  console.log(`week starts on: ${WEEK_START_DAY}`);
  console.log(`complete status ids: ${COMPLETE_STATUS_IDS.join(',')}`);
});
