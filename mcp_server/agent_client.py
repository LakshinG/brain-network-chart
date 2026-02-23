"""
Agent Client for Brain Network Analysis MCP Server

This module demonstrates an intelligent agent that uses Ollama LLM to reason
about which analysis tools to invoke on the MCP server. The agent can:
- Decide which analysis to run based on user goals
- Extract parameters from natural language
- Execute analyses and interpret results
- Chain multiple analyses together

Installation:
    pip install requests pydantic ollama

Usage:
    export MCP_API_KEY='your-api-key'
    export OLLAMA_HOST='http://yukon.acm.unc.edu:11434'
    python agent_client.py
"""

import requests
import json
import os
import sys
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum
import time

# Ollama integration
try:
    from ollama import Client
except ImportError:
    print("Error: ollama package not installed. Install with: pip install ollama")
    sys.exit(1)

# Configuration
MCP_BASE_URL = "http://yukon.acm.unc.edu:8010"
OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://yukon.acm.unc.edu:11434')
MODEL_NAME = "MedAIBase/MedGemma1.5:4b"
MCP_API_KEY = os.getenv('MCP_API_KEY', 'default-key-change-in-production')

# Initialize Ollama client
ollama_client = Client(host=OLLAMA_HOST)


# Pydantic Models
class AnalysisType(str, Enum):
    """Available analysis types."""
    CFC_WAVELET = "cfc_wavelet"
    HUB_DETECTION = "hub_detection"
    GROWTH_CURVE = "growth_curve"
    NORMATIVE = "normative"
    UNKNOWN = "unknown"


class ToolCall(BaseModel):
    """Model for a tool call decision."""
    tool_name: AnalysisType = Field(description="Which analysis tool to use")
    reasoning: str = Field(description="Why this tool was chosen")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters for the tool")
    
    class Config:
        use_enum_values = True


class AgentState(BaseModel):
    """Model representing agent execution state."""
    user_goal: str = Field(description="The user's stated goal")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    llm_reasoning: str = Field(default="", description="LLM reasoning process")
    tool_calls: List[ToolCall] = Field(default_factory=list, description="Tools to execute")
    results: List[Dict[str, Any]] = Field(default_factory=list, description="Results from tool execution")
    status: str = Field(default="pending", description="Execution status")
    error_messages: List[str] = Field(default_factory=list, description="Any errors encountered")


class AgentResponse(BaseModel):
    """Model for agent final response."""
    state: AgentState
    summary: str = Field(description="Summary of what was done")
    recommendations: List[str] = Field(default_factory=list, description="Recommended next steps")
    success: bool = Field(description="Whether agent succeeded")


