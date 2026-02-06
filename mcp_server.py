from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse#, PlainTextResponse
from starlette.exceptions import HTTPException
# import numpy as np
# import json
import sys
import io
import logging
import time
import os
from functools import wraps
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Dict, Any, Callable
from pydantic import BaseModel, Field, validator
from tools import (
    tool_cfc_wavelet,
    tool_hub_detection,
    tool_normative_analysis,
    AnalysisConfig,
    load_bolds_from_csv,
    load_curve_data,
    save_uploaded_file,
    list_uploaded_files,
    delete_uploaded_file,
    get_file_path,
)

from stats_tools import StatsToolkit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('mcp_server.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# API Key configuration (set via environment variable)
API_KEY = os.getenv('MCP_API_KEY', 'default-key-change-in-production')

# Rate limiting configuration
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 60  # seconds
client_requests: Dict[str, list] = {}

# Request/Response schemas
class CFCWaveletRequest(BaseModel):
    data_path: str = Field(default="data_example_BOLD.csv", description="Path to BOLD CSV file")
    window_size: int = Field(default=100, ge=10, le=1000, description="Sliding window size")
    step_size: int = Field(default=90, ge=1, le=500, description="Window step size")
    padding: bool = Field(default=True, description="Pad edges")
    ratio: float = Field(default=0.8, ge=0.0, le=1.0, description="Edge weight threshold ratio")
    wavelets_num: int = Field(default=10, ge=1, le=100, description="Number of wavelets")
    beta: float = Field(default=1.0, ge=0.0, description="Regularization parameter")
    gamma: float = Field(default=0.005, ge=0.0, description="Convergence threshold")
    max_iter: int = Field(default=100, ge=1, le=1000, description="Max iterations")
    node_select: int = Field(default=10, ge=1, description="Node selection parameter")
    
    @validator('step_size')
    def validate_step_size(cls, v, values):
        if 'window_size' in values and v > values['window_size']:
            raise ValueError('step_size must be <= window_size')
        return v

class HubDetectionRequest(BaseModel):
    data_path: str = Field(default="data_example_BOLD.csv", description="Path to BOLD CSV file")
    window_size: int = Field(default=100, ge=10, le=1000, description="Sliding window size")
    step_size: int = Field(default=90, ge=1, le=500, description="Window step size")
    padding: bool = Field(default=True, description="Pad edges")
    ratio: float = Field(default=0.8, ge=0.0, le=1.0, description="Edge weight threshold")
    k: int = Field(default=2, ge=1, le=100, description="Embedding dimension")
    hub_num: int = Field(default=10, ge=1, description="Number of hubs")
    use_group: bool = Field(default=False, description="Use group method")

class NormativeAnalysisRequest(BaseModel):
    x_phenotype: str = Field(description="Phenotype name")
    y_path: str = Field(description="Path to Y data CSV")
    age_col: str = Field(description="Age column name")
    val_col: str = Field(description="Value column name")

class ResponseSchema(BaseModel):
    status: str
    timestamp: str
    message: str = ""
    data: dict = Field(default_factory=dict)
    console_output: str = ""
    progress: list = Field(default_factory=list)

@contextmanager
def capture_output():
    """Context manager to capture stdout."""
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield sys.stdout
    finally:
        sys.stdout = old_stdout


def validate_api_key(f: Callable) -> Callable:
    """Decorator to validate API key in request headers."""
    @wraps(f)
    async def decorated_function(request: Request, *args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        else:
            token = request.headers.get('X-API-Key', '')
        
        if token != API_KEY:
            logger.warning(f"Unauthorized access attempt from {request.client.host}")
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        return await f(request, *args, **kwargs)
    return decorated_function


def rate_limit(f: Callable) -> Callable:
    """Decorator to enforce rate limiting per client."""
    @wraps(f)
    async def decorated_function(request: Request, *args, **kwargs):
        client_ip = request.client.host
        now = time.time()
        
        # Clean old requests
        if client_ip not in client_requests:
            client_requests[client_ip] = []
        
        client_requests[client_ip] = [
            req_time for req_time in client_requests[client_ip]
            if now - req_time < RATE_LIMIT_WINDOW
        ]
        
        # Check rate limit
        if len(client_requests[client_ip]) >= RATE_LIMIT_REQUESTS:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW}s"
            )
        
        client_requests[client_ip].append(now)
        return await f(request, *args, **kwargs)
    return decorated_function


