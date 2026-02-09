#!/usr/bin/env python3
"""
Orchestrator: Manually runs the Planner->Executor->Researcher->Validator pipeline
by directly calling agents via pydantic-ai with proper OpenAI-compatible init.
"""

import asyncio
import os
import json
from pydantic_ai import Agent
from openai import AsyncOpenAI

# Configuration
OLLAMA_HOST = "yukon.acm.unc.edu:11434"
MODEL_NAME = "MedAIBase/MedGemma1.5:4b"
OLLAMA_BASE_URL = f"http://{OLLAMA_HOST}"

# Direct OpenAI client for testing
def get_openai_client():
    return AsyncOpenAI(
        api_key="sk-anything",  # fake key, Ollama doesn't validate
        base_url=f"{OLLAMA_BASE_URL}/v1"
    )


# ============================================================================
# Create Agents using pydantic-ai with explicit model instantiation
# ============================================================================

def create_planner() -> Agent:
    # Use explicit OpenAIChatModel with settings
    from pydantic_ai.models.openai import OpenAIChatModel
    model = OpenAIChatModel(
        model_name=MODEL_NAME,
    )
    # Inject the correct settings by overriding the provider
    # Actually, just create via Agent with settings
    return Agent(
        "openai:" + MODEL_NAME,
        settings={"api_key": "sk-anything", "api_base": f"{OLLAMA_BASE_URL}/v1"},
        name="planner",
        instructions="""You are a planning agent. Given a query, create a brief and clear 
execution plan with 3 main steps:
1. Step 1 (Executor): Describe what analysis tools and data processing should happen
2. Step 2 (Researcher): Describe what database searches and statistical analysis should happen  
3. Step 3 (Validator): Describe what validation checks should be performed

Return the plan as a numbered list with clear, actionable descriptions."""
    )


def create_executor() -> Agent:
    return Agent(
        "openai:" + MODEL_NAME,
        name="executor",
        instructions="""You are an executor agent. Given a step from a biomarker analysis plan,
you select and configure analysis tools, execute the analysis, and extract key findings.
Return: tool name, configuration parameters used, key results (2-3 main findings), 
and 3-5 keywords for the researcher."""
    )


def create_researcher() -> Agent:
    return Agent(
        "openai:" + MODEL_NAME,
        name="researcher",
        instructions="""You are a researcher agent. Given executor results and keywords,
search databases (PubMed, DuckDuckGo) for relevant literature, perform statistical validation,
and recommend any config updates.
Return: databases searched, key findings from literature (2-3 findings),
statistical validation results, config updates (yes/no) and recommendations."""
    )


def create_validator() -> Agent:
    return Agent(
        "openai:" + MODEL_NAME,
        name="validator",
        instructions="""You are a validator agent. Validate that the original query was answered
by reviewing executor and researcher results. Provide:
- Is query answered? (yes/no)
- Confidence level (0-100%)
- Issues found (if any)
- Final recommendations

Be concise and direct."""
    )


async def orchestrate(user_query: str):
    """
    Run the full pipeline: Planner -> Executor -> Researcher -> Validator
    """
    print("\n" + "="*80)
    print("ORCHESTRATOR PIPELINE")
    print("="*80)
    print(f"Query: {user_query}\n")

    # Step 1: PLANNER
    print("▶ STEP 1: PLANNER (Creating execution plan)\n")
    planner = create_planner()
    try:
        planner_result = await planner.run(user_query)
        planner_output = planner_result.data
        print("Planner Response:")
        print("-" * 60)
        print(planner_output)
        print()
    except Exception as e:
        print(f"❌ Planner Error: {e}")
        return

    # Step 2: EXECUTOR
    print("\n▶ STEP 2: EXECUTOR (Executing step 1 from plan)\n")
    executor = create_executor()
    executor_prompt = f"""From this execution plan:
{planner_output}

Execute the first step (Executor step) for the query: {user_query}
"""
    try:
        executor_result = await executor.run(executor_prompt)
        executor_output = executor_result.data
        print("Executor Response:")
        print("-" * 60)
        print(executor_output)
        print()
    except Exception as e:
        print(f"❌ Executor Error: {e}")
        return

    # Step 3: RESEARCHER
    print("\n▶ STEP 3: RESEARCHER (Researching findings)\n")
    researcher = create_researcher()
    researcher_prompt = f"""From executor results:
{executor_output}

For the query: {user_query}

Perform research and statistical analysis based on the executor's findings and keywords."""
    try:
        researcher_result = await researcher.run(researcher_prompt)
        researcher_output = researcher_result.data
        print("Researcher Response:")
        print("-" * 60)
        print(researcher_output)
        print()
    except Exception as e:
        print(f"❌ Researcher Error: {e}")
        return

    # Step 4: VALIDATOR
    print("\n▶ STEP 4: VALIDATOR (Validating results)\n")
    validator = create_validator()
    validator_prompt = f"""Original query: {user_query}

Executor findings:
{executor_output}

Researcher findings:
{researcher_output}

Validate if the original query was adequately answered by these results."""
    try:
        validator_result = await validator.run(validator_prompt)
        validator_output = validator_result.data
        print("Validator Response:")
        print("-" * 60)
        print(validator_output)
        print()
    except Exception as e:
        print(f"❌ Validator Error: {e}")
        return

    # Summary
    print("\n" + "="*80)
    print("PIPELINE COMPLETE")
    print("="*80)
    print(validator_output)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "Find biomarkers associated with cognitive decline using statistical analysis of neuroimaging data."
    
    asyncio.run(orchestrate(query))
