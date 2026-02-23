import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { MCPClient } from 'mcp-client';

const PORT = Number(process.env.PORT || 8789);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8010/mcp';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

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
});