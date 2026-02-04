# Brain Network Analysis Server

A Model Context Protocol (MCP) server for brain network analysis using advanced signal processing and graph-based hub detection. Includes tools for cross-frequency coupling (CFC) analysis, hub detection in single and multiple networks, and normative developmental trajectory analysis.

## Features

### Core Analysis Tools

- **Cross-Frequency Coupling (CFC) Wavelet Analysis**: Compute harmonic wavelets from brain network adjacency matrices with iterative optimization and error tracking
- **Hub Detection**: Identify critical hub nodes in brain networks using:
  - Single-network analysis via spectral embedding
  - Multi-network analysis via Grassmann manifold optimization
- **Normative Analysis**: Analyze developmental trajectories and generate normative curves for brain metrics
- **Data Loading**: Read brain activity data from CSV files with sliding window extraction

### Server Architecture

- **HTTP REST API**: FastMCP-based server running on `yukon.acm.unc.edu:8010`
- **Progress Streaming**: Real-time console output and progress logging from server to client
- **Timestamped Logging**: All operations include millisecond-precision timestamps for debugging
- **Async-Ready**: Built on Starlette for handling concurrent requests

## Installation

### Requirements
- Python 3.11+
- Dependencies listed in `pyproject.toml`

### Setup

```bash
# Clone repository
git clone <repository-url>
cd brain-network-chart

# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
# Or with uv:
uv sync
```

### Dependencies

- `numpy`: Numerical computations
- `scipy`: Scientific computing (linear algebra, optimization)
- `pandas`: Data loading and manipulation
- `h5py`: HDF5 file I/O for MATLAB v7.3 files
- `pydantic-ai`: MCP framework
- `starlette`: Web framework for HTTP endpoints
- `requests`: HTTP client for MCP client

## Project Structure

```
brain-network-chart/
├── mcp_server.py              # MCP server with HTTP endpoints
├── mcp_client.py              # Client for communicating with server
├── tools.py                   # High-level analysis functions
├── wavelets.py                # CFC wavelet computation
├── hub_detection.py           # Hub detection algorithms
├── utils.py                   # Utility functions (correlation, thresholding)
├── pyproject.toml             # Project configuration
└── README.md                  # This file
```

## Usage

### Starting the Server

```bash
python mcp_server.py
```

The server will start on `http://yukon.acm.unc.edu:8010` and be ready to accept tool invocations.

## HTTP API Quick Start (Agent Designers)

This MCP server exposes a plain HTTP JSON API. The base URL is `http://yukon.acm.unc.edu:8010`.

Authentication: the server code does not enforce auth today. Clients may still send an `Authorization: Bearer <token>` header, but it is currently ignored.

Rate limiting: 10 requests per 60 seconds per client IP.

Use `GET /api/schema` to fetch the live JSON schema for all endpoints.

### Typical Call Flow

1. Upload your CSV file with `POST /upload` (multipart form field named `file`).
2. Call an analysis endpoint with `data_path` set to the uploaded filename returned from step 1.

File resolution: `data_path` and `y_path` are resolved by checking the upload directory first, then the server working directory, then absolute paths if provided.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/api/schema` | API schema for agents |
| POST | `/run_cfc_wavelet_analysis` | Cross-frequency coupling wavelet analysis |
| POST | `/run_hub_detection` | Hub detection in brain networks |
| POST | `/get_growth_curve` | Load growth curve data |
| POST | `/run_normative_analysis` | Normative analysis with overlay data |
| POST | `/upload` | Upload CSV file (multipart) |
| GET | `/list_files` | List uploaded files |
| DELETE or POST | `/delete_file` | Delete uploaded file |

### Request Payloads

#### `POST /run_cfc_wavelet_analysis`

```json
{
  "data_path": "data_example_BOLD.csv",
  "window_size": 100,
  "step_size": 90,
  "padding": true,
  "ratio": 0.8,
  "wavelets_num": 10,
  "beta": 1.0,
  "gamma": 0.005,
  "max_iter": 100,
  "node_select": 10
}
```

#### `POST /run_hub_detection`

```json
{
  "data_path": "data_example_BOLD.csv",
  "window_size": 100,
  "step_size": 90,
  "padding": true,
  "ratio": 0.8,
  "k": 2,
  "hub_num": 10,
  "use_group": false
}
```

#### `POST /get_growth_curve`

```json
{
  "phenotype": "Global mean of FC"
}
```

Valid phenotypes:
`Global mean of FC`, `Global system segregation`, `Visual system segregation (VIS)`, `Somatomotor system segregation (SM)`, `Dorsal attention system segregation (DA)`, `Ventral attention system segregation (VA)`, `Limbic system segregation (LIM)`, `Frontoparietal system segregation (FP)`, `Default mode system segregation (DM)`.

#### `POST /run_normative_analysis`

```json
{
  "x_phenotype": "Global mean of FC",
  "y_path": "my_overlay.csv",
  "age_col": "age",
  "val_col": "value"
}
```

#### `POST /upload` (multipart form)

Field name must be `file`. Example:

```bash
curl -X POST http://yukon.acm.unc.edu:8010/upload \
  -F "file=@/path/to/data.csv"
