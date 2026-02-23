#!/usr/bin/env python3
"""
Orchestrator Robustness Test: 500 Diverse Queries
Tests researcher tool calling robustness with completely varied prompts.
"""

import asyncio
import random
import json
from datetime import datetime
from pathlib import Path
from openai import AsyncOpenAI
import time

# Configuration
OLLAMA_HOST = "yukon.acm.unc.edu:11434"
MODEL_NAME = "MedAIBase/MedGemma1.5:4b"
OLLAMA_BASE_URL = f"http://{OLLAMA_HOST}"
TEST_DATA_PATH = "/ram/USERS/zhuoyu73/Andy/Amyloid_SUVR_Swapped.csv"

client = AsyncOpenAI(
    api_key="sk-anything",
    base_url=f"{OLLAMA_BASE_URL}/v1"
)


# ============================================================================
# PROMPT GENERATION TEMPLATES
# ============================================================================

# Simple tool requests (should NOT trigger researcher)
SIMPLE_TOOL_PROMPTS = [
    "Can you run {} on this dataset?",
    "I need {} analysis for my data.",
    "Please do {} on the BOLD data.",
    "Run {} and show me the results.",
    "Execute {} for this scan.",
    "Apply {} to our fMRI data.",
    "We need {} - can you help?",
    "Could you perform {} analysis?",
    "I want to see {} results.",
    "Do {} on this file: {}",
    "Just run {} quickly.",
    "Can we get {} done today?",
    "Need {} for this dataset.",
    "Run a quick {} analysis.",
    "I've got data, can you do {}?",
    "Please execute {} on our data.",
    "We're testing {}, run it please.",
    "Can you apply {} to this?",
    "I need {} output ASAP.",
    "Do {} and send results.",
    "Can someone run {}?",
    "Execute {} on the uploaded file.",
    "I want {} analysis completed.",
    "Can you process this with {}?",
    "Need to run {} before lunch.",
    "Apply {} to subject data.",
    "Run {} algorithm please.",
    "Can you compute {}?",
    "Do {} on this scan data.",
    "I need {} for publication.",
    "Run {} on the matrix.",
    "Execute {} for quality check.",
    "Can we do {}?",
    "Run {} validation.",
    "I need {} metrics.",
    "Compute {} for this roi.",
    "Run {} on network data.",
    "Apply {} method please.",
    "Execute {} processing.",
    "Can you run {}?",
    "Need {} computation.",
]

# Literature-focused prompts (SHOULD trigger researcher)
LITERATURE_PROMPTS = [
    "Run {} and check what the literature says.",
    "Do {} then search PubMed for validation.",
    "I need {} plus evidence from research papers.",
    "Execute {} and compare to published norms.",
    "Run {} then look up what studies show.",
    "Do {} analysis and see if it matches literature.",
    "Can you run {} and find research about it?",
    "Execute {} then search for similar findings.",
    "Run {} and check against published data.",
    "Do {} and see what PubMed says.",
    "I need {} with literature comparison.",
    "Run {} and validate against research.",
    "Do {} then find evidence in papers.",
    "Execute {} and search for norms.",
    "Run {} plus check typical values.",
    "Do {} and compare to other studies.",
    "I need {} validated by literature.",
    "Run {} then search for statistics.",
    "Do {} and see what research shows.",
    "Execute {} with PubMed validation.",
    "Run {} and find normative data.",
    "Do {} then look up expected ranges.",
    "I need {} with research context.",
    "Run {} and compare to population norms.",
    "Do {} and check what's typical.",
    "Execute {} then search databases.",
    "Run {} and validate with papers.",
    "Do {} plus literature review.",
    "I need {} compared to published work.",
    "Run {} and find similar research.",
    "Do {} then check evidence.",
    "Execute {} with statistical context.",
    "Run {} and see if it's normal.",
    "Do {} and compare to standards.",
    "I need {} with research support.",
    "Run {} then find relevant papers.",
    "Do {} and check against norms.",
    "Execute {} with literature search.",
    "Run {} and validate findings.",
    "Do {} plus PubMed lookup.",
]

