#!/usr/bin/env python3
"""
Simple Orchestrator: Uses OpenAI-compatible client directly with Ollama,
executing Planner->Executor->Researcher->Validator pipeline.
"""

import asyncio
from openai import AsyncOpenAI

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
    response = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        max_tokens=500,
    )
    return response.choices[0].message.content


async def orchestrate(user_query: str):
    """Run the full pipeline: Planner -> Executor -> Researcher -> Validator"""
    
    print("\n" + "="*80)
    print("ORCHESTRATOR PIPELINE")
    print("="*80)
    print(f"Query: {user_query}\n")

    # Step 1: PLANNER
    print("▶ STEP 1: PLANNER (Creating execution plan)\n")
    planner_system = """You are a planning agent. Given a query, create a brief and clear 
execution plan with 3 main steps:
1. Step 1 (Executor): Describe what analysis tools and data processing should happen
2. Step 2 (Researcher): Describe what database searches and statistical analysis should happen  
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
        return

    # Step 2: EXECUTOR
    print("\n▶ STEP 2: EXECUTOR (Analyzing with tools)\n")
    executor_system = """You are an executor agent. Given a plan and query, execute the first step:
select and configure analysis tools, execute the analysis, and extract findings.
Return: tool name, configuration, key results (2-3 findings), and 3-5 keywords for researchers."""
    
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
        return

    # Step 3: RESEARCHER
    print("\n▶ STEP 3: RESEARCHER (Searching & analyzing)\n")
    researcher_system = """You are a researcher agent. Given executor results:
search databases (PubMed, DuckDuckGo) for literature, perform statistical validation.
Return: databases searched, key findings (2-3), statistical results, config updates."""
    
    researcher_prompt = f"""Original Query: {user_query}

Executor's findings:
{executor_output}

Perform research and statistical analysis based on these findings."""
    
    try:
        researcher_output = await call_agent("researcher", researcher_system, researcher_prompt)
        print("Researcher Response:")
        print("-" * 60)
        print(researcher_output)
        print()
    except Exception as e:
        print(f"❌ Researcher Error: {e}")
        return

    # Step 4: VALIDATOR
    print("\n▶ STEP 4: VALIDATOR (Validating results)\n")
    validator_system = """You are a validator agent. Validate if the original query was answered.
Provide: query_answered (yes/no), confidence (0-100%), any issues, recommendations."""
    
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
        return

    # Summary
    print("\n" + "="*80)
    print("PIPELINE COMPLETE - FINAL VALIDATION")
    print("="*80)
    print(validator_output)
    print("="*80 + "\n")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "Find biomarkers associated with cognitive decline using statistical analysis of neuroimaging data."
    
    asyncio.run(orchestrate(query))