# Ollama LLM Integration
class OllamaLLM:
    """Wrapper for Ollama LLM interactions."""
    
    def __init__(self, host: str = OLLAMA_HOST, model: str = MODEL_NAME):
        self.host = host
        self.model = model
        self.client = Client(host=host)
        self._test_connection()
    
    def _test_connection(self):
        """Test connection to Ollama server."""
        try:
            # Try to get model info
            response = self.client.show(self.model)
            print(f"✓ Connected to Ollama at {self.host}")
            print(f"✓ Model '{self.model}' available")
        except Exception as e:
            print(f"✗ Error connecting to Ollama: {str(e)}")
            print(f"  Make sure Ollama is running at {self.host}")
            print(f"  And model '{self.model}' is available")
            raise
    
    def generate_text(self, prompt: str, system: str = None, max_tokens: int = 500) -> str:
        """Generate text using Ollama."""
        try:
            response = self.client.generate(
                model=self.model,
                prompt=prompt,
                system=system,
                stream=False,
                options={
                    "temperature": 0.3,  # Lower temp for more deterministic output
                    "top_p": 0.9,
                    "top_k": 40,
                }
            )
            return response['response'].strip()
        except Exception as e:
            raise RuntimeError(f"Ollama generation failed: {str(e)}")
    
    def decide_tool(self, user_goal: str) -> ToolCall:
        """Decide which tool to use based on user goal."""
        system_prompt = """You are an AI agent helping with brain network analysis. 
Analyze the user's goal and decide which tool to use.

Available tools:
1. cfc_wavelet - For cross-frequency coupling analysis using harmonic wavelets
2. hub_detection - For identifying hub nodes in brain networks
3. growth_curve - For loading developmental growth curve data
4. normative - For normative developmental trajectory analysis

Respond ONLY with a JSON object:
{
    "tool_name": "<cfc_wavelet|hub_detection|growth_curve|normative|unknown>",
    "reasoning": "<brief explanation of why>",
    "parameters": {<relevant parameters>}
}"""
        
        prompt = f"User goal: {user_goal}\n\nDecide which tool to use and provide parameters."
        
        try:
            response_text = self.generate_text(prompt, system=system_prompt)
            
            # Extract JSON from response
            try:
                # Try to find JSON in response
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start >= 0 and end > start:
                    json_str = response_text[start:end]
                    tool_data = json.loads(json_str)
                else:
                    # Default to unknown if no JSON found
                    tool_data = {
                        "tool_name": "unknown",
                        "reasoning": response_text[:200],
                        "parameters": {}
                    }
            except json.JSONDecodeError:
                tool_data = {
                    "tool_name": "unknown",
                    "reasoning": response_text[:200],
                    "parameters": {}
                }
            
            return ToolCall(**tool_data)
        except Exception as e:
            print(f"Error in tool decision: {str(e)}")
            return ToolCall(
                tool_name="unknown",
                reasoning=f"Error: {str(e)}",
                parameters={}
            )
    
    def interpret_results(self, tool_name: str, results: Dict[str, Any]) -> str:
        """Interpret analysis results using LLM."""
        system_prompt = """You are an expert in brain network analysis. 
Analyze the provided results and give a brief, clear interpretation.
Focus on what the results mean and any notable findings."""
        
        prompt = f"""Tool: {tool_name}
Results: {json.dumps(results, indent=2, default=str)[:1000]}

Provide a brief interpretation of these results."""
        
        try:
            return self.generate_text(prompt, system=system_prompt, max_tokens=300)
        except Exception as e:
            return f"Could not interpret results: {str(e)}"