```

#### `GET /list_files`

Returns uploaded filenames with sizes and timestamps.

#### `DELETE /delete_file`

```json
{
  "filename": "data.csv"
}
```

### Example: Upload Then Analyze

```bash
curl -X POST http://yukon.acm.unc.edu:8010/upload \
  -F "file=@/path/to/data_example_BOLD.csv"

curl -X POST http://yukon.acm.unc.edu:8010/run_hub_detection \
  -H "Content-Type: application/json" \
  -d '{
    "data_path": "data_example_BOLD.csv",
    "window_size": 100,
    "step_size": 90,
    "padding": true,
    "ratio": 0.8,
    "k": 2,
    "hub_num": 10,
    "use_group": false
  }'
```

### Using the Client

```bash
python mcp_client.py
```

This runs example analyses and displays results with:
- Server console output (timestamps and progress)
- Progress logs with step information
- Analysis results (hub nodes, wavelets, etc.)

### Using the Intelligent Agent Client

For automated tool selection and intelligent analysis, use the **agent client** which leverages an LLM (Ollama) to decide which analysis to run based on natural language goals.

#### Setup

```bash
# Install agent dependencies
pip install ollama requests pydantic

# Set environment variables
export MCP_API_KEY='your-api-key'
export OLLAMA_HOST='http://yukon.acm.unc.edu:11434'
```

#### Basic Usage

```python
from agent_client import BrainNetworkAgent, OllamaLLM

# Initialize agent
llm = OllamaLLM(host='http://yukon.acm.unc.edu:11434', model='MedAIBase/MedGemma1.5:4b')
agent = BrainNetworkAgent(llm=llm)

# Give the agent a goal in natural language
response = agent.execute("Analyze the cross-frequency coupling in my BOLD data")

# Access results
print(response.summary)  # Human-readable interpretation
print(response.state.results)  # Raw analysis data
```

#### Interactive Mode

```bash
python agent_client.py
```

The agent enters interactive mode where you can ask questions like:
- "I want to analyze cross-frequency coupling in my brain connectivity data"
- "Find the hub nodes in my brain network"
- "Show me the typical developmental trajectory for brain connectivity"
- "Upload my data and run a hub detection analysis"

#### How the Agent Works

The agent follows a 3-step execution pipeline:

1. **Tool Selection (LLM Reasoning)**: 
   - Analyzes your natural language goal
   - Decides which MCP tool to use (CFC, Hub Detection, Growth Curve, Normative Analysis)
   - Extracts parameters from context

2. **Tool Execution**:
   - Invokes the chosen MCP server tool via HTTP
   - Monitors execution status and collects results
   - Returns raw analysis output

3. **Result Interpretation**:
   - Uses LLM to explain findings in human-readable language
   - Provides insights about what the results mean
   - Generates actionable recommendations

#### Agent Architecture

**OllamaLLM Class**: Wraps Ollama LLM for reasoning
- `decide_tool(goal)`: Determines which analysis to run
- `interpret_results(tool_name, results)`: Explains analysis findings
- `generate_text(prompt, system, max_tokens)`: Raw LLM queries

**MCPClient Class**: HTTP client for MCP server
- `run_cfc_wavelet_analysis()`: CFC analysis
- `run_hub_detection()`: Hub detection
- `get_growth_curve()`: Growth curve data
- `run_normative_analysis()`: Normative analysis

**BrainNetworkAgent Class**: Main orchestrator
- `execute(user_goal)`: Full 3-step pipeline
- Returns `AgentResponse` with results and interpretations

#### Example: Building a Custom Agent

```python
from agent_client import BrainNetworkAgent, OllamaLLM, MCPClient

# Initialize components
llm = OllamaLLM(
    host='http://yukon.acm.unc.edu:11434',
    model='MedAIBase/MedGemma1.5:4b'
)
mcp_client = MCPClient(base_url='http://yukon.acm.unc.edu:8010')

