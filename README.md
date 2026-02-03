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
├── data_example_BOLD.csv      # Example brain activity data
├── data_example_BrainChart.csv# Example normative curve data
├── pyproject.toml             # Project configuration
└── README.md                  # This file
```

## Usage

### Starting the Server

```bash
python mcp_server.py
```

The server will start on `http://yukon.acm.unc.edu:8010` and be ready to accept tool invocations.

### Using the Client

```bash
python mcp_client.py
```

This runs example analyses and displays results with:
- Server console output (timestamps and progress)
- Progress logs with step information
- Analysis results (hub nodes, wavelets, etc.)

### Available Tools

#### 1. CFC Wavelet Analysis
Computes cross-frequency coupling using harmonic wavelets on sliding windows of brain connectivity data.

**Parameters:**
- `data_path`: Path to CSV file with BOLD time series
- `window_size`: Size of sliding window (default: 100)
- `step_size`: Step size for sliding window (default: 90)
- `padding`: Whether to pad edges (default: true)
- `ratio`: Edge weight threshold ratio (default: 0.8)
- `wavelets_num`: Number of wavelet basis functions (default: 10)
- `beta`: Regularization parameter (default: 1.0)
- `gamma`: Convergence threshold (default: 0.005)
- `max_iter`: Maximum iterations (default: 100)

**Output:**
```json
{
  "wavelets": [[...], [...], ...],
  "num_windows": 42,
  "console_output": "[14:32:51.247] [CFC] Computing wavelets...",
  "progress": [...]
}
```

#### 2. Hub Detection
Identifies hub nodes in single or multiple brain networks.

**Parameters:**
- `graphs`: List of adjacency matrices (JSON format)
- `k`: Embedding dimension (default: 2)
- `hub`: Number of hubs to identify (default: 10)
- `use_group`: Use group method for multiple networks (default: false)

**Output:**
```json
{
  "method": "individual",
  "results": [
    {
      "graph_index": 0,
      "hub_nodes": [5, 12, 23],
      "embedding": [[...], [...], ...],
      "selection_matrix": [[...], [...], ...]
    }
  ],
  "console_output": "[14:32:52.156] [HUBDET] Starting hub detection...",
  "progress": [...]
}
```

#### 3. Normative Analysis
Analyzes developmental trajectories and generates normative curves.

**Parameters:**
- `age_path`: Path to growth curve data CSV
- `metric_path`: Path to metric data CSV
- `age_col`: Column name for age values
- `val_col`: Column name for metric values
- `y_label`: Label for y-axis

**Output:**
```json
{
  "ages": [1, 2, 3, ...],
  "mean": [value, ...],
  "std": [value, ...],
  "plot_path": "path/to/generated/plot.png"
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

### Growth Curve Data (CSV)

```csv
age,metric_value
1,45.2
2,48.5
3,51.3
...
```

- Used for normative developmental trajectory analysis

## API Endpoints

All endpoints are HTTP POST requests to the server with JSON payloads.

```
POST /run_cfc_wavelet_analysis
POST /run_hub_detection
POST /run_normative_analysis
POST /run_hub_detection_group
```

## Example: Direct API Call

```bash
curl -X POST http://yukon.acm.unc.edu:8010/run_hub_detection \
  -H "Content-Type: application/json" \
  -d '{
    "graphs": [[graph_matrix_1], [graph_matrix_2]],
    "k": 2,
    "hub": 5,
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
- Normative plots saved to `uploaded_files/` directory
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