# Mixed/ambiguous prompts (test decision-making)
MIXED_PROMPTS = [
    "I've got fMRI data - can we look at {} and make sure it's reasonable?",
    "We're interested in {} - can you run that?",
    "Need {} on our data, then someone should check it.",
    "Can we get {} done and validated?",
    "Run {} and confirm it's correct.",
    "I want {} results that are verified.",
    "Do {} and double-check the output.",
    "Execute {} and make sure it's right.",
    "Run {} and validate the findings.",
    "Can you do {} and verify results?",
    "I need {} with quality check.",
    "Run {} and confirm accuracy.",
    "Do {} and validate output.",
    "Execute {} and check correctness.",
    "Run {} with verification.",
    "We need {} that's been validated.",
    "Do {} and ensure it's accurate.",
    "Run {} and check if it's okay.",
    "Execute {} with quality control.",
    "Can you run {} and verify?",
]

# Tools
TOOLS = [
    "connectivity analysis",
    "hub detection",
    "CFC wavelet analysis",
    "cross-frequency coupling",
    "normative analysis",
    "growth curve modeling",
    "functional connectivity",
    "network hub identification",
    "wavelet decomposition",
    "system segregation analysis",
]

# Additional context variations
CONTEXTS = [
    "on this BOLD data",
    "for our fMRI study",
    "on subject 001",
    "using AAL atlas",
    "with 116 ROIs",
    "on the uploaded matrix",
    "for this scan",
    "on our dataset",
    "using the CSV file",
    "on week 2 data",
]

# File references
FILE_REFS = [
    TEST_DATA_PATH,
    "the uploaded file",
    "subject_bold.csv",
    "fc_matrix.csv",
    "our data file",
]


def generate_diverse_prompts(n=500):
    """Generate n completely diverse prompts."""
    prompts = []
    metadata = []
    
    # Ensure variety in distribution
    n_simple = int(n * 0.35)  # 35% simple tool requests
    n_literature = int(n * 0.35)  # 35% literature-focused
    n_mixed = int(n * 0.30)  # 30% mixed/ambiguous
    
    # Generate simple tool prompts (should NOT trigger researcher)
    for i in range(n_simple):
        template = random.choice(SIMPLE_TOOL_PROMPTS)
        tool = random.choice(TOOLS)
        context = random.choice(CONTEXTS) if random.random() > 0.5 else ""
        file_ref = random.choice(FILE_REFS) if "{}" in template and template.count("{}") > 1 else ""
        
        if "{}" in template:
            if template.count("{}") == 2:
                prompt = template.format(tool, file_ref)
            else:
                prompt = template.format(tool)
        else:
            prompt = template
        
        if context and not file_ref:
            prompt += f" {context}"
        
        prompts.append(prompt)
        metadata.append({
            "type": "simple_tool",
            "should_trigger_researcher": False,
            "tool": tool,
            "index": len(prompts)
        })
    
    # Generate literature-focused prompts (SHOULD trigger researcher)
    for i in range(n_literature):
        template = random.choice(LITERATURE_PROMPTS)
        tool = random.choice(TOOLS)
        
        if "{}" in template:
            prompt = template.format(tool)
        else:
            prompt = template
        
        # Add context sometimes
        if random.random() > 0.7:
            prompt += f" {random.choice(CONTEXTS)}"
        
        prompts.append(prompt)
        metadata.append({
            "type": "literature_focused",
            "should_trigger_researcher": True,
            "tool": tool,
            "index": len(prompts)
        })
    
    # Generate mixed prompts (context-dependent)
    for i in range(n_mixed):
        template = random.choice(MIXED_PROMPTS)
        tool = random.choice(TOOLS)
        
        if "{}" in template:
            prompt = template.format(tool)
        else:
            prompt = template
        
        # Determine if researcher should trigger based on keywords
        should_trigger = any(word in prompt.lower() for word in [
            'literature', 'pubmed', 'evidence', 'research', 'norms', 
            'compare', 'typical', 'statistics', 'stats', 'validated'
        ])
        
        prompts.append(prompt)
        metadata.append({
            "type": "mixed",
            "should_trigger_researcher": should_trigger,
            "tool": tool,
            "index": len(prompts)
        })
    
    # Fill remaining with random selections
    while len(prompts) < n:
        all_templates = SIMPLE_TOOL_PROMPTS + LITERATURE_PROMPTS + MIXED_PROMPTS
        template = random.choice(all_templates)
        tool = random.choice(TOOLS)
        
        if "{}" in template:
            if template.count("{}") == 2:
                prompt = template.format(tool, random.choice(FILE_REFS))
            else:
                prompt = template.format(tool)
        else:
            prompt = template
        
        # Determine type
        if template in SIMPLE_TOOL_PROMPTS:
            ptype = "simple_tool"
            should_trigger = False
        elif template in LITERATURE_PROMPTS:
            ptype = "literature_focused"
            should_trigger = True
        else:
            ptype = "mixed"
            should_trigger = any(word in prompt.lower() for word in [
                'literature', 'pubmed', 'evidence', 'research', 'norms', 'normative', 'compare',
                'typical', 'statistics', 'stats', 'validated', 'validate', 'valida', 'context'
            ])
        
        prompts.append(prompt)
        metadata.append({
            "type": ptype,
            "should_trigger_researcher": should_trigger,
            "tool": tool,
            "index": len(prompts)
        })
    
    # Shuffle to randomize order
    combined = list(zip(prompts, metadata))
    random.shuffle(combined)
    prompts, metadata = zip(*combined)
    
    # Re-index
    for i, m in enumerate(metadata):
        m["index"] = i + 1
    
    return list(prompts), list(metadata)


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


