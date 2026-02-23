#!/usr/bin/env python3
"""
Simple Orchestrator: Uses OpenAI-compatible client directly with Ollama,
executing Planner->Executor->Researcher->Validator pipeline.
"""

import asyncio
from openai import AsyncOpenAI
import sys

# Configuration
OLLAMA_HOST = "yukon.acm.unc.edu:11434"
MODEL_NAME = "MedAIBase/MedGemma1.5:4b"
OLLAMA_BASE_URL = f"http://{OLLAMA_HOST}"

client = AsyncOpenAI(
    api_key="sk-anything",  # Ollama doesn't validate
    base_url=f"{OLLAMA_BASE_URL}/v1"
)


async def call_agent(role: str, system_prompt: str, user_message: str) -> str:
    """Call an agent via OpenAI-compatible API."""
    try:
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=800,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"ERROR: {str(e)}"


async def orchestrate(user_query: str):
    """Run the full pipeline: Planner -> Executor -> Researcher -> Validator"""
    
    print("\n" + "="*80)
    print("ORCHESTRATOR PIPELINE")
    print("="*80)
    print(f"Query: {user_query}\n")

    # Step 1: PLANNER
    print("▶ STEP 1: PLANNER (Creating execution plan)\n")
    planner_system = """You are a planning agent for brain network and fMRI analysis. Given a query, create a brief and clear 
execution plan with 3 main steps:
1. Step 1 (Executor): Describe what analysis tools (connectivity, hub detection, CFC wavelet, growth curves, normative modeling) and data processing should happen
2. Step 2 (Researcher): Describe what literature searches (PubMed) and statistical validation should happen. Skip if no literature search is needed.
3. Step 3 (Validator): Describe what validation checks should be performed  
Return the plan as a numbered list."""
    
    try:
        planner_output = await call_agent("planner", planner_system, user_query)
        print("Planner Response:")
        print("-" * 60)
        print(planner_output)
        print()
    except Exception as e:
        print(f"❌ Planner Error: {e}")
        planner_output = "Error in planning"

    # Step 2: EXECUTOR
    print("\n▶ STEP 2: EXECUTOR (Analyzing with tools)\n")
    executor_system = """You are an executor agent for brain network analysis. Given a plan and query, execute the first step:
Select appropriate analysis tools (connectivity analysis, hub detection, cross-frequency coupling wavelet, growth curve modeling, normative analysis).
Execute the analysis and extract findings.
Return in this format:
- Tool: [tool name]
- Configuration: [key parameters]
- Results: [2-3 key findings]
- Keywords: [3-5 keywords for literature search]"""
    
    executor_prompt = f"""Original Query: {user_query}

Use this plan:
{planner_output}

Execute the first step (Executor) of this plan."""
    
    try:
        executor_output = await call_agent("executor", executor_system, executor_prompt)
        print("Executor Response:")
        print("-" * 60)
        print(executor_output)
        print()
    except Exception as e:
        print(f"❌ Executor Error: {e}")
        executor_output = "Error in execution"

    # Step 3: RESEARCHER
    print("\n▶ STEP 3: RESEARCHER (Searching & analyzing)\n")
    
    # Determine if researcher is needed based on query keywords
    needs_literature = any(word in user_query.lower() for word in [
        'literature', 'pubmed', 'evidence', 'research', 'norms', 'normative', 'compare', 
        'similar', 'statistics', 'stats', 'search', 'says about', 'look up',
        'validated', 'validate', 'valida', 'context'
    ])
    
    if needs_literature:
        researcher_system = """You are a researcher agent for neuroscience. Given executor results:
Search literature databases (PubMed, Google Scholar) for relevant research.
Provide statistical context and normative data.
Return in this format:
- Databases: [searched databases]
- Key findings: [2-3 relevant findings from literature]
- Statistical context: [normative ranges, expected values]
- Validation notes: [how results compare to literature]"""
        
        researcher_prompt = f"""Original Query: {user_query}

Executor's findings:
{executor_output}

Perform literature search and statistical analysis based on these findings."""
        
        try:
            researcher_output = await call_agent("researcher", researcher_system, researcher_prompt)
            print("Researcher Response:")
            print("-" * 60)
            print(researcher_output)
            print()
        except Exception as e:
            print(f"❌ Researcher Error: {e}")
            researcher_output = "Error in research"
    else:
        print("SKIPPED (No literature search required for this query)")
        print("-" * 60)
        print("Query does not require literature search or normative comparison.")
        print("Proceeding directly to validation based on executor results.")
        print()
        researcher_output = "Literature search not required. Executor results sufficient for validation."

    # Step 4: VALIDATOR
    print("\n▶ STEP 4: VALIDATOR (Validating results)\n")
    validator_system = """You are a validator agent. Validate if the original query was answered completely and correctly.
Provide your assessment in this format:
query_answered: [yes/no/partial]
confidence: [0-100%]
issues: [any problems found]
recommendations: [suggestions for improvement]
summary: [1-2 sentence summary]"""
    
    validator_prompt = f"""Original Query: {user_query}

Executor's analysis:
{executor_output}

Researcher's findings:
{researcher_output}

Validate if the query was answered."""
    
    try:
        validator_output = await call_agent("validator", validator_system, validator_prompt)
        print("Validator Response:")
        print("-" * 60)
        print(validator_output)
        print()
    except Exception as e:
        print(f"❌ Validator Error: {e}")
        validator_output = "Error in validation"

    # Summary
    print("\n" + "="*80)
    print("PIPELINE COMPLETE - FINAL VALIDATION")
    print("="*80)
    print(validator_output)
    print("="*80 + "\n")


if __name__ == "__main__":
    
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "I've got this fMRI run from last week, can we look at connectivity and make sure it's okay?"
    
    asyncio.run(orchestrate(query))
