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

- ~~Connect to MCP file system~~
- ~~Explicitly call normative aging curves if data has age column~~
- Debug FDR correction tool: `Input should be a valid list [type=list_type, input_value='[6.913e-1]', input_type=str]`
- Debug Executor: Tool calling order is the opposite to the response.
- ~~Connect to MCP tool visualization (see `frontend-card/frontend`)~~
- Improve the connection to MCP tool visualization (current only support AGING_CURVE/NORMATIVE_MODEL)
- Four demos:
   - CT and IQ group comparison in terms of diagnosis
   - Spectral cluster: feature=[list of regional CT], y=IQ
   - Linear regression: x=CT, y=IQ, hue=Diagnosis

## Optional Environment Variables

- `MCP_SERVER_URL` (default: `http://localhost:8010/mcp`) - MCP endpoint for backend.
- `FRONTEND_ORIGIN` (default: `*`) - CORS origin for backend.
- `NODE_BACKEND_URL` (default: `http://localhost:8787`) - browser app target backend URL.
- `OLLAMA_URL` (default: `http://127.0.0.1:11434`)
