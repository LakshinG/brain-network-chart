import http from 'node:http';
import { Readable } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { MCPClient } from 'mcp-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8789);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8010/mcp';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const MCP_HTTP_BASE_URL = process.env.MCP_HTTP_BASE_URL || new URL('..', MCP_SERVER_URL.endsWith('/') ? MCP_SERVER_URL : `${MCP_SERVER_URL}/`).toString().replace(/\/$/, '');

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const mcpClient = new MCPClient({
  name: 'neuroagent-node-backend',
  version: '1.0.0',
});

let isConnected = false;

function broadcastStatus() {
  const payload = JSON.stringify({
    type: 'mcp_status',
    connected: isConnected,
    mcpServerUrl: MCP_SERVER_URL,
    timestamp: Date.now(),
  });

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

async function connectToMcp() {
  if (isConnected) {
    return;
  }

  await mcpClient.connect({
    type: 'httpStream',
    url: MCP_SERVER_URL,
  });

  isConnected = true;
  broadcastStatus();
}

async function disconnectFromMcp() {
  if (!isConnected) {
    return;
  }

  await mcpClient.close();
  isConnected = false;
  broadcastStatus();
}

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'mcp_status',
      connected: isConnected,
      mcpServerUrl: MCP_SERVER_URL,
      timestamp: Date.now(),
    })
  );
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mcpConnected: isConnected,
    mcpServerUrl: MCP_SERVER_URL,
  });
});

// ---------------------------------------------------------------------------
// White Matter Brain Chart — normative centile scoring (/align)
// Scores each patient's tract-metric value against the lifespan normative model
// in example_centiles.csv. The model stores 3 quantiles per age x sex
// (2.5 / 50 / 97.5 percentile), so the centile is computed via a Gaussian
// approximation: mean = p50, sd = (p97.5 - p2.5) / (2 * 1.96).
// Request:  { csv_text, tract, metric }
// Response: { scores: [{ centile_score }] }  (one entry per patient row, in order)
// ---------------------------------------------------------------------------
const WM_CENTILES_PATH = process.env.WM_CENTILES_PATH ||
  path.join(__dirname, '..', 'public', 'data', 'example_centiles.csv');

let _wmCentilesCache = null;
function loadWmCentiles() {
  if (_wmCentilesCache) return _wmCentilesCache;
  const text = fs.readFileSync(WM_CENTILES_PATH, 'utf8');
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const ageCol = idx['ages'] !== undefined ? idx['ages'] : idx['age'];
  const rows = lines.slice(1).map(l => l.split(','));
  const ages = rows.map(r => parseFloat(r[ageCol]));
  _wmCentilesCache = { idx, rows, ages };
  return _wmCentilesCache;
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26)
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// Linear-interpolate a centile column at a given age (ages need not be sorted)
function interpAtAge(model, colName, age) {
  const ci = model.idx[colName];
  if (ci === undefined) return null;
  const { rows, ages } = model;
  let lo = -1, hi = -1;
  for (let i = 0; i < ages.length; i++) {
    const a = ages[i];
    if (!Number.isFinite(a)) continue;
    if (a <= age && (lo === -1 || a > ages[lo])) lo = i;
    if (a >= age && (hi === -1 || a < ages[hi])) hi = i;
  }
  if (lo === -1) lo = hi;
  if (hi === -1) hi = lo;
  if (lo === -1) return null;
  const vlo = parseFloat(rows[lo][ci]);
  const vhi = parseFloat(rows[hi][ci]);
  if (!Number.isFinite(vlo) || !Number.isFinite(vhi)) return null;
  if (lo === hi || ages[lo] === ages[hi]) return vlo;
  const f = (age - ages[lo]) / (ages[hi] - ages[lo]);
  return vlo + f * (vhi - vlo);
}

function normalizeSex(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === '1') return 'male';
  if (s === 'female' || s === 'f' || s === '0' || s === '2') return 'female';
  return 'male'; // default when sex is missing/unknown
}

