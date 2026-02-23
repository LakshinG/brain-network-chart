# CyberNeuro platform: Chat with Your Neuroimaging Data

## Frontend
- `cd cyberneuro_multi-agent-neuroimaging-analysis`
- Install dependencies: `npm install`
- Run or proxy Ollama service via `localhost:11434`, or change the Ollama URL in `services/ollamaService.ts`.
- Run UI: `npm run dev`

## GitHub Pages runtime setup (Ollama + MCP)

When the frontend is hosted at `https://acmlab.github.io/brain-network-chart/`, the browser still calls local services by default:

- Ollama: `http://127.0.0.1:11434` (from `services/ollamaService.ts`)
- Node MCP backend: `http://localhost:8789` (from `services/mcpService.ts`)
- MCP HTTP API: `http://localhost:8010` (from `services/mcpService.ts`)

This means each user running the GitHub Page must run local Ollama + backend + MCP server, unless you change those URLs.

### 1) Start Ollama with GitHub Pages origin allowed

1. Install [Ollama](https://ollama.com/).
2. `ollama pull dcarrascosa/medgemma-1.5-4b-it:F16`. 
3. `ollama pull qwen3:latest`. Or pull any general model you like.

**On Windows (PowerShell):**

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://acmlab.github.io,http://localhost:8000,http://127.0.0.1:8000", "User")
```

Then restart Ollama (quit and reopen the app), and verify:

```powershell
curl http://127.0.0.1:11434/api/tags
```

**On Linux (`systemd`):**

```bash
sudo systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=https://acmlab.github.io,http://localhost:8000,http://127.0.0.1:8000"
```

Then apply:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
curl http://127.0.0.1:11434/api/tags
```

**If you want to chat with your brain network, run the MCP server containing available tools:**
### 2) (Optional) Start MCP server on port 8010

```bash
cd mcp_server
uv sync
uvicorn mcp_server:http_app --host 0.0.0.0 --port 8010
```

### 3) Start Node MCP backend on port 8789

In a new terminal:

```bash
cd cyberneuro_multi-agent-neuroimaging-analysis
FRONTEND_ORIGIN=https://acmlab.github.io PORT=8789 MCP_SERVER_URL=http://localhost:8010/mcp node backend/server.mjs
```

### 4) Open GitHub Page

- `https://acmlab.github.io/brain-network-chart/`
- Expected status lights in UI: `Ollama` green, `MCP` green

If either is red, verify ports `11434`, `8010`, `8789` and environment variables above.

## Runtime Architecture

```
Browser UI and agents API
↓ HTTP / WebSocket
Node backend (`backend/server.mjs`)
↓ MCP
MCP Server(s)
```

## Example data
See `uploaded_files`

## Robustness test
Details refer to `a2a-server/README_ROBUSTNESS_TEST.md`

**Confusion Matrix**
```
                 Predicted Positive    Predicted Negative
                 (Researcher Called)   (Researcher Skipped)
Actual Positive  True Positive (TP)    False Negative (FN)
(Should Call)    162                   13

Actual Negative  False Positive (FP)   True Negative (TN)
(Shouldn't Call) 6                     293
```

**Metrics:**
- **Precision** = TP/(TP+FP) = 162/(162+6) = 96.4%
- **Recall** = TP/(TP+FN) = 162/(162+13) = 92.6%
- **Accuracy** = (TP+TN)/(Total) = (162+293)/500 = 91.0%

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

## TODO list

- ~~Connect to MCP file system~~
- ~~Explicitly call normative aging curves if data has age column~~
- Debug FDR correction tool: `ERROR: Input should be a valid list [type=list_type, input_value='[6.913e-1]', input_type=str]`
- ~~Debug Executor: Tool calling order is the opposite to the response.~~
- ~~Connect to MCP tool visualization (see `frontend-card/frontend`)~~
- ~~Increase efficiency by adding a switch to disable planValidator agent.~~
- ~~Add overlay to aging curve.~~
- ~~Test spectral clustering~~
- ~~Test stratifying dataset by a grouping column.~~
- ~~Add linear regression using SVM~~
- ~~Merge visualizer agent by Xiyun for other MCP tool visualization.~~
- Merge chat area in frontend-with-ts.
- ~~Improve Proposal Reporter prompt, focusin gon statistical results.~~
- ~~Three demos questions:~~
   - ~~Correlation between Global Cortical Thickness (CT) and IQ (sb_abiq_ss column) grouping by mental health status (FinalDiagnosis column) to see if disease changes the correlation.~~
   - ~~Brain chart of CT.~~
   - ~~Spectral cluster: feature columns are [list of regional Cortical Thickness], target column is sb_abiq_ss~~

## Scripts:
   - Study on correlation between Global Cortical Thickness (CT) and IQ (sb_abiq_ss column) grouping by mental health status (FinalDiagnosis column) to see if disease changes the correlation.
   - Overlay global cortical thickness on top of the aging curve.
   - Clustering samples into k=3 clusters given their regional Cortical Thickness (CT). Then overlay average cortical thickness in global CT on top of the aging curve. 
