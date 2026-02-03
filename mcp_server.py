from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
import numpy as np
import json
import sys
import io
from contextlib import contextmanager
from tools import (
    tool_cfc_wavelet,
    tool_hub_detection,
    tool_normative_analysis,
    AnalysisConfig,
    load_bolds_from_csv,
    load_curve_data,
)

@contextmanager
def capture_output():
    """Context manager to capture stdout."""
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield sys.stdout
    finally:
        sys.stdout = old_stdout

server = FastMCP('Brain Network Analysis Server',
                 host='yukon.acm.unc.edu', port=8010)


@server.tool(name="run_cfc_wavelet_analysis")
def run_cfc_wavelet_analysis(
    data_path: str = "data_example_BOLD.csv",
    window_size: int = 50,
    step_size: int = 3,
    padding: bool = True,
    ratio: float = 0.8,
    wavelets_num: int = 10,
    beta: float = 1.0,
    gamma: float = 0.005,
    max_iter: int = 100,
    node_select: int = 10,
) -> dict:
    """
    Run cross-frequency coupling (CFC) analysis using harmonic wavelets.
    Returns CFC matrices for each window with progress tracking.
    """
    config = AnalysisConfig()
    config.ratio = ratio
    config.wavelets_num = wavelets_num
    config.beta = beta
    config.gamma = gamma
    config.max_iter = max_iter
    config.node_select = node_select
    
    progress_log = []
    captured_output = []
    
    try:
        progress_log.append({"step": "loading", "message": f"Loading BOLD data from {data_path}"})
        with capture_output() as output:
            bolds = load_bolds_from_csv(data_path, window_size=window_size, step_size=step_size, padding=padding)
        captured_output.append(output.getvalue())
        num_windows = bolds.shape[0]
        progress_log.append({"step": "loaded", "message": f"Data loaded successfully: shape {list(bolds.shape)}"})
        
        progress_log.append({"step": "analyzing", "message": f"Starting CFC analysis on {num_windows} windows"})
        with capture_output() as output:
            cfcs = tool_cfc_wavelet(bolds, config)
        captured_output.append(output.getvalue())
        progress_log.append({"step": "analyzed", "message": f"CFC analysis complete: {len(cfcs)} windows processed"})
        
        return {
            "status": "success",
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "num_windows": num_windows,
            "shape": list(bolds.shape),
            "cfcs_count": len(cfcs),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except Exception as e:
        progress_log.append({"step": "error", "message": str(e)})
        return {
            "status": "error",
            "data_path": data_path,
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }


@server.tool(name="run_hub_detection")
def run_hub_detection(
    data_path: str = "data_example_BOLD.csv",
    window_size: int = 50,
    step_size: int = 3,
    padding: bool = True,
    ratio: float = 0.8,
    k: int = 2,
    hub_num: int = 10,
    use_group: bool = False,
) -> dict:
    """
    Detect hub nodes in brain networks using graph analysis.
    Returns hub detection results for each window or grouped analysis with progress tracking.
    """
    config = AnalysisConfig()
    config.ratio = ratio
    config.k = k
    config.hub_num = hub_num
    config.use_group = use_group
    
    progress_log = []
    captured_output = []
    
    try:
        progress_log.append({"step": "loading", "message": f"Loading BOLD data from {data_path}"})
        with capture_output() as output:
            bolds = load_bolds_from_csv(data_path, window_size=window_size, step_size=step_size, padding=padding)
        captured_output.append(output.getvalue())
        num_windows = bolds.shape[0]
        progress_log.append({"step": "loaded", "message": f"Data loaded successfully: shape {list(bolds.shape)}"})
        
        progress_log.append({"step": "detecting", "message": f"Starting hub detection on {num_windows} windows (k={k}, hub_num={hub_num}, use_group={use_group})"})
        with capture_output() as output:
            results = tool_hub_detection(bolds, config)
        captured_output.append(output.getvalue())
        progress_log.append({"step": "detected", "message": f"Hub detection complete"})
        
        return {
            "status": "success",
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "num_windows": num_windows,
            "shape": list(bolds.shape),
            "k": k,
            "hub_num": hub_num,
            "use_group": use_group,
            "results": results,
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except Exception as e:
        progress_log.append({"step": "error", "message": str(e)})
        return {
            "status": "error",
            "data_path": data_path,
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }


@server.tool(name="get_growth_curve")
def get_growth_curve(phenotype: str) -> dict:
    """
    Load growth curve data for a given phenotype.
    Available phenotypes:
    - Global mean of FC
    - Global system segregation
    - Visual system segregation (VIS)
    - Somatomotor system segregation (SM)
    - Dorsal attention system segregation (DA)
    - Ventral attention system segregation (VA)
    - Limbic system segregation (LIM)
    - Frontoparietal system segregation (FP)
    - Default mode system segregation (DM)
    """
    try:
        data = load_curve_data(phenotype)
        return {
            "status": "success",
            "phenotype": phenotype,
            "data": data,
        }
    except Exception as e:
        return {
            "status": "error",
            "phenotype": phenotype,
            "error": str(e),
        }


@server.tool(name="run_normative_analysis")
def run_normative_analysis(
    x_phenotype: str,
    y_path: str,
    age_col: str,
    val_col: str,
) -> dict:
    """
    Run normative analysis comparing growth curves with overlay data.
    Returns combined x and y data for normative modeling.
    """
    try:
        config = AnalysisConfig()
        config.x_phenotype = x_phenotype
        config.y_path = y_path
        config.age_col = age_col
        config.val_col = val_col
        
        results = tool_normative_analysis(config)
        return {
            "status": "success",
            "phenotype": x_phenotype,
            "data": results,
        }
    except Exception as e:
        return {
            "status": "error",
            "phenotype": x_phenotype,
            "error": str(e),
        }


@server.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> PlainTextResponse:
    return PlainTextResponse("OK")


@server.custom_route("/run_cfc_wavelet_analysis", methods=["POST"])
async def http_run_cfc_wavelet_analysis(request: Request) -> JSONResponse:
    data = await request.json()
    result = run_cfc_wavelet_analysis(
        data_path=data.get("data_path", "data_example_BOLD.csv"),
        window_size=data.get("window_size", 50),
        step_size=data.get("step_size", 3),
        padding=data.get("padding", True),
        ratio=data.get("ratio", 0.8),
        wavelets_num=data.get("wavelets_num", 10),
        beta=data.get("beta", 1.0),
        gamma=data.get("gamma", 0.005),
        max_iter=data.get("max_iter", 100),
        node_select=data.get("node_select", 10),
    )
    return JSONResponse(result)


@server.custom_route("/run_hub_detection", methods=["POST"])
async def http_run_hub_detection(request: Request) -> JSONResponse:
    data = await request.json()
    result = run_hub_detection(
        data_path=data.get("data_path", "data_example_BOLD.csv"),
        window_size=data.get("window_size", 50),
        step_size=data.get("step_size", 3),
        padding=data.get("padding", True),
        ratio=data.get("ratio", 0.8),
        k=data.get("k", 2),
        hub_num=data.get("hub_num", 10),
        use_group=data.get("use_group", False),
    )
    return JSONResponse(result)


@server.custom_route("/get_growth_curve", methods=["POST"])
async def http_get_growth_curve(request: Request) -> JSONResponse:
    data = await request.json()
    result = get_growth_curve(phenotype=data.get("phenotype", "Global mean of FC"))
    return JSONResponse(result)


@server.custom_route("/run_normative_analysis", methods=["POST"])
async def http_run_normative_analysis(request: Request) -> JSONResponse:
    data = await request.json()
    result = run_normative_analysis(
        x_phenotype=data.get("x_phenotype", "Global mean of FC"),
        y_path=data.get("y_path", ""),
        age_col=data.get("age_col", ""),
        val_col=data.get("val_col", ""),
    )
    return JSONResponse(result)


if __name__ == "__main__":
    server.run(transport="streamable-http", mount_path='/ram/USERS/ziquanw/brain-network-chart/uploaded_files') 
    