app.post('/align', (req, res) => {
  try {
    const { csv_text, tract, metric } = req.body || {};
    if (!csv_text || !tract || !metric) {
      return res.status(400).json({ error: 'Missing required field(s): csv_text, tract, metric.' });
    }

    let model;
    try {
      model = loadWmCentiles();
    } catch (e) {
      return res.status(500).json({ error: `Normative centile data unavailable: ${e.message}` });
    }

    const plines = String(csv_text).trim().split('\n').filter(l => l.trim());
    if (plines.length < 2) return res.json({ scores: [] });
    const phead = plines[0].split(',').map(h => h.trim());
    const ageIdx = phead.findIndex(h => ['age', 'ages'].includes(h.toLowerCase()));
    const sexIdx = phead.findIndex(h => h.toLowerCase() === 'sex');
    const valCol = `${tract}-${metric}`;
    const valIdx = phead.indexOf(valCol);
    if (ageIdx === -1) return res.status(400).json({ error: 'Patient CSV is missing an "age" column.' });
    if (valIdx === -1) return res.status(400).json({ error: `Patient CSV is missing the "${valCol}" column.` });

    const Z = 2 * 1.959963985; // 97.5th - 2.5th spans 2 * 1.96 sd under normality

    const scores = plines.slice(1).map(line => {
      const vals = line.split(',');
      const age = parseFloat(vals[ageIdx]);
      const value = parseFloat(vals[valIdx]);
      if (!Number.isFinite(age) || !Number.isFinite(value)) return { centile_score: null };
      const sex = normalizeSex(sexIdx >= 0 ? vals[sexIdx] : '');
      const lo = interpAtAge(model, `${sex}_${valCol}_0.025_centile`, age);
      const mid = interpAtAge(model, `${sex}_${valCol}_0.5_centile`, age);
      const hi = interpAtAge(model, `${sex}_${valCol}_0.975_centile`, age);
      if (lo == null || mid == null || hi == null) return { centile_score: null };
      const sd = (hi - lo) / Z;
      if (!(sd > 0)) return { centile_score: null };
      return { centile_score: normalCdf((value - mid) / sd) };
    });

    return res.json({ scores });
  } catch (err) {
    console.error('/align failed', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function proxyToMcpHttp(req, res) {
  const targetUrl = `${MCP_HTTP_BASE_URL}${req.originalUrl}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const isJson = typeof req.is === 'function' && req.is('application/json');

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? (isJson ? JSON.stringify(req.body || {}) : req) : undefined,
      duplex: hasBody && !isJson ? 'half' : undefined,
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'MCP HTTP proxy failed',
      target: targetUrl,
    });
  }
}

app.post('/upload', proxyToMcpHttp);
app.get('/list_files', proxyToMcpHttp);
app.delete('/delete_file', proxyToMcpHttp);
app.post('/delete_file', proxyToMcpHttp);
app.post('/datasets/register', proxyToMcpHttp);
app.get('/medsam_outputs/*', proxyToMcpHttp);

app.post('/api/mcp/connect', async (_req, res) => {
  try {
    await connectToMcp();
    res.json({ connected: isConnected, mcpServerUrl: MCP_SERVER_URL });
  } catch (error) {
    isConnected = false;
    broadcastStatus();
    res.status(500).json({
      error: error instanceof Error ? error.message : 'MCP connection failed',
    });
  }
});

app.post('/api/mcp/disconnect', async (_req, res) => {
  try {
    await disconnectFromMcp();
    res.json({ connected: isConnected });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'MCP disconnect failed',
    });
  }
});

app.get('/api/mcp/tools', async (_req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({ error: 'MCP server not connected' });
    }
    const tools = await mcpClient.getAllTools();
    return res.json({ tools });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list tools',
    });
  }
});

app.post('/api/mcp/call', async (req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({ error: 'MCP server not connected' });
    }

    const { name, args } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const result = await mcpClient.callTool({
      name,
      arguments: args || {},
    });

    return res.json({ result });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Tool call failed',
    });
  }
});

async function shutdown() {
  try {
    await disconnectFromMcp();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] MCP target: ${MCP_SERVER_URL}`);
  console.log(`[backend] MCP HTTP proxy target: ${MCP_HTTP_BASE_URL}`);
});
