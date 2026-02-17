<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Run Locally

`cd neuroagent_-multi-agent-neuroimaging-analysis`

1. Install dependencies:
   `npm install`
2. Set SSH tunnel to Ollama:11434 and MCP:8010.
3. Run UI:
   `npm run dev`
4. Run backend at 8787: `node backend/server.mjs`
5. Go to validator branch, run MCP server: `uvicorn mcp_server:http_app --host 0.0.0.0 --port 8010`
6. Build SSH tunnel for above ports.

## Runtime Architecture

```
Browser UI
↓ HTTP / WebSocket
Node backend (`backend/server.mjs`)
↓ MCP
MCP Server(s)
```

## TODO list

- Connect to MCP file system
- Connect to MCP tool visualization (see `frontend-card/frontend`)

## Optional Environment Variables

- `MCP_SERVER_URL` (default: `http://localhost:8010/mcp`) - MCP endpoint for backend.
- `FRONTEND_ORIGIN` (default: `*`) - CORS origin for backend.
- `NODE_BACKEND_URL` (default: `http://localhost:8787`) - browser app target backend URL.
- `OLLAMA_URL` (default: `http://127.0.0.1:11434`)
