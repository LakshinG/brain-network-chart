# CyberNeuro platform: Chat with Your Neuroimaging Data
Go to https://acmlab.github.io/brain-network-chart/

## Examples:
1. Click on `Demo` button.
2. Type: Study on the correlation between Amyloid_lS_orbital_med and Tau_Global grouping by DX.
3. Click on the visualization card to enter editing mode. Type: Change dot color to red.
4. Click on download button to get SVG of the plot.
5. Type: Clustering samples into k=3 clusters given their regional Amyloid. 

## Requirements

The minimal requirement through above github page is Ollama.

1. Install [Ollama](https://ollama.com/).
2. `ollama pull dcarrascosa/medgemma-1.5-4b-it:F16`. 
3. `ollama pull gpt-oss:20b-cloud`. Or pull any general model you like.

**Setup on Windows (PowerShell):**

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://acmlab.github.io,http://localhost:8000,http://127.0.0.1:8000", "User")
```

Then restart Ollama (quit and reopen the app).

**Setup on Linux (`systemd`):**

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

## GitHub Pages runtime setup (Ollama + MCP)

When the frontend is hosted at `https://acmlab.github.io/brain-network-chart/`, the browser still calls local services by default:

- Ollama: `http://127.0.0.1:11434` (from `services/ollamaService.ts`)
- Node MCP backend: `http://localhost:8789` (from `services/mcpService.ts`)
- MCP HTTP API: `http://localhost:8010` (from `services/mcpService.ts`)

This means each user running the GitHub Page must run local Ollama + backend + MCP server, unless you change those URLs.

**If you want to chat with your brain network, run the MCP server containing available tools:**
### 1) (Optional) Start MCP server on port 8010

```bash
cd mcp_server
uv sync
uvicorn mcp_server:http_app --host 0.0.0.0 --port 8010
```

### 2) (Optional) Start Node MCP backend on port 8789

In a new terminal:

```bash
cd cyberneuro_multi-agent-neuroimaging-analysis
FRONTEND_ORIGIN=https://acmlab.github.io PORT=8789 MCP_SERVER_URL=http://localhost:8010/mcp node backend/server.mjs
```

### 2) Open GitHub Page

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

Note on metric differences: the 93.6% figure is the end-to-end biomarker pipeline success rate (full pipeline completion + validator pass), while the 95.8% figure below is the researcher-trigger decision accuracy in the robustness test. These measure different tasks on different datasets, so the values are not expected to match.

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

