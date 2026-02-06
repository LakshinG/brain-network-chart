import json
import re
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from agent_client import OllamaLLM

#1 Data Models
class ValidationRequest(BaseModel):
    """Input payload from other agents"""
    original_query: str
    analysis_result: str
    tool_used: str

class ValidationResult(BaseModel):
    """Output sent back to the network"""
    is_valid: bool = Field(..., description="True if the result DIRECTLY answers the query.")
    feedback: str = Field(..., description="Specific instructions on what is missing.")
    score: int = Field(..., description="Confidence score 1-10.")

# 2  Validation Agent Logic

class ValidationAgent:
    def __init__(self, llm_client):
        self.llm = llm_client

    def validate(self, original_query: str, analysis_result: str, tool_name: str) -> ValidationResult:
        # Check formatting and logic with agent
        
        system_prompt = (
            "You are a Senior Research Supervisor reviewing statistical analysis results.\n"
            "Your job is to ensure scientific rigor and logical consistency.\n"
            "You must return ONLY a JSON object."
        )

        user_prompt = f"""
        ### TASK
        Review the following analysis result against the user's original query.

        User Query: "{original_query}"
        Tool Used: "{tool_name}"
        Result Data: {analysis_result}

        ### VALIDATION CRITERIA (CHECK THESE STRICTLY)
        1. **Relevance:** Does the result directly answer the specific variables in the query?
        2. **Logical Consistency:** If the result says "Significant", is the p-value actually < 0.05? 
        3. **Appropriateness:** Does the tool used make sense for the query? (e.g., Don't use a T-Test for correlation).

        ### REQUIRED OUTPUT FORMAT (JSON ONLY)
        {{
            "is_valid": true/false,
            "feedback": "If invalid, explain the scientific or logical error. If valid, confirm the finding.",
            "score": 1-10
        }}
        """

        try:
            raw_response = self.llm.generate_text(user_prompt, system=system_prompt)
            return self._clean_and_parse(raw_response)
        except Exception as e:
            if isinstance(raw_response, str):
                 return self._clean_and_parse(raw_response)
            return ValidationResult(is_valid=False, feedback=f"Validation Error: {str(e)}", score=0)

    def _clean_and_parse(self, raw_text: str) -> ValidationResult:
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not match:
            return ValidationResult(is_valid=False, feedback="Invalid JSON format.", score=0)
        
        try:
            data = json.loads(match.group(0))
            return ValidationResult(**data)
        except Exception:
            return ValidationResult(is_valid=False, feedback="JSON parsing failed.", score=0)

#  Mock Client incase server connectoin fails (For Offline Dev)
class MockOllamaLLM:
    def __init__(self, host, model):
        print(f"Offline Mode: Simulating {model}.")

    def generate_text(self, prompt, system=None):
        return '{"is_valid": true, "feedback": "PASSED (Simulation)", "score": 9}'

app = FastAPI(title="Validation Agent Server")

# Initialize Agent (With Auto Mock Fallback)
try:
    print("Attempting connection to UNC server through the SSH Tunnel")

    llm = OllamaLLM(
        host='http://localhost:12345', 
        model='Huzderu/txgemma-27B-chat-Q8_0_GGUF:latest'
    )
    
    llm.client.list()
    print("Connected to Real Server!")
except Exception as e:
    print(f"Connection Failed: {e}")
    print(" TemporarilySwitching to Mock mode to avoid crashes and continue development.")
    llm = MockOllamaLLM(host='fake', model='fake')

agent = ValidationAgent(llm)

@app.post("/validate", response_model=ValidationResult)
async def validate_endpoint(request: ValidationRequest):
    """
    Endpoint for other agents to call.
    Usage: POST http://localhost:8014/validate
    """
    print(f"Received validation request for: {request.tool_used}")
    result = agent.validate(request.original_query, request.analysis_result, request.tool_used)
    return result

if __name__ == "__main__":
    print("Starting Validation of the A2A Server on Port 8014")
    uvicorn.run(app, host="0.0.0.0", port=8014)