def validate_parameters(**param_rules) -> Callable:
    """Decorator to validate function parameters."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def wrapper(*args, **kwargs):
            errors = []
            for param, rule in param_rules.items():
                if param in kwargs:
                    value = kwargs[param]
                    if 'min' in rule and value < rule['min']:
                        errors.append(f"{param} must be >= {rule['min']}, got {value}")
                    if 'max' in rule and value > rule['max']:
                        errors.append(f"{param} must be <= {rule['max']}, got {value}")
                    if 'type' in rule and not isinstance(value, rule['type']):
                        errors.append(f"{param} must be {rule['type'].__name__}, got {type(value).__name__}")
                    if 'file_exists' in rule and rule['file_exists']:
                        if not os.path.exists(value):
                            errors.append(f"File not found: {value}")
            
            if errors:
                logger.error(f"Parameter validation failed: {'; '.join(errors)}")
                raise ValueError(f"Parameter validation failed: {'; '.join(errors)}")
            
            return f(*args, **kwargs)
        return wrapper
    return decorator


server = FastMCP('Brain Network Analysis Server',
                 host='yukon.acm.unc.edu', port=8010)


@server.tool(name="run_cfc_wavelet_analysis")
@validate_parameters(
    window_size={'min': 10, 'max': 1000, 'type': int},
    step_size={'min': 1, 'max': 500, 'type': int},
    ratio={'min': 0.0, 'max': 1.0, 'type': float},
    wavelets_num={'min': 1, 'max': 100, 'type': int},
    max_iter={'min': 1, 'max': 1000, 'type': int},
)
def run_cfc_wavelet_analysis(
    data_path: str = "data_example_BOLD.csv",
    window_size: int = 100,
    step_size: int = 90,
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
    
    Parameters:
    - data_path: Path to BOLD CSV file
    - window_size: Sliding window size (10-1000)
    - step_size: Window step size (1-500)
    - padding: Pad edges
    - ratio: Edge weight threshold ratio (0.0-1.0)
    - wavelets_num: Number of wavelets (1-100)
    - beta: Regularization parameter
    - gamma: Convergence threshold
    - max_iter: Maximum iterations (1-1000)
    - node_select: Node selection parameter
    
    Returns: Analysis results with console output and progress tracking
    """
    progress_log = []
    captured_output = []
    start_time = time.time()
    
    try:
        logger.info(f"CFC analysis started: window_size={window_size}, step_size={step_size}")
        
        # Resolve file path (checks uploaded_files first, then local directory)
        try:
            data_path = get_file_path(data_path)
        except FileNotFoundError as e:
            raise FileNotFoundError(f"Data file not found: {e}")
        
        # Validate parameters consistency
        if step_size > window_size:
            raise ValueError(f"step_size ({step_size}) must be <= window_size ({window_size})")
        
        config = AnalysisConfig()
        config.ratio = ratio
        config.wavelets_num = wavelets_num
        config.beta = beta
        config.gamma = gamma
        config.max_iter = max_iter
        config.node_select = node_select
        
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
        
        elapsed = time.time() - start_time
        logger.info(f"CFC analysis completed in {elapsed:.2f}s")
        
        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "num_windows": num_windows,
            "shape": list(bolds.shape),
            "cfcs_count": len(cfcs),
            "elapsed_seconds": elapsed,
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except FileNotFoundError as e:
        logger.error(f"File error: {str(e)}")
        progress_log.append({"step": "error", "message": f"File error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "FileNotFoundError",
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        progress_log.append({"step": "error", "message": f"Validation error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "ValueError",
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except Exception as e:
        logger.error(f"Unexpected error in CFC analysis: {str(e)}", exc_info=True)
        progress_log.append({"step": "error", "message": f"Unexpected error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": type(e).__name__,
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }


@server.tool(name="run_hub_detection")
@validate_parameters(
    window_size={'min': 10, 'max': 1000, 'type': int},
    step_size={'min': 1, 'max': 500, 'type': int},
    ratio={'min': 0.0, 'max': 1.0, 'type': float},
    k={'min': 1, 'max': 100, 'type': int},
    hub_num={'min': 1, 'type': int},
)
def run_hub_detection(
    data_path: str = "data_example_BOLD.csv",
    window_size: int = 100,
    step_size: int = 90,
    padding: bool = True,
    ratio: float = 0.8,
    k: int = 2,
    hub_num: int = 10,
    use_group: bool = False,
) -> dict:
    """
    Detect hub nodes in brain networks using graph analysis.
    
    Parameters:
    - data_path: Path to BOLD CSV file
    - window_size: Sliding window size (10-1000)
    - step_size: Window step size (1-500)
    - padding: Pad edges
    - ratio: Edge weight threshold (0.0-1.0)
    - k: Embedding dimension (1-100)
    - hub_num: Number of hubs to identify
    - use_group: Use group/Grassmann manifold method for multiple networks
    
    Returns: Hub detection results with embeddings and selection matrices
    """
    progress_log = []
    captured_output = []
    start_time = time.time()
    
    try:
        logger.info(f"Hub detection started: window_size={window_size}, step_size={step_size}, k={k}, hub_num={hub_num}")
        
        # Resolve file path (checks uploaded_files first, then local directory)
        try:
            data_path = get_file_path(data_path)
        except FileNotFoundError as e:
            raise FileNotFoundError(f"Data file not found: {e}")
        
        # Validate parameters
        if step_size > window_size:
            raise ValueError(f"step_size ({step_size}) must be <= window_size ({window_size})")
        
        config = AnalysisConfig()
        config.ratio = ratio
        config.k = k
        config.hub_num = hub_num
        config.use_group = use_group
        
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
        
        elapsed = time.time() - start_time
        logger.info(f"Hub detection completed in {elapsed:.2f}s")
        
        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "num_windows": num_windows,
            "shape": list(bolds.shape),
            "k": k,
            "hub_num": hub_num,
            "use_group": use_group,
            "results": results,
            "elapsed_seconds": elapsed,
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except FileNotFoundError as e:
        logger.error(f"File error: {str(e)}")
        progress_log.append({"step": "error", "message": f"File error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "FileNotFoundError",
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        progress_log.append({"step": "error", "message": f"Validation error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "ValueError",
            "error": str(e),
            "console_output": "\n".join(captured_output),
            "progress": progress_log,
        }
    except Exception as e:
        logger.error(f"Unexpected error in hub detection: {str(e)}", exc_info=True)
        progress_log.append({"step": "error", "message": f"Unexpected error: {str(e)}"})
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": type(e).__name__,
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
    start_time = time.time()
    try:
        logger.info(f"Loading growth curve for phenotype: {phenotype}")
        data = load_curve_data(phenotype)
        elapsed = time.time() - start_time
        logger.info(f"Growth curve loaded in {elapsed:.2f}s")
        
        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "phenotype": phenotype,
            "data": data,
            "elapsed_seconds": elapsed,
        }
    except KeyError as e:
        logger.error(f"Phenotype not found: {phenotype}")
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "KeyError",
            "phenotype": phenotype,
            "error": f"Phenotype not found: {phenotype}. Available: Global mean of FC, Visual system segregation (VIS), etc.",
        }
    except Exception as e:
        logger.error(f"Error loading growth curve: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": type(e).__name__,
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
    
    Parameters:
    - x_phenotype: Name of phenotype/growth curve
    - y_path: Path to CSV file with overlay data
    - age_col: Column name for age values
    - val_col: Column name for metric values
    
    Returns: Combined x and y data for normative modeling
    """
    start_time = time.time()
    try:
        logger.info(f"Starting normative analysis: phenotype={x_phenotype}, y_path={y_path}")
        
        # Resolve file path (checks uploaded_files first, then local directory)
        if y_path:
            try:
                y_path = get_file_path(y_path)
            except FileNotFoundError as e:
                raise FileNotFoundError(f"Overlay data file not found: {e}")
        
        # Validate column names
        if not age_col or not val_col:
            raise ValueError("age_col and val_col parameters are required")
        
        config = AnalysisConfig()
        config.x_phenotype = x_phenotype
        config.y_path = y_path
        config.age_col = age_col
        config.val_col = val_col
        
        results = tool_normative_analysis(config)
        elapsed = time.time() - start_time
        logger.info(f"Normative analysis completed in {elapsed:.2f}s")
        
        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "phenotype": x_phenotype,
            "y_path": y_path,
            "data": results,
            "elapsed_seconds": elapsed,
        }
    except FileNotFoundError as e:
        logger.error(f"File error: {str(e)}")
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "FileNotFoundError",
            "phenotype": x_phenotype,
            "error": str(e),
        }
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": "ValueError",
            "phenotype": x_phenotype,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"Unexpected error in normative analysis: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error_type": type(e).__name__,
            "phenotype": x_phenotype,
            "error": str(e),
        }


@server.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> JSONResponse:
    """Health check endpoint - no authentication required."""
    return JSONResponse({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "uptime_check": True
    })


@server.custom_route("/api/schema", methods=["GET"])
async def api_schema(request: Request) -> JSONResponse:
    """Provide API schema documentation for agents."""
    schema = {
        "version": "1.0.0",
        "title": "Brain Network Analysis API",
        "description": "MCP server for brain network analysis",
        "endpoints": {
            "run_cfc_wavelet_analysis": {
                "method": "POST",
                "description": "Cross-frequency coupling wavelet analysis",
                "parameters": CFCWaveletRequest.schema(),
            },
            "run_hub_detection": {
                "method": "POST",
                "description": "Hub detection in brain networks",
                "parameters": HubDetectionRequest.schema(),
            },
            "get_growth_curve": {
                "method": "POST",
                "description": "Load growth curve data",
                "parameters": {
                    "phenotype": {"type": "string", "description": "Phenotype name"}
                }
            },
            "run_normative_analysis": {
                "method": "POST",
                "description": "Normative developmental trajectory analysis",
                "parameters": NormativeAnalysisRequest.schema(),
            },
        },
        "authentication": {
            "type": "Bearer token or X-API-Key header",
            "required": "true",
            "example": "Authorization: Bearer <api-key> or X-API-Key: <api-key>"
        },
        "rate_limiting": {
            "requests_per_window": RATE_LIMIT_REQUESTS,
            "window_seconds": RATE_LIMIT_WINDOW,
        }
    }
    return JSONResponse(schema)


@server.custom_route("/run_cfc_wavelet_analysis", methods=["POST"])
@validate_api_key
@rate_limit
async def http_run_cfc_wavelet_analysis(request: Request) -> JSONResponse:
    """HTTP endpoint for CFC wavelet analysis."""
    try:
        data = await request.json()
        # Validate using Pydantic model
        validated_data = CFCWaveletRequest(**data)
        
        result = run_cfc_wavelet_analysis(
            data_path=validated_data.data_path,
            window_size=validated_data.window_size,
            step_size=validated_data.step_size,
            padding=validated_data.padding,
            ratio=validated_data.ratio,
            wavelets_num=validated_data.wavelets_num,
            beta=validated_data.beta,
            gamma=validated_data.gamma,
            max_iter=validated_data.max_iter,
            node_select=validated_data.node_select,
        )
        return JSONResponse(result)
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid parameters: {str(e)}")
    except Exception as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@server.custom_route("/run_hub_detection", methods=["POST"])
@validate_api_key
@rate_limit
async def http_run_hub_detection(request: Request) -> JSONResponse:
    """HTTP endpoint for hub detection."""
    try:
        data = await request.json()
        # Validate using Pydantic model
        validated_data = HubDetectionRequest(**data)
        
        result = run_hub_detection(
            data_path=validated_data.data_path,
            window_size=validated_data.window_size,
            step_size=validated_data.step_size,
            padding=validated_data.padding,
            ratio=validated_data.ratio,
            k=validated_data.k,
            hub_num=validated_data.hub_num,
            use_group=validated_data.use_group,
        )
        return JSONResponse(result)
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid parameters: {str(e)}")
    except Exception as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@server.custom_route("/get_growth_curve", methods=["POST"])
@validate_api_key
@rate_limit
async def http_get_growth_curve(request: Request) -> JSONResponse:
    """HTTP endpoint for growth curve data."""
    try:
        data = await request.json()
        phenotype = data.get("phenotype", "Global mean of FC")
        
        if not phenotype:
            raise HTTPException(status_code=400, detail="phenotype parameter required")
        
        result = get_growth_curve(phenotype=phenotype)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@server.custom_route("/run_normative_analysis", methods=["POST"])
@validate_api_key
@rate_limit
async def http_run_normative_analysis(request: Request) -> JSONResponse:
    """HTTP endpoint for normative analysis."""
    try:
        data = await request.json()
        # Validate using Pydantic model
        validated_data = NormativeAnalysisRequest(**data)
        
        result = run_normative_analysis(
            x_phenotype=validated_data.x_phenotype,
            y_path=validated_data.y_path,
            age_col=validated_data.age_col,
            val_col=validated_data.val_col,
        )
        return JSONResponse(result)
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid parameters: {str(e)}")
    except Exception as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@server.custom_route("/upload", methods=["POST"])
@validate_api_key
@rate_limit
async def upload_file(request: Request) -> JSONResponse:
    """Upload a file to the server for analysis.
    
    Expects multipart form data with 'file' field.
    """
    try:
        form = await request.form()
        
        if 'file' not in form:
            raise HTTPException(status_code=400, detail="No file provided in request")
        
        uploaded_file = form['file']
        
        if not uploaded_file.filename:
            raise HTTPException(status_code=400, detail="File has no name")
        
        # Read file content
        file_content = await uploaded_file.read()
        
        if not file_content:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Save file
        file_path, file_info = save_uploaded_file(file_content, uploaded_file.filename)
        
        logger.info(f"File uploaded: {file_info['saved_filename']}")
        
        return JSONResponse({
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "file_info": file_info,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@server.custom_route("/list_files", methods=["GET"])
@validate_api_key
async def list_files(request: Request) -> JSONResponse:
    """List all uploaded files."""
    try:
        files = list_uploaded_files()
        logger.info(f"Listed {len(files)} uploaded files")
        
        return JSONResponse({
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "count": len(files),
            "files": files,
        })
    except Exception as e:
        logger.error(f"List files error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@server.custom_route("/delete_file", methods=["DELETE", "POST"])
@validate_api_key
@rate_limit
async def delete_file(request: Request) -> JSONResponse:
    """Delete an uploaded file.
    
    Expects JSON with 'filename' field.
    """
    try:
        if request.method == "DELETE":
            data = await request.json()
        else:
            data = await request.json()
        
        filename = data.get("filename", "")
        if not filename:
            raise HTTPException(status_code=400, detail="Filename required")
        
        result = delete_uploaded_file(filename)
        logger.info(f"File deleted: {filename}")
        
        return JSONResponse({
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "result": result,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete file error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


if __name__ == "__main__":
    logger.info("="*60)
    logger.info("Brain Network Analysis MCP Server starting...")
    logger.info(f"API Key authentication: {'enabled' if API_KEY != 'default-key-change-in-production' else 'DISABLED (using default)'}")
    logger.info(f"Rate limiting: {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW}s")
    logger.info(f"Listening on: http://yukon.acm.unc.edu:8010")
    logger.info("="*60)
    logger.info("Available endpoints:")
    logger.info("  GET  /health                     - Health check")
    logger.info("  GET  /api/schema                 - API schema documentation")
    logger.info("  POST /run_cfc_wavelet_analysis   - CFC analysis")
    logger.info("  POST /run_hub_detection          - Hub detection")
    logger.info("  POST /get_growth_curve           - Growth curve data")
    logger.info("  POST /run_normative_analysis     - Normative analysis")
    logger.info("  POST /upload                     - Upload file for analysis")
    logger.info("  GET  /list_files                 - List uploaded files")
    logger.info("  DELETE /delete_file              - Delete uploaded file")
    logger.info("="*60)
    logger.info("Set MCP_API_KEY environment variable for authentication")
    logger.info("="*60)
    
    try:
        server.run(transport="streamable-http", mount_path='/ram/USERS/ziquanw/brain-network-chart/uploaded_files')
    except KeyboardInterrupt:
        logger.info("Server shutdown requested")
    except Exception as e:
        logger.error(f"Server error: {str(e)}", exc_info=True)
    finally:
        logger.info("Server stopped")

# --- LAKSHIN'S UPDATED STATISTICAL TOOLS ---

@mcp.tool()
def run_correlation(data_source: str, var1: str, var2: str) -> str:
    """
    Calculates Pearson correlation between two variables (Linear Relationship).
    Returns correlation coefficient, p-value, and significance.
    """
    result = StatsToolkit.correlation_analysis(data_source, var1, var2)
    return json.dumps(result)

@mcp.tool()
def run_group_comparison(data_source: str, group_col: str, metric_col: str, group_a: str, group_b: str, method: str = "ttest") -> str:
    """
    Compares two groups. Returns p-value AND Cohen's d Effect Size.
    Args:
        method: 'ttest' (standard) or 'mannwhitney' (use if data is non-normal/skewed).
    """
    # This calls the NEW 'compare_groups' function we just wrote
    result = StatsToolkit.compare_groups(data_source, group_col, metric_col, group_a, group_b, method)
    return json.dumps(result)

@mcp.tool()
def apply_fdr_correction(p_values: list[float]) -> str:
    """
    Applies False Discovery Rate (Benjamini-Hochberg) correction.
    MANDATORY when testing multiple brain regions to prevent false positives.
    """
    result = StatsToolkit.correct_p_values(p_values)
    return json.dumps(result)

@mcp.tool()
def detect_outliers(data_source: str, column: str) -> str:
    """
    Scans a column for statistical outliers (Z-score > 3).
    Use this to clean data before running T-tests.
    """
    result = StatsToolkit.detect_outliers_zscore(data_source, column)
    return json.dumps(result)