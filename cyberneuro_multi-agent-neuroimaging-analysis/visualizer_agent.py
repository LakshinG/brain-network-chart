import re
import asyncio
from typing import Optional, List
from dataclasses import dataclass

# ============================================================
# CONFIGURATION
# ============================================================

MAX_HTML_SIZE = 100000  # 100KB limit
MAX_OUTPUT_CHARS = 60000  # Default output limit
REQUIRED_ROOT_CLASS = "visualizationCard"

# Default model - change this to your preferred model
DEFAULT_MODEL = "llama3.1:8b"

# ============================================================
# DATA CLASSES
# ============================================================

@dataclass
class ValidationResult:
    """Result of HTML validation."""
    valid: bool
    error: Optional[str] = None
    warnings: Optional[List[str]] = None

@dataclass
class EditResult:
    """Result of visualization edit operation."""
    status: str  # "success" or "error"
    html: Optional[str] = None
    message: Optional[str] = None
    warnings: Optional[List[str]] = None

# ============================================================
# VALIDATION FUNCTIONS
# ============================================================

def validate_visualization_html(html: str, allow_external_images: bool = False) -> ValidationResult:
    """
    Validate HTML content meets visualization card requirements.
    """
    warnings: List[str] = []
    
    if not html or not isinstance(html, str):
        return ValidationResult(valid=False, error="HTML content is required")
    
    if len(html) > MAX_HTML_SIZE:
        return ValidationResult(
            valid=False, 
            error=f"HTML content exceeds maximum size limit ({MAX_HTML_SIZE} characters)"
        )
    
    if REQUIRED_ROOT_CLASS not in html:
        return ValidationResult(
            valid=False,
            error=f"Missing required .{REQUIRED_ROOT_CLASS} root element"
        )
    
    # Block external script sources
    external_script_pattern = re.compile(r'<script[^>]+src\s*=', re.IGNORECASE)
    if external_script_pattern.search(html):
        return ValidationResult(
            valid=False,
            error="External script sources (<script src=\"...\">) are not permitted"
        )
    
    # Block external stylesheets
    external_style_pattern = re.compile(r'<link[^>]+href\s*=\s*["\']https?:', re.IGNORECASE)
    if external_style_pattern.search(html):
        return ValidationResult(
            valid=False,
            error="External stylesheet links are not permitted"
        )
    
    # Warn about external images
    external_image_pattern = re.compile(r'<img[^>]+src\s*=\s*["\']https?:', re.IGNORECASE)
    if external_image_pattern.search(html):
        if not allow_external_images:
            warnings.append("Contains external image references")
    
    return ValidationResult(
        valid=True, 
        warnings=warnings if warnings else None
    )


def clean_llm_output(raw_output: str) -> str:
    """Clean LLM output by stripping markdown fences and extra whitespace."""
    cleaned = raw_output.strip()
    
    # Remove markdown code fences
    cleaned = re.sub(r'^```(?:html)?\s*\n?', '', cleaned)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    
    # Look for the start of HTML content
    html_start_match = re.search(r'<(?:!DOCTYPE|div|html)', cleaned, re.IGNORECASE)
    if html_start_match:
        cleaned = cleaned[html_start_match.start():]
    
    # Look for the end of HTML content
    html_end_match = re.search(r'</(?:div|html|body)>\s*$', cleaned, re.IGNORECASE)
    if html_end_match:
        cleaned = cleaned[:html_end_match.end()]
    
    return cleaned.strip()


def extract_visualization_card(html: str) -> Optional[str]:
    """Extract just the visualizationCard div from potentially larger HTML."""
    pattern = re.compile(
        r'(<div[^>]*class\s*=\s*["\'][^"\']*visualizationCard[^"\']*["\'][^>]*>)',
        re.IGNORECASE
    )
    match = pattern.search(html)
    
    if not match:
        return None
    
    start_pos = match.start()
    depth = 0
    i = start_pos
    
    while i < len(html):
        if html[i:i+4].lower() == '<div':
            depth += 1
            i += 4
        elif html[i:i+6].lower() == '</div>':
            depth -= 1
            if depth == 0:
                return html[start_pos:i+6]
            i += 6
        else:
            i += 1
    
    return None

# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """You are a visualization HTML editor. You modify visualization cards based on user requests.

## Output Rules
- Return ONLY the modified HTML. No explanations, no markdown fences, no commentary.
- Your output must start with `<div class="visualizationCard"` and end with `</div>`.

