from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import PlainTextResponse
import numpy as np
import json
from tools import (
    tool_cfc_wavelet,
    tool_hub_detection,
    tool_normative_analysis,
    AnalysisConfig,
    _build_dummy_bolds,
    load_curve_data,
)

server = FastMCP('Brain Network Analysis Server',
                 host='yukon.acm.unc.edu', port=8010)


@server.tool(name="run_cfc_wavelet_analysis")
def run_cfc_wavelet_analysis(
    num_windows: int = 5,
    num_nodes: int = 20,
    num_timepoints: int = 60,
    ratio: float = 0.8,
    wavelets_num: int = 10,
    beta: float = 1.0,
    gamma: float = 0.005,
    max_iter: int = 100,
    node_select: int = 10,
) -> dict:
    """
    Run cross-frequency coupling (CFC) analysis using harmonic wavelets.
    Returns CFC matrices for each window.
    """
    config = AnalysisConfig()
    config.ratio = ratio
    config.wavelets_num = wavelets_num
    config.beta = beta
    config.gamma = gamma
    config.max_iter = max_iter
    config.node_select = node_select
    
    bolds = _build_dummy_bolds(num_windows, num_nodes, num_timepoints)
    cfcs = tool_cfc_wavelet(bolds, config)
    
    return {
        "status": "success",
        "num_windows": num_windows,
        "num_nodes": num_nodes,
        "num_timepoints": num_timepoints,
        "cfcs": cfcs,
    }


@server.tool(name="run_hub_detection")
def run_hub_detection(
    num_windows: int = 5,
    num_nodes: int = 20,
    num_timepoints: int = 60,
    ratio: float = 0.8,
    k: int = 2,
    hub_num: int = 10,
    use_group: bool = False,
) -> dict:
    """
    Detect hub nodes in brain networks using graph analysis.
    Returns hub detection results for each window or grouped analysis.
    """
    config = AnalysisConfig()
    config.ratio = ratio
    config.k = k
    config.hub_num = hub_num
    config.use_group = use_group
    
    bolds = _build_dummy_bolds(num_windows, num_nodes, num_timepoints)
    results = tool_hub_detection(bolds, config)
    
    return {
        "status": "success",
        "num_windows": num_windows,
        "num_nodes": num_nodes,
        "k": k,
        "hub_num": hub_num,
        "use_group": use_group,
        "results": results,
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


if __name__ == "__main__":
    server.run(transport="streamable-http", mount_path='/ram/USERS/ziquanw/brain-network-chart/uploaded_files') 
    