# Create agent
agent = BrainNetworkAgent(llm=llm, mcp_client=mcp_client)

# Execute analysis goals
goals = [
    "Analyze CFC patterns with window size 120",
    "Find hubs with k=3 parameters",
    "Compare developmental trajectories",
]

for goal in goals:
    response = agent.execute(goal)
    if response.success:
        print(f"✓ {goal}")
        print(f"  Result: {response.summary}")
    else:
        print(f"✗ {goal}")
        print(f"  Error: {response.state.error_messages}")
```

#### File Upload Integration

The server supports file upload via `POST /upload` with a multipart `file` field. The agent client does not include a built-in helper for this, so use `requests` or curl and then pass the uploaded filename in `data_path` or `y_path`.

See [FILE_UPLOAD_GUIDE.md](FILE_UPLOAD_GUIDE.md) for detailed file upload instructions.

#### Pydantic Models

The agent uses Pydantic for type-safe data handling:

- **AnalysisType**: Enum of available tools (CFC_WAVELET, HUB_DETECTION, GROWTH_CURVE, NORMATIVE)
- **ToolCall**: LLM decision with tool name, reasoning, and parameters
- **AgentState**: Execution state including goals, reasoning, results, and errors
- **AgentResponse**: Final response with summary, recommendations, and success status

#### Error Handling

The agent handles common errors gracefully:

```python
response = agent.execute("Analyze missing_file.csv")

if not response.success:
    print(f"Execution failed: {response.state.error_messages}")
    # Errors logged but execution continues
    
# All responses include state for inspection
print(f"LLM reasoning: {response.state.llm_reasoning}")
print(f"Tool attempted: {response.state.tool_calls[0].tool_name}")
```

### Available Tools

#### 1. CFC Wavelet Analysis
Computes cross-frequency coupling using harmonic wavelets on sliding windows of brain connectivity data.

**Parameters:** `data_path`, `window_size`, `step_size`, `padding`, `ratio`, `wavelets_num`, `beta`, `gamma`, `max_iter`, `node_select`.

**Output:**
```json
{
  "status": "success",
  "timestamp": "2026-02-04T12:00:00.000000",
  "data_path": "data_example_BOLD.csv",
  "num_windows": 42,
  "shape": [42, 200, 100],
  "cfcs_count": 42,
  "console_output": "[14:32:51.247] [CFC] Computing wavelets...",
  "progress": [...]
}
```

#### 2. Hub Detection
Identifies hub nodes in single or multiple brain networks.

**Parameters:** `data_path`, `window_size`, `step_size`, `padding`, `ratio`, `k`, `hub_num`, `use_group`.

**Output:**
```json
{
  "status": "success",
  "timestamp": "2026-02-04T12:00:00.000000",
  "data_path": "data_example_BOLD.csv",
  "num_windows": 42,
  "shape": [42, 200, 100],
  "k": 2,
  "hub_num": 10,
  "use_group": false,
  "results": { "method": "individual", "results": [...] },
  "console_output": "[14:32:52.156] [HUBDET] Starting hub detection...",
  "progress": [...]
}
```

#### 3. Normative Analysis
Analyzes developmental trajectories and generates normative curves.

**Parameters:** `x_phenotype`, `y_path`, `age_col`, `val_col`.

**Output:**
```json
{
  "status": "success",
  "timestamp": "2026-02-04T12:00:00.000000",
  "phenotype": "Global mean of FC",
  "y_path": "my_overlay.csv",
  "data": {
    "X": [...],
    "centiles": [...],
    "age": [...],
    "values": [...]
  }
}
```

## Data Format

### BOLD Time Series (CSV)

```csv
Region_1,Region_2,Region_3,...,Region_N
0.234,0.156,0.892,...,-0.123
-0.456,0.789,0.234,...,0.567
...
```

- **Rows**: Time points (BOLD volumes)
- **Columns**: Brain regions or nodes
- Columns named "Unnamed" or non-numeric values are automatically filtered
- If you use the default `data_path` (`data_example_BOLD.csv`), place the file in the server working directory or upload it first.

### Growth Curve Data (CSV)

```csv
age,metric_value
1,45.2
2,48.5
3,51.3
...
```

Used as overlay data for normative analysis. The server expects `age_col` and `val_col` columns in the overlay CSV and converts ages from months to years by dividing by 12.
If you use the agent client's default `y_path` (`data_example_BrainChart.csv`), place the file in the server working directory or upload it first.

## API Endpoints

See "HTTP API Quick Start (Agent Designers)" above for the full, current endpoint list and payloads. `GET /api/schema` returns a live JSON schema.

## Example: Direct API Call

```bash
curl -X POST http://yukon.acm.unc.edu:8010/run_hub_detection \
  -H "Content-Type: application/json" \
  -d '{
    "data_path": "data_example_BOLD.csv",
    "window_size": 100,
    "step_size": 90,
    "padding": true,
    "ratio": 0.8,
    "k": 2,
    "hub_num": 5,
    "use_group": false
  }'