## Constraints
1. PRESERVE the root `<div class="visualizationCard">` wrapper — never remove or rename it.
2. NO external resources: no `<script src="...">`, no `<link href="http...">`, no `<img src="http...">`.
3. Inline scripts are allowed: `<script>` with code inside is OK.
4. Inline styles are allowed: `<style>` blocks and `style=""` attributes are OK.
5. Use the dark slate theme: backgrounds `#0f172a` to `#1e293b`, text `#e2e8f0` to `#94a3b8`, borders `#334155`.

## When Data is Missing
If the user requests information you don't have (statistics, values, specific data points):
- Do NOT invent numbers or data.
- Add a visible block: `<div class="data-needed">⚠️ Data Needed: [what's missing]</div>`
- Style it with amber/yellow warning colors (background: #422006, border: #92400e, text: #fde68a).

## Structure Convention
Use these semantic classes for consistency:
- `.vc-header` — title area
- `.vc-title` — main heading  
- `.vc-subtitle` — secondary text
- `.vc-body` — chart/content area
- `.vc-footer` — footnotes, sources
- `.vc-insight` — callout boxes for insights

## Color Palette
- Backgrounds: #0f172a (darkest), #1e293b (dark), #334155 (medium)
- Text: #f1f5f9 (bright), #e2e8f0 (normal), #94a3b8 (muted), #64748b (subtle)
- Borders: #334155 (normal), #475569 (hover)
- Accents: #6366f1 (indigo), #38bdf8 (sky), #f59e0b (amber)"""


async def call_ollama(
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 4096
) -> str:
    """Call Ollama API for HTML editing."""
    import ollama
    
    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        options={"num_predict": max_tokens}
    )
    
    return response['message']['content']

async def visualizer_edit_html(
    user_query: str,
    html: str,
    max_output_chars: int = MAX_OUTPUT_CHARS,
    model: str = DEFAULT_MODEL,
    provider: str = "ollama" 
) -> EditResult:
    """
    Edit a visualization HTML card based on user query.
    
    Args:
        user_query: The user's modification request
        html: Current HTML of the visualization card
        max_output_chars: Maximum characters in output
        model: Model name to use
        provider: LLM provider ("ollama")
        
    Returns:
        EditResult with status and modified HTML or error
    """
    # Validate input HTML
    input_validation = validate_visualization_html(html)
    if not input_validation.valid:
        return EditResult(
            status="error",
            message=f"Invalid input HTML: {input_validation.error}"
        )
    
    # Build the user prompt
    user_prompt = f"""User request: {user_query}

Current HTML:
{html}"""


    try:
        if provider == "ollama":
            raw_output = await call_ollama(
                user_prompt, 
                model=model, 
                max_tokens=max_output_chars // 4
            )
        else:
            return EditResult(
                status="error",
                message=f"Unknown provider: {provider}"
            )
            
    except ImportError as e:
        return EditResult(
            status="error",
            message=f"Missing dependency: {e}. Install with pip."
        )
    except Exception as e:
        return EditResult(
            status="error",
            message=f"LLM call failed: {str(e)}"
        )
    cleaned_html = clean_llm_output(raw_output)
    
    extracted = extract_visualization_card(cleaned_html)
    if extracted:
        cleaned_html = extracted
    
    output_validation = validate_visualization_html(cleaned_html)
    if not output_validation.valid:
        return EditResult(
            status="error",
            message=f"LLM produced invalid HTML: {output_validation.error}"
        )
    
    return EditResult(
        status="success",
        html=cleaned_html,
        warnings=output_validation.warnings
    )


def visualizer_edit_html_sync(
    user_query: str,
    html: str,
    max_output_chars: int = MAX_OUTPUT_CHARS,
    model: str = DEFAULT_MODEL,
    provider: str = "ollama"
) -> EditResult:
    """Synchronous wrapper for visualizer_edit_html."""
    return asyncio.run(visualizer_edit_html(
        user_query=user_query,
        html=html,
        max_output_chars=max_output_chars,
        model=model,
        provider=provider
    ))


def register_mcp_tool(server, provider: str = "ollama", model: str = DEFAULT_MODEL):
    """
    Register the visualizer_edit_html tool with an MCP server.
    
    Example:
        from mcp.server import Server
        server = Server("visualizer-agent")
        register_mcp_tool(server, provider="ollama", model="qwen2.5-coder:32b")
    """
    from mcp.types import TextContent
    
    @server.tool()
    async def visualizer_edit_html_tool(
        user_query: str,
        html: str,
        max_output_chars: int = MAX_OUTPUT_CHARS
    ) -> list:
        """
        Edit a visualization HTML card based on user instructions.
        
        Args:
            user_query: What changes to make to the visualization
            html: Current HTML (must contain .visualizationCard root)
            max_output_chars: Maximum output size (default 60000)
        """
        result = await visualizer_edit_html(
            user_query=user_query,
            html=html,
            max_output_chars=max_output_chars,
            model=model,
            provider=provider
        )
        
        if result.status == "success":
            response_text = result.html
            if result.warnings:
                response_text += f"\n\n<!-- Warnings: {', '.join(result.warnings)} -->"
            return [TextContent(type="text", text=response_text)]
        else:
            return [TextContent(type="text", text=f"Error: {result.message}")]



