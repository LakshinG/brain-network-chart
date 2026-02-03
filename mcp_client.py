import requests
import json

BASE_URL = "http://yukon.acm.unc.edu:8010"

def call_tool(tool_name: str, params: dict, verbose: bool = True) -> dict:
    """Call an MCP tool via HTTP."""
    url = f"{BASE_URL}/{tool_name}"
    response = requests.post(url, json=params)
    response.raise_for_status()
    return response.json()


def print_console_output(result: dict, verbose: bool = True):
    """Print captured console output from server."""
    if not verbose or "console_output" not in result:
        return
    
    console_out = result.get("console_output", "").strip()
    if console_out:
        print("\n" + "="*60)
        print("Server Console Output:")
        print("="*60)
        print(console_out)
        print("="*60 + "\n")


def print_progress(result: dict, verbose: bool = True):
    """Print progress information from result."""
    if not verbose:
        return
    
    if "progress" in result:
        print("\n" + "="*60)
        print(f"Progress Log:")
        print("="*60)
        for entry in result["progress"]:
            step = entry.get("step", "unknown").upper()
            message = entry.get("message", "")
            print(f"[{step}] {message}")
        print("="*60 + "\n")


def run_cfc_wavelet_analysis(data_path: str = "data_example_BOLD.csv", window_size: int = 100, step_size: int = 90, verbose: bool = True):
    """Run cross-frequency coupling wavelet analysis."""
    if verbose:
        print(f"\n[CFC] Starting analysis on {data_path}...")
    
    result = call_tool("run_cfc_wavelet_analysis", {
        'data_path': data_path,
        'window_size': window_size,
        'step_size': step_size,
        'padding': True,
        'ratio': 0.8,
        'wavelets_num': 10,
        'beta': 1.0,
        'gamma': 0.005,
        'max_iter': 100,
        'node_select': 10
    })
    
    print_console_output(result, verbose)
    print_progress(result, verbose)
    
    if result.get("status") == "success":
        if verbose:
            print(f"[CFC] Analysis complete!")
            print(f"      Shape: {result.get('shape')}")
            print(f"      Windows processed: {result.get('num_windows')}")
            print(f"      CFC matrices: {result.get('cfcs_count')}")
    else:
        print(f"[CFC] ERROR: {result.get('error')}")
    
    return result


def run_hub_detection(data_path: str = "data_example_BOLD.csv", window_size: int = 100, step_size: int = 90, verbose: bool = True):
    """Run hub detection analysis."""
    if verbose:
        print(f"\n[HUB] Starting hub detection on {data_path}...")
    
    result = call_tool("run_hub_detection", {
        'data_path': data_path,
        'window_size': window_size,
        'step_size': step_size,
        'padding': True,
        'ratio': 0.8,
        'k': 2,
        'hub_num': 10,
        'use_group': False
    })
    
    print_console_output(result, verbose)
    print_progress(result, verbose)
    
    if result.get("status") == "success":
        if verbose:
            print(f"[HUB] Hub detection complete!")
            print(f"      Shape: {result.get('shape')}")
            print(f"      Windows processed: {result.get('num_windows')}")
            print(f"      Configuration: k={result.get('k')}, hub_num={result.get('hub_num')}, use_group={result.get('use_group')}")
    else:
        print(f"[HUB] ERROR: {result.get('error')}")
    
    return result


def get_growth_curve(phenotype: str = "Global mean of FC", verbose: bool = True):
    """Get growth curve data for a phenotype."""
    if verbose:
        print(f"\n[GROWTH] Loading growth curve for: {phenotype}")
    
    result = call_tool("get_growth_curve", {
        'phenotype': phenotype
    })
    
    if result.get("status") == "success":
        if verbose:
            print(f"[GROWTH] Growth curve loaded successfully!")
    else:
        print(f"[GROWTH] ERROR: {result.get('error')}")
    
    return result


def run_normative_analysis(y_path: str, age_col: str, val_col: str, verbose: bool = True):
    """Run normative analysis comparing growth curves with overlay data."""
    if verbose:
        print(f"\n[NORMATIVE] Starting normative analysis...")
        print(f"             Y path: {y_path}")
        print(f"             Age column: {age_col}, Value column: {val_col}")
    
    result = call_tool("run_normative_analysis", {
        'x_phenotype': 'Global mean of FC',
        'y_path': y_path,
        'age_col': age_col,
        'val_col': val_col
    })
    
    if result.get("status") == "success":
        if verbose:
            print(f"[NORMATIVE] Analysis complete!")
    else:
        print(f"[NORMATIVE] ERROR: {result.get('error')}")
    
    return result


def health_check(verbose: bool = True):
    """Check server health."""
    if verbose:
        print("[HEALTH] Checking server status...")
    response = requests.get(f"{BASE_URL}/health")
    if verbose:
        print(f"[HEALTH] Server status: {response.text}")
    return response.text


if __name__ == '__main__':
    # Test health check
    health_check(verbose=True)
    
    # Run analyses with verbose output
    print("\n" + "="*60)
    print("STARTING ANALYSIS SUITE")
    print("="*60)
    
    run_cfc_wavelet_analysis(verbose=True)
    run_hub_detection(verbose=True)
    get_growth_curve(verbose=True)
    
    print("\n" + "="*60)
    print("ANALYSIS SUITE COMPLETE")
    print("="*60)
    
    # Uncomment to run normative analysis with your data:
    # run_normative_analysis("/path/to/data.csv", "age_column", "value_column", verbose=True)