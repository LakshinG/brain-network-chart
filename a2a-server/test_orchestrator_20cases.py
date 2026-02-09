#!/usr/bin/env python3
"""
Comprehensive test suite for Agent Orchestration Pipeline
Tests 20 different biomarker/medical analysis queries
"""

import asyncio
import subprocess
import json
import sys
from datetime import datetime

# 20 test cases covering various biomarker analysis scenarios
TEST_CASES = [
    # Neurodegenerative diseases
    "Identify biomarkers for Parkinson's disease using neuroimaging data",
    "Find early detection biomarkers for Alzheimer's disease progression",
    "Analyze protein aggregation biomarkers in frontotemporal dementia",
    
    # Cardiovascular diseases
    "Identify cardiac biomarkers for heart failure prognosis",
    "Find circulating biomarkers for myocardial infarction prediction",
    "Analyze endothelial dysfunction biomarkers in atherosclerosis",
    
    # Cancer research
    "Find tumor suppressor gene biomarkers in lung cancer",
    "Identify immunotherapy response biomarkers in melanoma",
    "Analyze circulating tumor DNA biomarkers for early cancer detection",
    
    # Metabolic disorders
    "Find insulin resistance biomarkers in type 2 diabetes",
    "Identify lipid metabolic biomarkers in metabolic syndrome",
    "Analyze adipokine biomarkers in obesity-related inflammation",
    
    # Autoimmune diseases
    "Find autoantibody biomarkers in systemic lupus erythematosus",
    "Identify complement activation biomarkers in rheumatoid arthritis",
    "Analyze T-cell dysfunction biomarkers in immunodeficiency disorders",
    
    # Infection and inflammation
    "Identify inflammatory cytokine biomarkers in sepsis prognosis",
    "Find pathogenic biomarkers for COVID-19 severity prediction",
    "Analyze bacterial toxin biomarkers in Clostridium difficile infection",
    
    # Organ dysfunction
    "Identify liver injury biomarkers in hepatic encephalopathy",
    "Find renal dysfunction biomarkers in chronic kidney disease progression",
]