async def test_single_query(query: str, metadata: dict, query_num: int, total: int):
    """Test a single query through the orchestrator pipeline."""
    result = {
        "query_num": query_num,
        "query": query,
        "metadata": metadata,
        "timestamp": datetime.now().isoformat(),
        "success": False,
        "researcher_triggered": False,
        "researcher_correct": False,
        "errors": [],
        "execution_time_seconds": 0,
    }
    
    start_time = time.time()
    
    try:
        # Step 1: PLANNER
        planner_system = """You are a planning agent for brain network and fMRI analysis. Given a query, create a brief and clear 
execution plan with 3 main steps:
1. Step 1 (Executor): Describe what analysis tools (connectivity, hub detection, CFC wavelet, growth curves, normative modeling) and data processing should happen
2. Step 2 (Researcher): Describe what literature searches (PubMed) and statistical validation should happen. Skip if no literature search is needed.
3. Step 3 (Validator): Describe what validation checks should be performed  
Return the plan as a numbered list."""
        
        planner_output = await call_agent("planner", planner_system, query)
        if "ERROR" in planner_output:
            result["errors"].append(f"Planner error: {planner_output}")
        
        # Step 2: EXECUTOR
        executor_system = """You are an executor agent for brain network analysis. Given a plan and query, execute the first step:
Select appropriate analysis tools (connectivity analysis, hub detection, cross-frequency coupling wavelet, growth curve modeling, normative analysis).
Execute the analysis and extract findings.
Return in this format:
- Tool: [tool name]
- Configuration: [key parameters]
- Results: [2-3 key findings]
- Keywords: [3-5 keywords for literature search]"""
        
        executor_prompt = f"""Original Query: {query}

Use this plan:
{planner_output}

Execute the first step (Executor) of this plan."""
        
        executor_output = await call_agent("executor", executor_system, executor_prompt)
        if "ERROR" in executor_output:
            result["errors"].append(f"Executor error: {executor_output}")
        
        # Step 3: RESEARCHER (check if triggered)
        needs_literature = any(word in query.lower() for word in [
            'literature', 'pubmed', 'evidence', 'research', 'norms', 'compare', 
            'similar', 'statistics', 'stats', 'search', 'says about', 'look up',
            'typical', 'expected', 'normal', 'standard', 'published', 'papers'
        ])
        
        result["researcher_triggered"] = needs_literature
        
        if needs_literature:
            researcher_system = """You are a researcher agent for neuroscience. Given executor results:
Search literature databases (PubMed, Google Scholar) for relevant research.
Provide statistical context and normative data.
Return in this format:
- Databases: [searched databases]
- Key findings: [2-3 relevant findings from literature]
- Statistical context: [normative ranges, expected values]
- Validation notes: [how results compare to literature]"""
            
            researcher_prompt = f"""Original Query: {query}

Executor's findings:
{executor_output}

Perform literature search and statistical analysis based on these findings."""
            
            researcher_output = await call_agent("researcher", researcher_system, researcher_prompt)
            if "ERROR" in researcher_output:
                result["errors"].append(f"Researcher error: {researcher_output}")
        else:
            researcher_output = "Literature search not required."
        
        # Step 4: VALIDATOR
        validator_system = """You are a validator agent. Validate if the original query was answered completely and correctly.
Provide your assessment in this format:
query_answered: [yes/no/partial]
confidence: [0-100%]
issues: [any problems found]
recommendations: [suggestions for improvement]
summary: [1-2 sentence summary]"""
        
        validator_prompt = f"""Original Query: {query}

Executor's analysis:
{executor_output}

Researcher's findings:
{researcher_output}

Validate if the query was answered."""
        
        validator_output = await call_agent("validator", validator_system, validator_prompt)
        if "ERROR" in validator_output:
            result["errors"].append(f"Validator error: {validator_output}")
        
        # Check if researcher triggering was correct
        expected_trigger = metadata["should_trigger_researcher"]
        actual_trigger = result["researcher_triggered"]
        result["researcher_correct"] = (expected_trigger == actual_trigger)
        
        # Consider success if no major errors
        result["success"] = len(result["errors"]) == 0
        
    except Exception as e:
        result["errors"].append(f"Pipeline exception: {str(e)}")
        result["success"] = False
    
    result["execution_time_seconds"] = time.time() - start_time
    
    # Progress indicator
    status = "✓" if result["success"] else "✗"
    researcher_status = "✓" if result["researcher_correct"] else "✗"
    print(f"[{query_num}/{total}] {status} Success | {researcher_status} Researcher | {result['execution_time_seconds']:.1f}s | {query[:60]}...")
    
    return result


