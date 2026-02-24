# Orchestrator Robustness Test - 500 Diverse Queries

## 📋 Overview

This test evaluates the orchestrator's robustness by running 500 completely diverse prompts through the full pipeline (Planner → Executor → Researcher → Validator). It specifically tests:

1. **Researcher Triggering Accuracy** - Whether the researcher agent is invoked when needed (literature searches) and skipped when not needed
2. **Tool Calling Robustness** - Correct identification and execution of analysis tools
3. **Error Handling** - Pipeline stability under diverse inputs
4. **Performance Metrics** - Execution times and success rates

---

## 🎯 Test Objectives

### Primary Goals:
- ✅ Test researcher triggering logic across 500 diverse prompts
- ✅ Measure precision, recall, and accuracy of researcher invocation
- ✅ Validate robustness against varied query formulations
- ✅ Identify failure patterns and edge cases

### Metrics Tracked:
- **Success Rate** - Percentage of queries completed without errors
- **Researcher Accuracy** - Correct triggering decisions (should/shouldn't)
- **True Positives** - Correctly triggered researcher for literature queries
- **False Positives** - Unnecessarily triggered researcher
- **True Negatives** - Correctly skipped researcher for simple queries
- **False Negatives** - Failed to trigger researcher when needed
- **Precision** - TP / (TP + FP)
- **Recall** - TP / (TP + FN)
- **Accuracy** - (TP + TN) / Total
- **Execution Time** - Average time per query

---

## 📁 Files

1. **`test_orchestrator_robustness_500.py`** - Main test script
   - Generates 500 diverse prompts
   - Runs full orchestrator pipeline for each
   - Tracks success and researcher triggering
   - Saves detailed results

2. **`run_robustness_test.sh`** - Launcher script
   - Easy command-line interface
   - Estimates execution time
   - Logs all output

3. **Output Files:**
   - `robustness_test_results_500q_<timestamp>.json` - Full results
   - `robustness_test_intermediate_<N>.json` - Checkpoints every 50 queries
   - `robustness_test_500q_<timestamp>.log` - Console output log

---

## ✅ Latest Result Summary

Robustness test for user question -> Researcher PubMed search -> result

Biomarker queries (tabular data):
- Success rate = 93.6%
- Average time per query = 19.33s

Stored in: `biomarker_evaluation_results_500q_20260223_185943.json`

---

## 🚀 Quick Start

### Run Small Test (10 queries, ~2-3 minutes):
```bash
cd /ram/USERS/zhuoyu73/Andy/brain-network-chart/a2a-server
./run_robustness_test.sh 10
```

### Run Medium Test (50 queries, ~10-15 minutes):
```bash
./run_robustness_test.sh 50
```

### Run Full Test (500 queries, ~4-8 hours):
```bash
./run_robustness_test.sh 500
```

### Run Custom Number:
```bash
./run_robustness_test.sh 100  # Any number you want
```

---

## 📊 Prompt Distribution

The 500 prompts are distributed as:

### 1. Simple Tool Requests (35%, ~175 prompts)
**Should NOT trigger researcher**

Examples:
- "Can you run connectivity analysis on this dataset?"
- "I need hub detection for my data."
- "Please do CFC wavelet analysis on the BOLD data."
- "Run normative analysis and show me the results."
- "Execute growth curve modeling for this scan."

### 2. Literature-Focused Queries (35%, ~175 prompts)
**SHOULD trigger researcher**

Examples:
- "Run hub detection and check what the literature says."
- "Do CFC analysis then search PubMed for validation."
- "I need connectivity plus evidence from research papers."
- "Execute normative analysis and compare to published norms."
- "Run growth curves then look up what studies show."

### 3. Mixed/Ambiguous Queries (30%, ~150 prompts)
**Context-dependent triggering**

Examples:
- "I've got fMRI data - can we look at connectivity and make sure it's reasonable?"
- "Need hub detection on our data, then someone should check it."
- "Can we get normative analysis done and validated?"
- "Run CFC and confirm it's correct."
- "Do connectivity and double-check the output."

---

## 🔬 Test Data

**Primary Dataset:** `/ram/USERS/zhuoyu73/Andy/Amyloid_SUVR_Swapped.csv`

This CSV file is referenced in many prompts to simulate real-world usage with actual data files.

---

## 📈 Expected Results

### Ideal Performance Targets:

| Metric | Target |
|--------|--------|
| Success Rate | >95% |
| Researcher Accuracy | >90% |
| Precision | >85% |
| Recall | >85% |
| Average Execution Time | <3 seconds/query |

### Researcher Triggering Keywords:

The following keywords in a query **SHOULD** trigger the researcher:
- literature, pubmed, evidence, research
- norms, compare, similar, typical
- statistics, stats, expected, normal
- standard, published, papers, search
- says about, look up

---

## 📝 Results Interpretation

### Output JSON Structure:

```json
{
  "test_info": {
    "n_queries": 500,
    "model": "MedAIBase/MedGemma1.5:4b",
    "timestamp": "20260216_143025"
  },
  "summary_stats": {
    "total": 500,
    "successful": 500,
    "success_rate": 1.0,
    "researcher_correct": 479,
    "researcher_accuracy": 0.958,
    "avg_execution_time": 18.23,
    "total_errors": 0
  },
  "researcher_analysis": {
    "expected_triggers": 186,
    "actual_triggers": 165,
    "true_positives": 165,
    "false_positives": 0,
    "true_negatives": 314,
    "false_negatives": 21,
    "precision": 1.0,
    "recall": 0.8871,
    "accuracy": 0.958
  },
  "detailed_results": [...]
}
```

### Confusion Matrix:

```
                 Predicted Positive    Predicted Negative
                 (Researcher Called)   (Researcher Skipped)
Actual Positive  True Positive (TP)    False Negative (FN)
(Should Call)    165                   21

Actual Negative  False Positive (FP)   True Negative (TN)
(Shouldn't Call) 0                     314
```

**Metrics:**
- **Precision** = TP/(TP+FP) = 165/(165+0) = 100.0%
- **Recall** = TP/(TP+FN) = 165/(165+21) = 88.7%
- **Accuracy** = (TP+TN)/(Total) = (165+314)/500 = 95.8%

---

## 🐛 Common Issues

### Issue 1: Connection Timeouts
**Symptom:** "ERROR: Connection refused" in results

**Solution:** Check if Ollama server is running:
```bash
curl http://yukon.acm.unc.edu:11434/api/tags
```

### Issue 2: Slow Execution
**Symptom:** Taking >5 seconds per query

**Solution:** Normal for complex queries, but check server load:
```bash
ssh yukon.acm.unc.edu
htop  # Check if model is under heavy load
```

### Issue 3: Import Errors
**Symptom:** "ModuleNotFoundError: No module named 'openai'"

**Solution:** Install dependencies:
```bash
pip install openai asyncio
```

---

## 🔍 Analyzing Results

### View Summary:
```bash
# Quick summary from JSON
cat robustness_test_results_500q_*.json | jq '.summary_stats'

# Researcher analysis
cat robustness_test_results_500q_*.json | jq '.researcher_analysis'
```

### Find Failed Queries:
```bash
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.success == false)'
```

### Check False Positives (researcher triggered when it shouldn't):
```bash
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.metadata.should_trigger_researcher == false and .researcher_triggered == true)'
```

### Check False Negatives (researcher NOT triggered when it should):
```bash
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.metadata.should_trigger_researcher == true and .researcher_triggered == false)'
```

---

## 📊 Performance by Query Type

View breakdown by query type:
```bash
cat robustness_test_results_500q_*.json | jq '.detailed_results | group_by(.metadata.type) | map({type: .[0].metadata.type, count: length, success: (map(select(.success)) | length)})'
```

---

## ⏱️ Execution Time Estimates

| Queries | Estimated Time | Notes |
|---------|----------------|-------|
| 10 | 2-3 minutes | Quick test |
| 50 | 10-15 minutes | Small validation |
| 100 | 20-30 minutes | Medium test |
| 500 | 4-8 hours | Full robustness test |

**Note:** Times vary based on:
- Server load
- Model inference speed
- Network latency
- Query complexity

---

## 🎓 Understanding the Pipeline

Each query goes through 4 stages:

1. **Planner** (Planning Agent)
   - Creates execution plan
   - Identifies required steps
   - Determines if literature search needed

2. **Executor** (Execution Agent)
   - Runs analysis tools
   - Processes data
   - Extracts findings
   - Generates keywords for research

3. **Researcher** (Research Agent) *[Conditional]*
   - **Triggered if:** Query contains literature/norm keywords
   - Searches PubMed/literature
   - Provides statistical context
   - Validates against published data

4. **Validator** (Validation Agent)
   - Checks if query answered
   - Assesses confidence
   - Identifies issues
   - Provides recommendations

---

## 📧 Support & Issues

### Check Status:
```bash
# View running test progress (if using screen/tmux)
tail -f robustness_test_500q_*.log

# Check intermediate results
ls -lh robustness_test_intermediate_*.json
```

### Kill Running Test:
```bash
# Find process
ps aux | grep test_orchestrator

# Kill (replace PID)
kill <PID>
```

---

## 🎯 Success Criteria

The test is considered successful if:
- ✅ Success rate ≥ 95%
- ✅ Researcher accuracy ≥ 90%
- ✅ Precision ≥ 85%
- ✅ Recall ≥ 85%
- ✅ No systematic errors (same error >10% of queries)
- ✅ Average execution time <5 seconds

---

## 🔧 Customization

### Modify Prompt Templates:

Edit `test_orchestrator_robustness_500.py`:

```python
# Add new simple tool prompts (shouldn't trigger researcher)
SIMPLE_TOOL_PROMPTS = [
    "Your new prompt template here with {} for tool",
    # ... more prompts
]

# Add new literature prompts (should trigger researcher)
LITERATURE_PROMPTS = [
    "Your new prompt with literature keyword and {} for tool",
    # ... more prompts
]
```

### Adjust Researcher Triggering Keywords:

```python
needs_literature = any(word in query.lower() for word in [
    'literature', 'pubmed', 'evidence',  # Add/remove keywords
    'your_new_keyword_here',
])
```

---

## 📚 Example Output

```
================================================================================
ORCHESTRATOR ROBUSTNESS TEST - 500 QUERIES
================================================================================
Model: MedAIBase/MedGemma1.5:4b
Host: yukon.acm.unc.edu:11434
Start Time: 2026-02-16 14:30:25
================================================================================

Generating 500 diverse prompts...
✓ Generated 500 prompts
  - Simple tool requests: 175
  - Literature-focused: 175
  - Mixed/ambiguous: 150
  - Expected researcher triggers: 325

[1/500] ✓ Success | ✓ Researcher | 2.3s | Can you run connectivity analysis on this dataset?...
[2/500] ✓ Success | ✓ Researcher | 2.7s | Do hub detection then search PubMed for validation....
[3/500] ✓ Success | ✗ Researcher | 2.1s | Execute CFC wavelet analysis for this scan....
...

💾 Intermediate results saved to robustness_test_intermediate_50.json

...

================================================================================
TEST RESULTS SUMMARY
================================================================================

📊 Overall Performance:
  Total queries: 500
  Successful: 485 (97.0%)
  Failed: 15 (3.0%)
  Total errors: 15
  Average execution time: 2.45s

🔬 Researcher Triggering Analysis:
  Expected triggers: 325
  Actual triggers: 318
  Correct decisions: 455 (91.0%)

  Confusion Matrix:
    True Positives (should + did trigger): 312
    False Positives (shouldn't but did): 6
    True Negatives (shouldn't + didn't): 143
    False Negatives (should but didn't): 13
    Precision: 98.1%
    Recall: 96.0%
    Accuracy: 91.0%

💾 Full results saved to: robustness_test_results_500q_20260216_183045.json
================================================================================
```

---

## 📖 Further Reading

- [Orchestrator Documentation](./README_ORCHESTRATION.md)
- [Agent Implementation](./README_AGENTS.md)
- [Test Suite Results](./TEST_RESULTS_20CASES.md)

---

**Version:** 1.0  
**Last Updated:** 2026-02-16  
**Test Data:** `/ram/USERS/zhuoyu73/Andy/Amyloid_SUVR_Swapped.csv`
