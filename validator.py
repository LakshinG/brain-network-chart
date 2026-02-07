import json
import re
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from agent_client import OllamaLLM

# Dynamic Tool Import
try:
    from mcp_server import search_pubmed
    HAS_PUBSEARCH = True
    print("PubSearch Tool Loaded: Validator can now check facts against literature.")
except ImportError:
    HAS_PUBSEARCH = False
    print("PubSearch Tool NOT found in mcp_server.py. Validator running in 'Logic-Only' mode.")

# Define Data Models (Pydantic) 

class ValidationRequest(BaseModel):
    """Input payload from other agents"""
    original_query: str
    analysis_result: str
    tool_used: str

class ValidationResult(BaseModel):
    """Output sent back to the network"""
    is_valid: bool = Field(..., description="True if the result is logically and scientifically sound.")
    feedback: str = Field(..., description="Specific instructions on what is missing or wrong.")
    score: int = Field(..., description="Confidence score 1-10.")

# The Validation Agent Logic 

class ValidationAgent:
    def __init__(self, llm_client):
        self.llm = llm_client

    def validate(self, original_query: str, analysis_result: str, tool_name: str) -> ValidationResult:
        
        # Gather context 
        context_messages = []
        
        if HAS_PUBSEARCH:
            print(f"Cross-referencing claim with PubMed for query: '{original_query}'.")
            try:
                pub_data = search_pubmed(query=original_query, max_results=3)
                
                if isinstance(pub_data, dict) and pub_data.get("count_returned", 0) > 0:
                    context_messages.append(f"--- RELEVANT PUBMED ABSTRACTS ---\n{json.dumps(pub_data.get('results', []), indent=2)}")
                else:
                    context_messages.append("--- PUBMED SEARCH ---: No relevant papers found.")
                    
            except Exception as e:
                print(f"PubMed Search Failed: {e}")
                context_messages.append(f"SYSTEM NOTE: External literature search failed (Error: {str(e)}). Validate based on logic only.")

        literature_context = "\n\n".join(context_messages) if context_messages else "No external literature context available."
 
        system_prompt = (
            "You are a Senior Research Supervisor reviewing statistical analysis results.\n"
            "Your Job: Ensure scientific rigor, logical consistency, and factual accuracy.\n"
            "You must return ONLY a JSON object."
        )

        user_prompt = f"""
        ### TASK
        Review the following analysis result against the user's original query and the provided literature context.

        **User Query:** "{original_query}"
        **Tool Used:** "{tool_name}"
        **Analysis Result:** {analysis_result}

        ### EXTERNAL CONTEXT (For Fact/Novelty Checking)
        {literature_context}

        ### VALIDATION CHECKLIST
        1. **Logical Consistency:** - Does the p-value match the significance claim? (e.g., p > 0.05 is NOT significant).
           - Do the degrees of freedom or sample sizes look realistic?
        2. **Relevance:** - Does the result directly answer the User Query?
        3. **Literature Check (If context exists):**
           - Does this result contradict well-known facts in the provided abstracts?
           - Is this result a known finding?

        ### REQUIRED OUTPUT FORMAT (JSON ONLY)
        {{
            "is_valid": true/false,
            "feedback": "Concise explanation. If invalid, point out the logic error (e.g. 'p-value 0.55 is not significant'). If valid, mention if it aligns with literature.",
            "score": 1-10
        }}
        """

        # Call the LLM 
        try:
            raw_response = self.llm.generate_text(user_prompt, system=system_prompt)
            return self._clean_and_parse(raw_response)
        except Exception as e:
            # Fallback if the LLM crashes 
            if isinstance(raw_response, str): 
                 return self._clean_and_parse(raw_response)
            return ValidationResult(is_valid=False, feedback=f"LLM Validation Error: {str(e)}", score=0)

    def _clean_and_parse(self, raw_text: str) -> ValidationResult:
        """Helper to extract JSON from LLM chatter."""
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not match:
            return ValidationResult(is_valid=False, feedback="Agent returned invalid JSON format.", score=0)
        
        try:
            data = json.loads(match.group(0))
            return ValidationResult(**data)
        except Exception:
            return ValidationResult(is_valid=False, feedback="JSON parsing failed.", score=0)

# Mock Client 
class MockOllamaLLM:
    def __init__(self, host, model):
        print(f"OFFLINE MODE: Simulating {model}...")

    def generate_text(self, prompt, system=None):
        return '{"is_valid": true, "feedback": "PASSED (Simulation Mode)", "score": 9}'

app = FastAPI(title="Validation Agent Server")

# Initialize the Validation Agent
try:
    print("Attempting connection to UNC server through SSH Tunnel...")
    
    llm = OllamaLLM(
        host='http://localhost:12345', 
        model='Huzderu/txgemma-27B-chat-Q8_0_GGUF:latest'
    )
    
    llm.client.list() 
    print("Connected to Real Server (through SSH Tunnel)!")
except Exception as e:
    print(f"Connection Failed: {e}")
    print("Switching to MOCK MODE.")
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
    print("Starting Validation A2A Server on Port 8014")
    uvicorn.run(app, host="0.0.0.0", port=8014)