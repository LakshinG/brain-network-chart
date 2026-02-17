<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1HKxVqzBdtK2ww98ZaHFi47cLi_atzBaC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set SSH tunnel to Ollama:11434 and MCP:8010.
3. Run backend + browser UI together:
   `npm run dev:all`

Or run backend separately: `node backend/server.mjs`

If you prefer separate terminals:
- Terminal 1: `npm run backend`
- Terminal 2: `npm run dev`

## Runtime Architecture

Browser UI
↓ HTTP / WebSocket
Node backend (`backend/server.mjs`)
↓ MCP
MCP Server(s)

## Optional Environment Variables

- `PORT` (default: `8787`) - Node backend port.
- `MCP_SERVER_URL` (default: `http://localhost:8010/mcp`) - MCP endpoint for backend.
- `FRONTEND_ORIGIN` (default: `*`) - CORS origin for backend.
- `VITE_NODE_BACKEND_URL` (default: `http://localhost:8787`) - browser app target backend URL.
