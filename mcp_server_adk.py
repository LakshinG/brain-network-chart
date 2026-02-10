import contextlib
import logging
import json
import base64
from collections.abc import AsyncIterator
from typing import Any

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

# Import existing analysis functions and helpers from the original MCP server
from mcp_server import (
    run_cfc_wavelet_analysis,
    run_hub_detection,
    get_growth_curve,
    run_normative_analysis,
    search_pubmed,
    openalex_search,
    crossref_enrich,
    internet_search,
    openneuro_search,
    run_correlation,
    run_group_comparison,
    apply_fdr_correction,
    detect_outliers,
    check_data_normality,
    save_uploaded_file,
    list_uploaded_files,
    delete_uploaded_file,
)

logger = logging.getLogger(__name__)


def create_mcp_server():
    """Create and configure the MCP server using ADK Server abstraction."""
    app = Server("adk-mcp-streamable-server")

    @app.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.ContentBlock]:
        """Handle tool calls from MCP clients by delegating to existing functions.

        All results are returned as a single TextContent block containing JSON.
        """
        try:
            # Validate parameters for known tools
            def _validate_cfc_params(args: dict[str, Any]):
                # Expected types and ranges (mirror mcp_server.py rules)
                if 'window_size' in args:
                    ws = int(args['window_size'])
                    if ws < 10 or ws > 1000:
                        raise ValueError('window_size must be between 10 and 1000')
                if 'step_size' in args:
                    ss = int(args['step_size'])
                    if ss < 30 or ss > 500:
                        raise ValueError('step_size must be between 30 and 500')
                if 'ratio' in args:
                    r = float(args['ratio'])
                    if r < 0.0 or r > 1.0:
                        raise ValueError('ratio must be between 0.0 and 1.0')
                if 'wavelets_num' in args:
                    wn = int(args['wavelets_num'])
                    if wn < 1 or wn > 100:
                        raise ValueError('wavelets_num must be between 1 and 100')
                if 'max_iter' in args:
                    mi = int(args['max_iter'])
                    if mi < 1 or mi > 1000:
                        raise ValueError('max_iter must be between 1 and 1000')
                if 'step_size' in args and 'window_size' in args:
                    if int(args['step_size']) > int(args['window_size']):
                        raise ValueError('step_size must be <= window_size')

            def _validate_hub_params(args: dict[str, Any]):
                if 'window_size' in args:
                    ws = int(args['window_size'])
                    if ws < 10 or ws > 1000:
                        raise ValueError('window_size must be between 10 and 1000')
                if 'step_size' in args:
                    ss = int(args['step_size'])
                    if ss < 1 or ss > 500:
                        raise ValueError('step_size must be between 1 and 500')
                if 'ratio' in args:
                    r = float(args['ratio'])
                    if r < 0.0 or r > 1.0:
                        raise ValueError('ratio must be between 0.0 and 1.0')
                if 'k' in args:
                    k = int(args['k'])
                    if k < 1 or k > 100:
                        raise ValueError('k must be between 1 and 100')
                if 'hub_num' in args:
                    hn = int(args['hub_num'])
                    if hn < 1:
                        raise ValueError('hub_num must be >= 1')
                if 'step_size' in args and 'window_size' in args:
                    if int(args['step_size']) > int(args['window_size']):
                        raise ValueError('step_size must be <= window_size')

            def _validate_normative_params(args: dict[str, Any]):
                required = ('x_phenotype', 'y_path', 'age_col', 'val_col')
                for r in required:
                    if r not in args or not args.get(r):
                        raise ValueError(f"{r} is required for normative analysis")

            def _validate_pubmed_params(args: dict[str, Any]):
                if 'query' not in args or not (args.get('query') or '').strip():
                    raise ValueError("query is required for PubMed search")
                if 'max_results' in args:
                    mr = int(args['max_results'])
                    if mr < 1 or mr > 200:
                        raise ValueError('max_results must be between 1 and 200')
                if args.get('year_from') is not None and args.get('year_to') is not None:
                    if int(args['year_from']) > int(args['year_to']):
                        raise ValueError('year_from must be <= year_to')

            def _validate_openalex_params(args: dict[str, Any]):
                if 'query' not in args or not (args.get('query') or '').strip():
                    raise ValueError("query is required for OpenAlex search")
                if 'max_results' in args:
                    mr = int(args['max_results'])
                    if mr < 1 or mr > 50:
                        raise ValueError('max_results must be between 1 and 50')
                if args.get('from_year') is not None and args.get('to_year') is not None:
                    if int(args['from_year']) > int(args['to_year']):
                        raise ValueError('from_year must be <= to_year')

            def _validate_crossref_params(args: dict[str, Any]):
                dois = args.get('dois')
                if not isinstance(dois, list) or not dois:
                    raise ValueError('dois must be a non-empty list')
                if 'max_items' in args:
                    mi = int(args['max_items'])
                    if mi < 1 or mi > 200:
                        raise ValueError('max_items must be between 1 and 200')

            def _validate_internet_params(args: dict[str, Any]):
                if 'query' not in args or not (args.get('query') or '').strip():
                    raise ValueError("query is required for internet_search")
                if 'max_results' in args:
                    mr = int(args['max_results'])
                    if mr < 1 or mr > 50:
                        raise ValueError('max_results must be between 1 and 50')
                if args.get('from_year') is not None and args.get('to_year') is not None:
                    if int(args['from_year']) > int(args['to_year']):
                        raise ValueError('from_year must be <= to_year')

            def _validate_openneuro_params(args: dict[str, Any]):
                if 'query' not in args or not (args.get('query') or '').strip():
                    raise ValueError("query is required for OpenNeuro search")
                if 'max_results' in args:
                    mr = int(args['max_results'])
                    if mr < 1 or mr > 50:
                        raise ValueError('max_results must be between 1 and 50')

            def _validate_correlation_params(args: dict[str, Any]):
                required = ('data_source', 'var1', 'var2')
                for r in required:
                    if r not in args or args.get(r) in (None, ''):
                        raise ValueError(f"{r} is required for run_correlation")

            def _validate_group_comparison_params(args: dict[str, Any]):
                required = ('data_source', 'group_col', 'metric_col', 'group_a', 'group_b')
                for r in required:
                    if r not in args or args.get(r) in (None, ''):
                        raise ValueError(f"{r} is required for run_group_comparison")

            def _validate_fdr_params(args: dict[str, Any]):
                pvals = args.get('p_values')
                if not isinstance(pvals, list) or not pvals:
                    raise ValueError('p_values must be a non-empty list')

            def _validate_outlier_params(args: dict[str, Any]):
                required = ('data_source', 'column')
                for r in required:
                    if r not in args or args.get(r) in (None, ''):
                        raise ValueError(f"{r} is required for detect_outliers")

            def _validate_normality_params(args: dict[str, Any]):
                required = ('data_source', 'column')
                for r in required:
                    if r not in args or args.get(r) in (None, ''):
                        raise ValueError(f"{r} is required for check_data_normality")

            if name == "run_cfc_wavelet_analysis":
                # Map arguments and call the blocking function in a thread
                params = {
                    k: arguments[k]
                    for k in (
                        "data_path",
                        "window_size",
                        "step_size",
                        "padding",
                        "ratio",
                        "wavelets_num",
                        "beta",
                        "gamma",
                        "max_iter",
                        "node_select",
                    )
                    if k in arguments
                }
                # Validate parameters according to rules
                _validate_cfc_params(params)
                result = await anyio.to_thread.run_sync(lambda: run_cfc_wavelet_analysis(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "run_hub_detection":
                params = {
                    k: arguments[k]
                    for k in (
                        "data_path",
                        "window_size",
                        "step_size",
                        "padding",
                        "ratio",
                        "k",
                        "hub_num",
                        "use_group",
                    )
                    if k in arguments
                }
                _validate_hub_params(params)
                result = await anyio.to_thread.run_sync(lambda: run_hub_detection(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "get_growth_curve":
                phenotype = arguments.get("phenotype", "Global mean of FC")
                result = await anyio.to_thread.run_sync(lambda: get_growth_curve(phenotype))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "run_normative_analysis":
                params = {
                    k: arguments[k]
                    for k in ("x_phenotype", "y_path", "age_col", "val_col")
                    if k in arguments
                }
                _validate_normative_params(params)
                result = await anyio.to_thread.run_sync(lambda: run_normative_analysis(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "search_pubmed":
                params = {
                    k: arguments[k]
                    for k in ("query", "max_results", "year_from", "year_to")
                    if k in arguments
                }
                _validate_pubmed_params(params)
                result = await anyio.to_thread.run_sync(lambda: search_pubmed(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "openalex_search":
                params = {
                    k: arguments[k]
                    for k in ("query", "max_results", "from_year", "to_year")
                    if k in arguments
                }
                _validate_openalex_params(params)
                result = await anyio.to_thread.run_sync(lambda: openalex_search(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "crossref_enrich":
                params = {
                    k: arguments[k]
                    for k in ("dois", "max_items")
                    if k in arguments
                }
                _validate_crossref_params(params)
                result = await anyio.to_thread.run_sync(lambda: crossref_enrich(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "internet_search":
                params = {
                    k: arguments[k]
                    for k in ("query", "max_results", "from_year", "to_year")
                    if k in arguments
                }
                _validate_internet_params(params)
                result = await anyio.to_thread.run_sync(lambda: internet_search(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "openneuro_search":
                params = {
                    k: arguments[k]
                    for k in ("query", "max_results", "modality")
                    if k in arguments
                }
                _validate_openneuro_params(params)
                result = await anyio.to_thread.run_sync(lambda: openneuro_search(**params))
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "upload_file":
                # Expect `filename` and base64-encoded `content` in arguments
                filename = arguments.get("filename")
                content_b64 = arguments.get("content")
                if not filename or not content_b64:
                    raise ValueError("upload_file requires 'filename' and base64 'content'")
                file_bytes = base64.b64decode(content_b64)
                # save_uploaded_file returns (file_path, file_info)
                result = await anyio.to_thread.run_sync(lambda: save_uploaded_file(file_bytes, filename))
                return [types.TextContent(type="text", text=json.dumps({"file_info": result[1]}))]

            if name == "list_files":
                result = await anyio.to_thread.run_sync(lambda: list_uploaded_files())
                return [types.TextContent(type="text", text=json.dumps({"files": result}))]

            if name == "delete_file":
                filename = arguments.get("filename")
                if not filename:
                    raise ValueError("delete_file requires 'filename'")
                result = await anyio.to_thread.run_sync(lambda: delete_uploaded_file(filename))
                return [types.TextContent(type="text", text=json.dumps({"result": result}))]

            if name == "run_correlation":
                params = {
                    k: arguments[k]
                    for k in ("data_source", "var1", "var2")
                    if k in arguments
                }
                _validate_correlation_params(params)
                result = await anyio.to_thread.run_sync(lambda: run_correlation(**params))
                if isinstance(result, str):
                    result = json.loads(result)
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "run_group_comparison":
                params = {
                    k: arguments[k]
                    for k in ("data_source", "group_col", "metric_col", "group_a", "group_b", "method")
                    if k in arguments
                }
                _validate_group_comparison_params(params)
                result = await anyio.to_thread.run_sync(lambda: run_group_comparison(**params))
                if isinstance(result, str):
                    result = json.loads(result)
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "apply_fdr_correction":
                params = {
                    k: arguments[k]
                    for k in ("p_values",)
                    if k in arguments
                }
                _validate_fdr_params(params)
                result = await anyio.to_thread.run_sync(lambda: apply_fdr_correction(**params))
                if isinstance(result, str):
                    result = json.loads(result)
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "detect_outliers":
                params = {
                    k: arguments[k]
                    for k in ("data_source", "column")
                    if k in arguments
                }
                _validate_outlier_params(params)
                result = await anyio.to_thread.run_sync(lambda: detect_outliers(**params))
                if isinstance(result, str):
                    result = json.loads(result)
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "check_data_normality":
                params = {
                    k: arguments[k]
                    for k in ("data_source", "column")
                    if k in arguments
                }
                _validate_normality_params(params)
                result = await anyio.to_thread.run_sync(lambda: check_data_normality(**params))
                if isinstance(result, str):
                    result = json.loads(result)
                return [types.TextContent(type="text", text=json.dumps(result))]

            if name == "health":
                return [types.TextContent(type="text", text=json.dumps({"status": "healthy"}))]

            if name == "api_schema":
                # Provide a lightweight schema description
                schema = {
                    "title": "Brain Network Analysis ADK API",
                    "tools": [t.name for t in await list_tools()],
                }
                return [types.TextContent(type="text", text=json.dumps(schema))]

            raise ValueError(f"Unknown tool: {name}")

        except Exception as e:
            logger.exception("Error in call_tool")
            # Return an error payload
            return [types.TextContent(type="text", text=json.dumps({"error": str(e)}))]

    @app.list_tools()
    async def list_tools() -> list[types.Tool]:
        """Return tool metadata for clients to discover available tools."""
        tools: list[types.Tool] = [
            types.Tool(
                name="run_cfc_wavelet_analysis",
                description="Run cross-frequency coupling wavelet analysis",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_path": {"type": "string", "description": "Path or uploaded reference (e.g., uploaded_bold)"},
                        "window_size": {"type": "integer", "minimum": 10, "maximum": 1000},
                        "step_size": {"type": "integer", "minimum": 30, "maximum": 500},
                        "padding": {"type": "boolean"},
                        "ratio": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "wavelets_num": {"type": "integer", "minimum": 1, "maximum": 100},
                        "beta": {"type": "number"},
                        "gamma": {"type": "number"},
                        "max_iter": {"type": "integer", "minimum": 1, "maximum": 1000},
                        "node_select": {"type": "integer", "minimum": 1},
                    },
                    "required": ["data_path"],
                },
            ),
            types.Tool(
                name="run_hub_detection",
                description="Detect hub nodes in brain networks",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_path": {"type": "string", "description": "Path or uploaded reference"},
                        "window_size": {"type": "integer", "minimum": 10, "maximum": 1000},
                        "step_size": {"type": "integer", "minimum": 1, "maximum": 500},
                        "padding": {"type": "boolean"},
                        "ratio": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "k": {"type": "integer", "minimum": 1, "maximum": 100},
                        "hub_num": {"type": "integer", "minimum": 1},
                        "use_group": {"type": "boolean"},
                    },
                    "required": ["data_path"],
                },
            ),
            types.Tool(
                name="get_growth_curve",
                description="Load growth curve data for a phenotype",
                inputSchema={
                    "type": "object",
                    "properties": {"phenotype": {"type": "string", "description": "Phenotype name (e.g., 'Global mean of FC')"}},
                    "required": ["phenotype"],
                },
            ),
            types.Tool(
                name="run_normative_analysis",
                description="Run normative developmental trajectory analysis",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "x_phenotype": {"type": "string", "description": "Phenotype name"},
                        "y_path": {"type": "string", "description": "Path or uploaded reference to overlay CSV"},
                        "age_col": {"type": "string", "description": "Column name for age"},
                        "val_col": {"type": "string", "description": "Column name for metric values"},
                    },
                    "required": ["x_phenotype", "y_path", "age_col", "val_col"],
                },
            ),
            types.Tool(
                name="search_pubmed",
                description="Search PubMed via NCBI E-utilities",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "PubMed query string"},
                        "max_results": {"type": "integer", "minimum": 1, "maximum": 200},
                        "year_from": {"type": "integer"},
                        "year_to": {"type": "integer"},
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name="openalex_search",
                description="Search OpenAlex works",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "OpenAlex query"},
                        "max_results": {"type": "integer", "minimum": 1, "maximum": 50},
                        "from_year": {"type": "integer"},
                        "to_year": {"type": "integer"},
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name="crossref_enrich",
                description="Enrich DOIs via Crossref",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "dois": {"type": "array", "items": {"type": "string"}},
                        "max_items": {"type": "integer", "minimum": 1, "maximum": 200},
                    },
                    "required": ["dois"],
                },
            ),
            types.Tool(
                name="internet_search",
                description="Combined OpenAlex + Crossref search",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer", "minimum": 1, "maximum": 50},
                        "from_year": {"type": "integer"},
                        "to_year": {"type": "integer"},
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name="openneuro_search",
                description="Search OpenNeuro datasets",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer", "minimum": 1, "maximum": 50},
                        "modality": {"type": "string"},
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name="upload_file",
                description="Upload a file (base64 content + filename)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "filename": {"type": "string"},
                        "content": {"type": "string", "description": "Base64-encoded file contents"},
                    },
                    "required": ["filename", "content"],
                },
            ),
            types.Tool(
                name="list_files",
                description="List uploaded files",
                inputSchema={"type": "object"},
            ),
            types.Tool(
                name="delete_file",
                description="Delete an uploaded file",
                inputSchema={
                    "type": "object",
                    "properties": {"filename": {"type": "string"}},
                    "required": ["filename"],
                },
            ),
            types.Tool(
                name="run_correlation",
                description="Pearson correlation between two variables",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_source": {"type": "string", "description": "JSON string or CSV path"},
                        "var1": {"type": "string"},
                        "var2": {"type": "string"},
                    },
                    "required": ["data_source", "var1", "var2"],
                },
            ),
            types.Tool(
                name="run_group_comparison",
                description="Compare two groups (t-test or Mann-Whitney)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_source": {"type": "string", "description": "JSON string or CSV path"},
                        "group_col": {"type": "string"},
                        "metric_col": {"type": "string"},
                        "group_a": {"type": "string"},
                        "group_b": {"type": "string"},
                        "method": {"type": "string", "enum": ["ttest", "mannwhitney"]},
                    },
                    "required": ["data_source", "group_col", "metric_col", "group_a", "group_b"],
                },
            ),
            types.Tool(
                name="apply_fdr_correction",
                description="Apply Benjamini-Hochberg FDR correction",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "p_values": {"type": "array", "items": {"type": "number"}},
                    },
                    "required": ["p_values"],
                },
            ),
            types.Tool(
                name="detect_outliers",
                description="Detect outliers using Z-score",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_source": {"type": "string", "description": "JSON string or CSV path"},
                        "column": {"type": "string"},
                    },
                    "required": ["data_source", "column"],
                },
            ),
            types.Tool(
                name="check_data_normality",
                description="Check normality with Shapiro-Wilk test",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data_source": {"type": "string", "description": "JSON string or CSV path"},
                        "column": {"type": "string"},
                    },
                    "required": ["data_source", "column"],
                },
            ),
            types.Tool(
                name="health",
                description="Health check",
                inputSchema={"type": "object"},
            ),
            types.Tool(
                name="api_schema",
                description="API schema discovery",
                inputSchema={"type": "object"},
            ),
        ]
        return tools

    return app


def main(port: int = 8080, json_response: bool = False):
    """Main server function to run the ADK-style streamable HTTP server."""
    logging.basicConfig(level=logging.INFO)

    app = create_mcp_server()

    session_manager = StreamableHTTPSessionManager(
        app=app,
        event_store=None,
        json_response=json_response,
        stateless=True,
    )

    async def handle_streamable_http(scope: Scope, receive: Receive, send: Send) -> None:
        await session_manager.handle_request(scope, receive, send)

    @contextlib.asynccontextmanager
    async def lifespan(starlette_app: Starlette) -> AsyncIterator[None]:
        async with session_manager.run():
            logger.info("MCP Streamable HTTP server started!")
            try:
                yield
            finally:
                logger.info("MCP server shutting down...")

    starlette_app = Starlette(
        debug=False,
        routes=[
            Mount("/mcp", app=handle_streamable_http),
        ],
        lifespan=lifespan,
    )

    import uvicorn
    uvicorn.run(starlette_app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    import sys
    main(port=int(sys.argv[1]) if len(sys.argv) > 1 else 8010)
