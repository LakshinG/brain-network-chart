# CyberNeuro platform: Chat with Your Neuroimaging Data

The release version is for the local deployment for both Frontend, Backend, and LLM service (Ollama). 

**Check [gh-page branch](https://github.com/acmlab/brain-network-chart/tree/gh-page) for an online interactive demo with your own Ollama running locally.**

## Frontend
- `cd cyberneuro_multi-agent-neuroimaging-analysis`
- Install dependencies: `npm install`
- Run or proxy Ollama service via `localhost:11434`, or change the Ollama URL in `services/ollamaService.ts`.
- Run UI: `npm run dev`

## MCP Client
- `cd cyberneuro_multi-agent-neuroimaging-analysis`
- `node backend/server.mjs`, or change the `PORT` parameter in `backend/server.mjs` and `services/mcpService.ts`.

## MCP server
- `cd mcp_server`
- Install dependencies: See `mcp_server/README.md`
- `uvicorn mcp_server:http_app --host 0.0.0.0 --port 8010`. `--port` needs to match the `MCP_SERVER_URL` used in MCP client `cyberneuro_multi-agent-neuroimaging-analysis/backend/server.mjs`

## Runtime Architecture

```
Browser UI and agents API
↓ HTTP / WebSocket
Node backend (`backend/server.mjs`)
↓ MCP
MCP Server(s)
```

## Examples questions:
1. Click on `Demo` button.
2. Type: Study on the correlation between Amyloid_lS_orbital_med and Tau_Global grouping by DX.
3. Click on the visualization card to enter editing mode. Type: Change dot color to red.
4. Click on download button to get SVG of the plot.
5. Type: Clustering samples into k=3 clusters given their regional Amyloid. 

## Example data
See `uploaded_files`

## Robustness test
Details refer to `a2a-server/README_ROBUSTNESS_TEST.md`

Biomarker queries (tabular data):
- Success rate = 93.6%
- Average time per query = 19.33s

**Confusion Matrix**
```
                 Predicted Positive    Predicted Negative
                 (Researcher Called)   (Researcher Skipped)
Actual Positive  True Positive (TP)    False Negative (FN)
(Should Call)    165                   21

Actual Negative  False Positive (FP)   True Negative (TN)
(Shouldn't Call) 0                     314
```

**Metrics:**
- **Precision** = TP/(TP+FP) = 165/(165+0) = 100.0%
- **Recall** = TP/(TP+FN) = 165/(165+21) = 88.7%
- **Accuracy** = (TP+TN)/(Total) = (165+314)/500 = 95.8%

**Tool calling times**

```
✅ connectivity analysis          - 68 queries (13.6%)
✅ network hub identification     - 61 queries (12.2%)
✅ cross-frequency coupling       - 56 queries (11.2%)
✅ functional connectivity        - 56 queries (11.2%)
✅ normative analysis             - 51 queries (10.2%)
✅ wavelet decomposition          - 47 queries (9.4%)
✅ CFC wavelet analysis           - 46 queries (9.2%)
✅ system segregation analysis    - 42 queries (8.4%)
✅ hub detection                  - 38 queries (7.6%)
✅ growth curve modeling          - 35 queries (7.0%)
```

