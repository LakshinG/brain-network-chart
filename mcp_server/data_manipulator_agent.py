import json
import re
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from agent_client import OllamaLLM

class ManipulationRequest(BaseModel):
    """Input payload from the frontend or planner agent"""
    user_query: str
    available_files: list[str] = Field(..., description="List of dataset file paths currently available to the user.")

class ManipulationResult(BaseModel):
    """Output sent back to the network to execute the tool"""
    tool_to_call: str = Field(..., description="The exact name of the MCP tool to execute (e.g., 'merge_datasets').")
    parameters: dict = Field(..., description="The JSON parameters to pass into the tool.")
    explanation: str = Field(..., description="Brief explanation of what the agent decided to do.")

class DataManipulatorAgent:
    def __init__(self, llm_client):
        self.llm = llm_client

    def plan_manipulation(self, user_query: str, available_files: list[str]) -> ManipulationResult:
        
        system_prompt = (
            "You are a Senior Data Engineering Agent.\n"
            "Your Job: Listen to the user's request and decide how to manipulate their datasets.\n"
            "Currently, you have access to the following tools:\n"
            "1. 'merge_datasets' (Parameters: file_paths (list of strings), output_filename (string))\n"
            "You must return ONLY a JSON object."
        )

        user_prompt = f"""
        ### TASK
        Determine which data manipulation tool to call based on the user's query.

        **User Query:** "{user_query}"
        **Available Files:** {available_files}

        ### REQUIRED OUTPUT FORMAT (JSON ONLY)
        {{
            "tool_to_call": "merge_datasets",
            "parameters": {{
                "file_paths": ["file_A.csv", "file_B.csv"],
                "output_filename": "merged_output.csv"
            }},
            "explanation": "Merging file A and B based on the user request."
        }}
        """

        # Call the LLM 
        try:
            raw_response = self.llm.generate_text(user_prompt, system=system_prompt)
            return self._clean_and_parse(raw_response)
        except Exception as e:
            return ManipulationResult(
                tool_to_call="error", 
                parameters={}, 
                explanation=f"LLM Error: {str(e)}"
            )

    def _clean_and_parse(self, raw_text: str) -> ManipulationResult:
        """Helper to extract JSON from LLM chatter."""
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not match:
            return ManipulationResult(tool_to_call="error", parameters={}, explanation="Agent returned invalid JSON.")
        
        try:
            data = json.loads(match.group(0))
            return ManipulationResult(**data)
        except Exception:
            return ManipulationResult(tool_to_call="error", parameters={}, explanation="JSON parsing failed.")

# Mock Client for offline testing
class MockOllamaLLM:
    def __init__(self, host, model):
        print(f"Offline Mode: Simulating {model}...")

    def generate_text(self, prompt, system=None):
        return '{"tool_to_call": "merge_datasets", "parameters": {"file_paths": ["test1.csv", "test2.csv"], "output_filename": "merged.csv"}, "explanation": "Simulation Mode"}'

app = FastAPI(title="Data Manipulator Agent Server")

# Initialize the LLM Client
try:
    print("Attempting connection to LLM...")
    llm = OllamaLLM(
        host='http://localhost:11434', # Standard local Ollama port
        model='qwen3:latest' # Using the general model specified in README
    )
    llm.client.list() 
    print("Connected to LLM!")
except Exception as e:
    print(f"Connection Failed: {e}")
    print("Switching to MOCK MODE.")
    llm = MockOllamaLLM(host='fake', model='fake')

agent = DataManipulatorAgent(llm)

@app.post("/manipulate", response_model=ManipulationResult)
async def manipulate_endpoint(request: ManipulationRequest):
    """
    Endpoint for the UI or Orchestrator to call.
    Usage: POST http://localhost:8015/manipulate
    """
    print(f"Received data manipulation request: {request.user_query}")
    result = agent.plan_manipulation(request.user_query, request.available_files)
    return result

if __name__ == "__main__":
    # The team's ports: Planner=8011, Executor=8012, Researcher=9013, Validator=8014. 
    # Use 8015 for the Manipulator
    print("Starting Data Manipulator A2A Server on Port 8015")
    uvicorn.run(app, host="0.0.0.0", port=8015)