```

## Logging and Debugging

All operations include timestamped logging for debugging:

```
[14:32:51.247] [CFC] Computing wavelets for 42 windows...
[14:32:51.389] [CFC]   Window 1/42: Computing harmonic wavelets...
[14:32:51.512] [WAVELET] Iteration 5/100: error=0.000123
[14:32:51.634] [CFC]   Window 1/42 complete ✓
```

**Logging Prefixes:**
- `[CFC]`: Cross-frequency coupling analysis
- `[HUB]`: Hub detection results
- `[HUBDET]`: Hub detection algorithm (single network)
- `[HUBGROUP]`: Hub detection algorithm (group/Grassmann manifold)
- `[HUBDETECT]`: Hub detection dispatcher
- `[WAVELET]`: Wavelet computation
- `[LOAD]`: Data loading

## Configuration

Analysis parameters can be customized through the `AnalysisConfig` class in `tools.py`:

```python
class AnalysisConfig():
    # Sliding window parameters
    window: int = 50
    step: int = 3
    padding: bool = True
    
    # CFC analysis parameters
    ratio: float = 0.8          # Edge weight threshold
    wavelets_num: int = 10      # Number of wavelet basis functions
    beta: float = 1.0           # Regularization parameter
    gamma: float = 0.005        # Convergence threshold
    max_iter: int = 100         # Maximum iterations
    
    # Hub detection parameters
    k: int = 2                  # Embedding dimension
    hub_num: int = 10           # Number of hubs
    use_group: bool = False     # Use group method
```

## Troubleshooting

### Server Connection Issues
- Verify server is running: `python mcp_server.py`
- Check network connectivity to `yukon.acm.unc.edu:8010`
- Verify port 8010 is accessible

### Data Loading Errors
- Ensure CSV files are properly formatted with numeric columns
- Check file paths are correct and files exist
- Verify CSV encoding (UTF-8 recommended)

### Analysis Convergence
- If optimization doesn't converge, try:
  - Increasing `max_iter` parameter
  - Adjusting `gamma` or `beta` regularization parameters
  - Using different window sizes for better data stability

## Algorithm Details

### CFC Wavelet Analysis
Uses harmonic wavelet basis functions with iterative optimization to compute cross-frequency coupling in brain networks. The algorithm:
1. Extracts sliding windows from BOLD time series
2. Computes functional connectivity (correlation) for each window
3. Thresholds adjacency matrices based on percentile ratio
4. Fits harmonic wavelets to each adjacency matrix with L-BFGS optimization

### Hub Detection (Single Network)
Spectral embedding approach with sparse selection:
1. Computes graph Laplacian from adjacency matrix
2. Initializes embedding using Laplacian eigenvectors
3. Iteratively optimizes selection matrix via alternating direction method of multipliers (ADMM)
4. Identifies hubs as nodes with zero diagonal in final selection matrix

### Hub Detection (Group/Grassmann Manifold)
Multi-network optimization via differential geometry:
1. Initializes embeddings for each network using spectral methods
2. Optimizes over Grassmann manifold (space of subspaces)
3. Enforces consensus across networks via manifold gradient descent
4. Jointly optimizes embeddings and hub selection across all networks

## Performance Considerations

- **Memory**: CFC analysis stores window-by-window wavelets; large datasets may require windowing
- **Time**: Hub detection iterations scale with network size; optimization converges in 100-500 iterations typically
- **Parallelization**: Can be extended for parallel window processing or multi-network analysis

## Output Files

Results are returned as JSON via HTTP responses. Optional file outputs:
- Console logs streamed to client in real-time

## License

See [LICENSE](LICENSE) file for details.

## References

- Cross-frequency coupling via wavelets: Based on harmonic analysis of network structure
- Hub detection: Graph Laplacian spectral methods and Grassmann manifold optimization
- Normative analysis: Developmental trajectory fitting on growth curve data

## Contributing

Contributions welcome. Please ensure:
- Code follows PEP 8 style guidelines
- New features include logging with timestamps
- Analysis functions return JSON-serializable results

## Support

For issues, questions, or feature requests, please open an issue on the project repository.
