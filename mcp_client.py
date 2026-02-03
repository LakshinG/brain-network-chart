import requests
import json
import os
from datetime import datetime

BASE_URL = "http://yukon.acm.unc.edu:8010"
# Get API key from environment variable or use default for testing
API_KEY = os.getenv('MCP_API_KEY', 'default-key-change-in-production')

def call_tool(tool_name: str, params: dict, verbose: bool = True, api_key: str = None) -> dict:
    """Call an MCP tool via HTTP with authentication."""
    url = f"{BASE_URL}/{tool_name}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key or API_KEY}"
    }
    
    try:
        response = requests.post(url, json=params, headers=headers, timeout=300)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            return {
                "status": "error",
                "error_type": "AuthenticationError",
                "error": "Unauthorized: Invalid API key. Set MCP_API_KEY environment variable."
            }
        elif e.response.status_code == 429:
            return {
                "status": "error",
                "error_type": "RateLimitError",
                "error": "Rate limit exceeded: too many requests. Please try again later."
            }
        else:
            return {
                "status": "error",
                "error_type": "HTTPError",
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
    except requests.exceptions.Timeout:
        return {
            "status": "error",
            "error_type": "TimeoutError",
            "error": "Request timed out. Analysis may have taken longer than 5 minutes."
        }
    except requests.exceptions.ConnectionError:
        return {
            "status": "error",
            "error_type": "ConnectionError",
            "error": f"Cannot connect to server at {BASE_URL}. Is the server running?"
        }


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
    }, verbose=verbose)
    
    print_console_output(result, verbose)
    print_progress(result, verbose)
    
    if result.get("status") == "success":
        if verbose:
            elapsed = result.get('elapsed_seconds', 'unknown')
            print(f"[CFC] ✓ Analysis complete in {elapsed}s")
            print(f"      Shape: {result.get('shape')}")
            print(f"      Windows processed: {result.get('num_windows')}")
            print(f"      CFC matrices: {result.get('cfcs_count')}")
    else:
        error_type = result.get('error_type', 'Unknown')
        error_msg = result.get('error', 'No error message')
        print(f"[CFC] ✗ {error_type}: {error_msg}")
    
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
    }, verbose=verbose)
    
    print_console_output(result, verbose)
    print_progress(result, verbose)
    
    if result.get("status") == "success":
        if verbose:
            elapsed = result.get('elapsed_seconds', 'unknown')
            print(f"[HUB] ✓ Hub detection complete in {elapsed}s")
            print(f"      Shape: {result.get('shape')}")
            print(f"      Windows processed: {result.get('num_windows')}")
            print(f"      Configuration: k={result.get('k')}, hub_num={result.get('hub_num')}, use_group={result.get('use_group')}")
    else:
        error_type = result.get('error_type', 'Unknown')
        error_msg = result.get('error', 'No error message')
        print(f"[HUB] ✗ {error_type}: {error_msg}")
    
    return result


def get_growth_curve(phenotype: str = "Global mean of FC", verbose: bool = True):
    """Get growth curve data for a phenotype."""
    if verbose:
        print(f"\n[GROWTH] Loading growth curve for: {phenotype}")
    
    result = call_tool("get_growth_curve", {
        'phenotype': phenotype
    }, verbose=verbose)
    
    if result.get("status") == "success":
        if verbose:
            elapsed = result.get('elapsed_seconds', 'unknown')
            print(f"[GROWTH] ✓ Growth curve loaded in {elapsed}s")
    else:
        error_type = result.get('error_type', 'Unknown')
        error_msg = result.get('error', 'No error message')
        print(f"[GROWTH] ✗ {error_type}: {error_msg}")
    
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
    }, verbose=verbose)
    
    if result.get("status") == "success":
        if verbose:
            elapsed = result.get('elapsed_seconds', 'unknown')
            print(f"[NORMATIVE] ✓ Analysis complete in {elapsed}s")
    else:
        error_type = result.get('error_type', 'Unknown')
        error_msg = result.get('error', 'No error message')
        print(f"[NORMATIVE] ✗ {error_type}: {error_msg}")
    
    return result


def health_check(verbose: bool = True):
    """Check server health."""
    if verbose:
        print("[HEALTH] Checking server status...")
    
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        response.raise_for_status()
        status = response.json()
        if verbose:
            print(f"[HEALTH] ✓ Server is healthy")
            print(f"[HEALTH]   Version: {status.get('version')}")
            print(f"[HEALTH]   Timestamp: {status.get('timestamp')}")
        return status
    except requests.exceptions.ConnectionError:
        error_msg = f"Cannot connect to server at {BASE_URL}"
        print(f"[HEALTH] ✗ {error_msg}")
        return {"status": "error", "error": error_msg}
    except Exception as e:
        print(f"[HEALTH] ✗ Error: {str(e)}")
        return {"status": "error", "error": str(e)}


if __name__ == '__main__':
    # Check if using default API key
    if API_KEY == 'default-key-change-in-production':
        print("⚠️  WARNING: Using default API key. Set MCP_API_KEY environment variable for production.")
        print("   export MCP_API_KEY='your-secure-key'")
        print()
    
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