# MCP Server Client
class MCPClient:
    """Client for interacting with the MCP server."""
    
    def __init__(self, base_url: str = MCP_BASE_URL, api_key: str = MCP_API_KEY):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    
    def _request(self, endpoint: str, params: Dict[str, Any], timeout: int = 300) -> Dict[str, Any]:
        """Make HTTP request to MCP server."""
        url = f"{self.base_url}/{endpoint}"
        try:
            response = requests.post(url, json=params, headers=self.headers, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                return {"status": "error", "error": "Unauthorized - check MCP_API_KEY"}
            elif e.response.status_code == 429:
                return {"status": "error", "error": "Rate limited - wait before retrying"}
            else:
                return {"status": "error", "error": f"HTTP {e.response.status_code}"}
        except requests.exceptions.ConnectionError:
            return {"status": "error", "error": f"Cannot connect to {self.base_url}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    def run_cfc_wavelet(self, data_path: str = "data_example_BOLD.csv", 
                        window_size: int = 100, step_size: int = 90) -> Dict[str, Any]:
        """Run CFC wavelet analysis."""
        params = {
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "padding": True,
            "ratio": 0.8,
            "wavelets_num": 10,
            "beta": 1.0,
            "gamma": 0.005,
            "max_iter": 100,
        }
        return self._request("run_cfc_wavelet_analysis", params)
    
    def run_hub_detection(self, data_path: str = "data_example_BOLD.csv",
                         window_size: int = 100, step_size: int = 90,
                         k: int = 2, hub_num: int = 10) -> Dict[str, Any]:
        """Run hub detection analysis."""
        params = {
            "data_path": data_path,
            "window_size": window_size,
            "step_size": step_size,
            "padding": True,
            "ratio": 0.8,
            "k": k,
            "hub_num": hub_num,
            "use_group": False,
        }
        return self._request("run_hub_detection", params)
    
    def get_growth_curve(self, phenotype: str = "Global mean of FC") -> Dict[str, Any]:
        """Get growth curve data."""
        params = {"phenotype": phenotype}
        return self._request("get_growth_curve", params)
    
    def run_normative_analysis(self, y_path: str, age_col: str, 
                              val_col: str, phenotype: str = "Global mean of FC") -> Dict[str, Any]:
        """Run normative analysis."""
        params = {
            "x_phenotype": phenotype,
            "y_path": y_path,
            "age_col": age_col,
            "val_col": val_col,
        }
        return self._request("run_normative_analysis", params)


# Brain Network Analysis Agent
class BrainNetworkAgent:
    """Intelligent agent for brain network analysis."""
    
    def __init__(self, llm: OllamaLLM = None, mcp_client: MCPClient = None):
        self.llm = llm or OllamaLLM()
        self.mcp_client = mcp_client or MCPClient()
    
    def execute(self, user_goal: str) -> AgentResponse:
        """Execute agent to achieve user goal."""
        print(f"\n{'='*60}")
        print(f"AGENT EXECUTION")
        print(f"{'='*60}")
        print(f"Goal: {user_goal}\n")
        
        state = AgentState(user_goal=user_goal)
        
        try:
            # Step 1: Decide which tool to use
            print("[1/3] Deciding which tool to use...")
            tool_call = self.llm.decide_tool(user_goal)
            state.tool_calls.append(tool_call)
            state.llm_reasoning = tool_call.reasoning
            print(f"      Tool: {tool_call.tool_name}")
            print(f"      Reasoning: {tool_call.reasoning}\n")
            
            # Step 2: Execute the tool
            if tool_call.tool_name == "unknown":
                state.status = "failed"
                state.error_messages.append("Could not determine which tool to use")
                summary = "Agent could not understand the goal and determine appropriate tool."
            else:
                print(f"[2/3] Executing {tool_call.tool_name}...")
                result = self._execute_tool(tool_call.tool_name, tool_call.parameters)
                state.results.append(result)
                
                if result.get("status") == "error":
                    state.status = "failed"
                    state.error_messages.append(result.get("error", "Unknown error"))
                    summary = f"Tool execution failed: {result.get('error')}"
                else:
                    print(f"      Status: {result.get('status')}")
                    print(f"      Execution time: {result.get('elapsed_seconds', 'N/A')}s\n")
                    
                    # Step 3: Interpret results
                    print("[3/3] Interpreting results...")
                    interpretation = self.llm.interpret_results(tool_call.tool_name, result)
                    print(f"      {interpretation}\n")
                    
                    state.status = "success"
                    summary = interpretation
            
            # Generate recommendations
            recommendations = self._generate_recommendations(tool_call.tool_name, state.results)
            
            response = AgentResponse(
                state=state,
                summary=summary,
                recommendations=recommendations,
                success=(state.status == "success")
            )
            
            self._print_summary(response)
            return response
            
        except Exception as e:
            state.status = "error"
            state.error_messages.append(str(e))
            return AgentResponse(
                state=state,
                summary=f"Agent execution error: {str(e)}",
                success=False
            )
    
    def _execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a specific tool."""
        # Use provided parameters or defaults
        if tool_name == "cfc_wavelet":
            return self.mcp_client.run_cfc_wavelet(
                data_path=parameters.get("data_path", "data_example_BOLD.csv"),
                window_size=parameters.get("window_size", 100),
                step_size=parameters.get("step_size", 90),
            )
        elif tool_name == "hub_detection":
            return self.mcp_client.run_hub_detection(
                data_path=parameters.get("data_path", "data_example_BOLD.csv"),
                window_size=parameters.get("window_size", 100),
                step_size=parameters.get("step_size", 90),
                k=parameters.get("k", 2),
                hub_num=parameters.get("hub_num", 10),
            )
        elif tool_name == "growth_curve":
            return self.mcp_client.get_growth_curve(
                phenotype=parameters.get("phenotype", "Global mean of FC")
            )
        elif tool_name == "normative":
            return self.mcp_client.run_normative_analysis(
                y_path=parameters.get("y_path", "data_example_BrainChart.csv"),
                age_col=parameters.get("age_col", "age"),
                val_col=parameters.get("val_col", "value"),
                phenotype=parameters.get("phenotype", "Global mean of FC"),
            )
        else:
            return {"status": "error", "error": f"Unknown tool: {tool_name}"}
    
    def _generate_recommendations(self, tool_name: str, results: List[Dict[str, Any]]) -> List[str]:
        """Generate recommendations based on tool and results."""
        recommendations = []
        
        if tool_name == "cfc_wavelet":
            recommendations.append("Follow with hub detection to identify key network nodes")
            recommendations.append("Compare CFC patterns across different conditions if available")
        elif tool_name == "hub_detection":
            recommendations.append("Visualize the identified hub nodes in network diagram")
            recommendations.append("Validate hubs using anatomical or functional atlases")
        elif tool_name == "growth_curve":
            recommendations.append("Run normative analysis with subject data for comparison")
            recommendations.append("Examine deviations from growth curves in your dataset")
        elif tool_name == "normative":
            recommendations.append("Identify subjects with significant deviations from normative curves")
            recommendations.append("Correlate deviations with clinical outcomes")
        
        return recommendations
    
    def _print_summary(self, response: AgentResponse):
        """Print execution summary."""
        print(f"{'='*60}")
        print(f"EXECUTION SUMMARY")
        print(f"{'='*60}")
        print(f"Status: {response.state.status.upper()}")
        print(f"Summary: {response.summary}\n")
        
        if response.recommendations:
            print("Recommended next steps:")
            for i, rec in enumerate(response.recommendations, 1):
                print(f"  {i}. {rec}")
        
        if response.state.error_messages:
            print(f"\nErrors encountered:")
            for error in response.state.error_messages:
                print(f"  - {error}")
        
        print(f"{'='*60}\n")


# Example usage
def main():
    """Run agent with example goals."""
    
    print("\n" + "="*60)
    print("BRAIN NETWORK ANALYSIS AGENT")
    print("="*60)
    print(f"LLM: {MODEL_NAME} at {OLLAMA_HOST}")
    print(f"MCP Server: {MCP_BASE_URL}")
    print("="*60 + "\n")
    
    # Check API key
    if MCP_API_KEY == 'default-key-change-in-production':
        print("⚠️  WARNING: Using default API key. Set MCP_API_KEY environment variable.\n")
    
    # Initialize agent
    try:
        llm = OllamaLLM(host=OLLAMA_HOST, model=MODEL_NAME)
        agent = BrainNetworkAgent(llm=llm)
    except Exception as e:
        print(f"✗ Failed to initialize agent: {str(e)}")
        sys.exit(1)
    
    # Example goals
    example_goals = [
        "I want to analyze cross-frequency coupling in my brain connectivity data",
        "Find the hub nodes in my brain network",
        "Show me the typical developmental trajectory for brain connectivity",
    ]
    
    # Run agent for first goal
    if len(example_goals) > 0:
        response = agent.execute(example_goals[0])
        
        # Optionally run more
        print("\nAdditional example goals (commented out):")
        for i, goal in enumerate(example_goals[1:], 2):
            print(f"# response = agent.execute('{goal}')")
    
    # Interactive mode
    print("\n" + "="*60)
    print("INTERACTIVE MODE")
    print("="*60)
    print("Enter your brain network analysis goal (or 'quit' to exit):\n")
    
    while True:
        try:
            user_input = input("You: ").strip()
            if user_input.lower() in ('quit', 'exit', 'q'):
                print("Agent shutting down. Goodbye!")
                break
            if not user_input:
                continue
            
            response = agent.execute(user_input)
            
        except KeyboardInterrupt:
            print("\n\nAgent interrupted by user.")
            break
        except Exception as e:
            print(f"Error: {str(e)}")
            continue


if __name__ == "__main__":
    main()