async def run_test(test_num, query):
    """Run a single test case"""
    print(f"\n{'='*80}")
    print(f"TEST {test_num}/20: {query[:70]}...")
    print(f"{'='*80}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Run orchestrator_simple.py with timeout
        result = subprocess.run(
            ["python", "orchestrator_simple.py", query],
            cwd="/ram/USERS/zhuoyu73/Andy/brain-network-chart/a2a-server",
            capture_output=True,
            text=True,
            timeout=180
        )
        
        # Check result
        if result.returncode == 0:
            # Extract key metrics from output
            output = result.stdout
            
            # Check for validator output
            if "query_answered" in output and "yes" in output.lower():
                status = "✅ PASS"
                confidence = "100%" if "100%" in output else "Unknown"
            else:
                status = "⚠️  PARTIAL"
                confidence = "Unknown"
            
            # Count sections
            planner_found = "PLANNER" in output and "Response:" in output
            executor_found = "EXECUTOR" in output and "Response:" in output
            researcher_found = "RESEARCHER" in output and "Response:" in output
            validator_found = "VALIDATOR" in output and "Response:" in output
            
            print(f"Status: {status}")
            print(f"Confidence: {confidence}")
            print(f"Planner: {'✅' if planner_found else '❌'}")
            print(f"Executor: {'✅' if executor_found else '❌'}")
            print(f"Researcher: {'✅' if researcher_found else '❌'}")
            print(f"Validator: {'✅' if validator_found else '❌'}")
            
            return {
                "test_num": test_num,
                "query": query,
                "status": "PASS" if status == "✅ PASS" else "PARTIAL",
                "planner": planner_found,
                "executor": executor_found,
                "researcher": researcher_found,
                "validator": validator_found,
                "confidence": confidence,
                "timestamp": datetime.now().isoformat()
            }
        else:
            print(f"Status: ❌ FAIL")
            print(f"Error: {result.stderr[:200]}")
            return {
                "test_num": test_num,
                "query": query,
                "status": "FAIL",
                "error": result.stderr[:200],
                "timestamp": datetime.now().isoformat()
            }
            
    except subprocess.TimeoutExpired:
        print(f"Status: ⏱️  TIMEOUT (>180s)")
        return {
            "test_num": test_num,
            "query": query,
            "status": "TIMEOUT",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Status: ❌ EXCEPTION")
        print(f"Error: {str(e)[:200]}")
        return {
            "test_num": test_num,
            "query": query,
            "status": "EXCEPTION",
            "error": str(e)[:200],
            "timestamp": datetime.now().isoformat()
        }
    finally:
        print(f"End Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


async def main():
    """Run all test cases"""
    print(f"\n{'='*80}")
    print(f"AGENT ORCHESTRATION PIPELINE - COMPREHENSIVE TEST SUITE")
    print(f"{'='*80}")
    print(f"Total Tests: {len(TEST_CASES)}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = []
    
    # Run tests sequentially
    for i, query in enumerate(TEST_CASES, 1):
        result = await run_test(i, query)
        results.append(result)
        
        # Small delay between tests to avoid overwhelming the system
        if i < len(TEST_CASES):
            await asyncio.sleep(2)
    
    # Print summary
    print(f"\n\n{'='*80}")
    print(f"TEST SUMMARY")
    print(f"{'='*80}\n")
    
    pass_count = sum(1 for r in results if r.get("status") == "PASS")
    partial_count = sum(1 for r in results if r.get("status") == "PARTIAL")
    fail_count = sum(1 for r in results if r.get("status") == "FAIL")
    timeout_count = sum(1 for r in results if r.get("status") == "TIMEOUT")
    exception_count = sum(1 for r in results if r.get("status") == "EXCEPTION")
    
    print(f"✅ PASS:       {pass_count:2d}/{len(TEST_CASES)}")
    print(f"⚠️  PARTIAL:   {partial_count:2d}/{len(TEST_CASES)}")
    print(f"❌ FAIL:       {fail_count:2d}/{len(TEST_CASES)}")
    print(f"⏱️  TIMEOUT:   {timeout_count:2d}/{len(TEST_CASES)}")
    print(f"💥 EXCEPTION:  {exception_count:2d}/{len(TEST_CASES)}")
    
    success_rate = ((pass_count + partial_count) / len(TEST_CASES)) * 100
    print(f"\n📊 Success Rate: {success_rate:.1f}%")
    
    # Detailed results
    print(f"\n{'='*80}")
    print(f"DETAILED RESULTS")
    print(f"{'='*80}\n")
    
    for result in results:
        test_num = result.get("test_num", "?")
        status = result.get("status", "UNKNOWN")
        query = result.get("query", "Unknown")
        
        status_icon = {
            "PASS": "✅",
            "PARTIAL": "⚠️",
            "FAIL": "❌",
            "TIMEOUT": "⏱️",
            "EXCEPTION": "💥"
        }.get(status, "❓")
        
        print(f"{status_icon} Test {test_num:2d}: {query[:65]}")
        
        if status == "PASS":
            planner = "✅" if result.get("planner") else "❌"
            executor = "✅" if result.get("executor") else "❌"
            researcher = "✅" if result.get("researcher") else "❌"
            validator = "✅" if result.get("validator") else "❌"
            print(f"          {planner} Planner | {executor} Executor | "
                  f"{researcher} Researcher | {validator} Validator | "
                  f"Confidence: {result.get('confidence', 'N/A')}")
        elif status in ["FAIL", "TIMEOUT", "EXCEPTION"]:
            error = result.get("error", "Unknown error")
            print(f"          Error: {error[:70]}")
    
    # Save results to file
    results_file = "/tmp/orchestrator_test_results.json"
    with open(results_file, "w") as f:
        json.dump({
            "test_suite": "Agent Orchestration Pipeline",
            "total_tests": len(TEST_CASES),
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "pass": pass_count,
                "partial": partial_count,
                "fail": fail_count,
                "timeout": timeout_count,
                "exception": exception_count,
                "success_rate": f"{success_rate:.1f}%"
            },
            "results": results
        }, f, indent=2)
    
    print(f"\n📁 Results saved to: {results_file}")
    print(f"\n{'='*80}")
    print(f"END TIME: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*80}\n")
    
    # Exit with appropriate code
    sys.exit(0 if success_rate >= 90 else 1)


if __name__ == "__main__":
    asyncio.run(main())