async def run_robustness_test(n_queries=500):
    """Run the full robustness test with n queries."""
    print("="*80)
    print(f"ORCHESTRATOR ROBUSTNESS TEST - {n_queries} QUERIES")
    print("="*80)
    print(f"Model: {MODEL_NAME}")
    print(f"Host: {OLLAMA_HOST}")
    print(f"Test Data: {TEST_DATA_PATH}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80 + "\n")
    
    # Generate prompts
    print(f"Generating {n_queries} diverse prompts...")
    prompts, metadata = generate_diverse_prompts(n_queries)
    print(f"✓ Generated {len(prompts)} prompts")
    print(f"  - Simple tool requests: {sum(1 for m in metadata if m['type'] == 'simple_tool')}")
    print(f"  - Literature-focused: {sum(1 for m in metadata if m['type'] == 'literature_focused')}")
    print(f"  - Mixed/ambiguous: {sum(1 for m in metadata if m['type'] == 'mixed')}")
    print(f"  - Expected researcher triggers: {sum(1 for m in metadata if m['should_trigger_researcher'])}")
    print("\n")
    
    # Run tests
    results = []
    for i, (prompt, meta) in enumerate(zip(prompts, metadata), 1):
        result = await test_single_query(prompt, meta, i, len(prompts))
        results.append(result)
        
        # Short delay to avoid overwhelming the model
        await asyncio.sleep(0.1)
        
        # Save intermediate results every 50 queries
        if i % 50 == 0:
            intermediate_file = f"robustness_test_intermediate_{i}.json"
            with open(intermediate_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n💾 Intermediate results saved to {intermediate_file}\n")
    
    # Analysis
    print("\n" + "="*80)
    print("TEST RESULTS SUMMARY")
    print("="*80)
    
    total = len(results)
    successful = sum(1 for r in results if r["success"])
    researcher_correct = sum(1 for r in results if r["researcher_correct"])
    total_errors = sum(len(r["errors"]) for r in results)
    avg_time = sum(r["execution_time_seconds"] for r in results) / total
    
    # Researcher triggering analysis
    expected_triggers = sum(1 for r in results if r["metadata"]["should_trigger_researcher"])
    actual_triggers = sum(1 for r in results if r["researcher_triggered"])
    true_positives = sum(1 for r in results if r["metadata"]["should_trigger_researcher"] and r["researcher_triggered"])
    false_positives = sum(1 for r in results if not r["metadata"]["should_trigger_researcher"] and r["researcher_triggered"])
    true_negatives = sum(1 for r in results if not r["metadata"]["should_trigger_researcher"] and not r["researcher_triggered"])
    false_negatives = sum(1 for r in results if r["metadata"]["should_trigger_researcher"] and not r["researcher_triggered"])
    
    print(f"\n📊 Overall Performance:")
    print(f"  Total queries: {total}")
    print(f"  Successful: {successful} ({successful/total*100:.1f}%)")
    print(f"  Failed: {total - successful} ({(total-successful)/total*100:.1f}%)")
    print(f"  Total errors: {total_errors}")
    print(f"  Average execution time: {avg_time:.2f}s")
    
    print(f"\n🔬 Researcher Triggering Analysis:")
    print(f"  Expected triggers: {expected_triggers}")
    print(f"  Actual triggers: {actual_triggers}")
    print(f"  Correct decisions: {researcher_correct} ({researcher_correct/total*100:.1f}%)")
    print(f"\n  Confusion Matrix:")
    print(f"    True Positives (should + did trigger): {true_positives}")
    print(f"    False Positives (shouldn't but did): {false_positives}")
    print(f"    True Negatives (shouldn't + didn't): {true_negatives}")
    print(f"    False Negatives (should but didn't): {false_negatives}")
    
    if (true_positives + false_positives) > 0:
        precision = true_positives / (true_positives + false_positives)
        print(f"    Precision: {precision*100:.1f}%")
    if (true_positives + false_negatives) > 0:
        recall = true_positives / (true_positives + false_negatives)
        print(f"    Recall: {recall*100:.1f}%")
    if (true_positives + false_positives + true_negatives + false_negatives) > 0:
        accuracy = (true_positives + true_negatives) / total
        print(f"    Accuracy: {accuracy*100:.1f}%")
    
    # By query type
    print(f"\n📈 Performance by Query Type:")
    for qtype in ["simple_tool", "literature_focused", "mixed"]:
        type_results = [r for r in results if r["metadata"]["type"] == qtype]
        if type_results:
            type_success = sum(1 for r in type_results if r["success"])
            type_correct = sum(1 for r in type_results if r["researcher_correct"])
            print(f"  {qtype}:")
            print(f"    Count: {len(type_results)}")
            print(f"    Success rate: {type_success/len(type_results)*100:.1f}%")
            print(f"    Researcher correct: {type_correct/len(type_results)*100:.1f}%")
    
    # Error analysis
    if total_errors > 0:
        print(f"\n⚠️  Error Analysis:")
        error_types = {}
        for r in results:
            for err in r["errors"]:
                err_type = err.split(":")[0]
                error_types[err_type] = error_types.get(err_type, 0) + 1
        for err_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True):
            print(f"    {err_type}: {count} occurrences")
    
    # Save final results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = f"robustness_test_results_{n_queries}q_{timestamp}.json"
    
    summary = {
        "test_info": {
            "n_queries": n_queries,
            "model": MODEL_NAME,
            "host": OLLAMA_HOST,
            "test_data": TEST_DATA_PATH,
            "timestamp": timestamp,
        },
        "summary_stats": {
            "total": total,
            "successful": successful,
            "success_rate": successful/total,
            "researcher_correct": researcher_correct,
            "researcher_accuracy": researcher_correct/total,
            "avg_execution_time": avg_time,
            "total_errors": total_errors,
        },
        "researcher_analysis": {
            "expected_triggers": expected_triggers,
            "actual_triggers": actual_triggers,
            "true_positives": true_positives,
            "false_positives": false_positives,
            "true_negatives": true_negatives,
            "false_negatives": false_negatives,
            "precision": true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0,
            "recall": true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0,
            "accuracy": (true_positives + true_negatives) / total,
        },
        "detailed_results": results,
    }
    
    with open(results_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n💾 Full results saved to: {results_file}")
    print("="*80 + "\n")
    
    return summary


if __name__ == "__main__":
    import sys
    
    n = 500
    if len(sys.argv) > 1:
        n = int(sys.argv[1])
    
    print(f"Starting robustness test with {n} queries...\n")
    asyncio.run(run_robustness_test(n))