def create_fastapi_router(provider: str = "ollama", model: str = DEFAULT_MODEL):
    """
    Create a FastAPI router with the visualizer edit endpoint.
    
    Example:
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(create_fastapi_router(provider="ollama"))
    """
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    
    router = APIRouter(prefix="/api/visualizer", tags=["visualizer"])
    
    class EditRequest(BaseModel):
        user_query: str
        html: str
        max_output_chars: int = MAX_OUTPUT_CHARS
    
    class EditResponse(BaseModel):
        status: str
        html: Optional[str] = None
        message: Optional[str] = None
        warnings: Optional[List[str]] = None
    
    @router.post("/edit_html", response_model=EditResponse)
    async def edit_html_endpoint(request: EditRequest):
        """Edit a visualization HTML card based on user instructions."""
        result = await visualizer_edit_html(
            user_query=request.user_query,
            html=request.html,
            max_output_chars=request.max_output_chars,
            model=model,
            provider=provider
        )
        
        if result.status == "error":
            raise HTTPException(status_code=400, detail=result.message)
        
        return EditResponse(
            status=result.status,
            html=result.html,
            warnings=result.warnings
        )
    
    return router



STARTER_HTML = """<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-base text-center"></h3>
    <p class="vc-subtitle text-slate-400 text-xs text-center mt-1"></p>
  </div>
  <div class="vc-body mt-3">
    <div class="h-[280px] rounded-lg border border-slate-700 bg-slate-950 flex items-center justify-center text-slate-500">
    </div>
  </div>
</div>"""


def run_validation_tests():
    """Run basic validation tests."""
    print("Running validation tests...\n")
    
    # Test 1: Valid HTML
    result = validate_visualization_html(STARTER_HTML)
    assert result.valid, f"Test 1 failed: {result.error}"
    print("✓ Test 1: Valid HTML passes validation")
    
    # Test 2: Missing visualizationCard
    result = validate_visualization_html("<div>Hello</div>")
    assert not result.valid, "Test 2 failed: Should reject missing root"
    print("✓ Test 2: Rejects missing visualizationCard root")
    
    # Test 3: External script
    result = validate_visualization_html(
        '<div class="visualizationCard"><script src="http://evil.com/bad.js"></script></div>'
    )
    assert not result.valid, "Test 3 failed: Should reject external scripts"
    print("✓ Test 3: Rejects external script sources")
    
    # Test 4: Inline script allowed
    result = validate_visualization_html(
        '<div class="visualizationCard"><script>console.log("ok")</script></div>'
    )
    assert result.valid, f"Test 4 failed: {result.error}"
    print("✓ Test 4: Allows inline scripts")
    
    # Test 5: External stylesheet
    result = validate_visualization_html(
        '<div class="visualizationCard"><link href="https://evil.com/bad.css" rel="stylesheet"></div>'
    )
    assert not result.valid, "Test 5 failed: Should reject external stylesheets"
    print("✓ Test 5: Rejects external stylesheets")
    
    # Test 6: Clean LLM output
    messy_output = "```html\n<div class=\"visualizationCard\">test</div>\n```"
    cleaned = clean_llm_output(messy_output)
    assert cleaned == '<div class="visualizationCard">test</div>', f"Test 6 failed: {cleaned}"
    print("✓ Test 6: Cleans markdown fences from output")
    
    print("\nAll validation tests passed!")


async def quick_test(provider: str = "ollama", model: str = DEFAULT_MODEL):
    """Quick test of the edit function."""
    print(f"\nQuick test using {provider} with model '{model}'...")
    
    result = await visualizer_edit_html(
        user_query="Add a footer that says 'Source: UK Biobank'",
        html=STARTER_HTML,
        provider=provider,
        model=model
    )
    
    if result.status == "success":
        print("Success!")
        print(f"\nOutput HTML:\n{result.html}")
    else:
        print(f"Error: {result.message}")
    
    return result


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Run validation tests
        run_validation_tests()
    elif len(sys.argv) > 1 and sys.argv[1] == "--quick":
        # Run quick LLM test
        provider = sys.argv[2] if len(sys.argv) > 2 else "ollama"
        model = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_MODEL
        asyncio.run(quick_test(provider, model))
    else:
        print("Usage:")
        print("  python visualizer_agent.py --test              # Run validation tests")
        print("  python visualizer_agent.py --quick             # Quick LLM test (Ollama)")
