# 🎯 Orchestrator Robustness Test - 500 Queries RUNNING ✅

## ✅ Test Status: RUNNING

**Process ID:** 1100061  
**Started:** 2026-02-16 10:29:23  
**Log File:** `robustness_test_500_20260216_102923.log`  
**Estimated Completion:** 4-8 hours

---

## 📊 Quick Monitoring

### Check Status Anytime:
```bash
cd /ram/USERS/zhuoyu73/Andy/brain-network-chart/a2a-server
./monitor_test.sh
```

### Watch Live Output:
```bash
tail -f robustness_test_500_20260216_102923.log
```

### Check Progress (saved every 50 queries):
```bash
ls -lh robustness_test_intermediate_*.json
cat robustness_test_intermediate_50.json | jq '.summary_stats'
```

### Stop Test (if needed):
```bash
kill 1100061
```

---

## 📁 Files Created

### 1. Test Script
**`test_orchestrator_robustness_500.py`**
- Generates 500 diverse prompts (35% simple, 35% literature, 30% mixed)
- Tests researcher triggering accuracy
- Tracks success rates and performance metrics
- Saves intermediate checkpoints every 50 queries

### 2. Launcher
**`run_robustness_test.sh`**
- Easy command-line interface
- Usage: `./run_robustness_test.sh <N>`
- Examples: 10 (quick), 50 (medium), 500 (full)

### 3. Monitor
**`monitor_test.sh`**
- Real-time progress monitoring
- Shows PID, CPU, memory, runtime
- Displays latest output and intermediate results

### 4. Documentation
**`README_ROBUSTNESS_TEST.md`**
- Complete guide to robustness testing
- Prompt distribution details
- Results interpretation
- Performance targets
- Troubleshooting guide

---

## 🎯 What's Being Tested

### 500 Diverse Prompts Testing:

**1. Simple Tool Requests (~175 queries)**
```
"Can you run connectivity analysis on this dataset?"
"I need hub detection for my data."
"Execute CFC wavelet analysis please."
```
**Expected:** Researcher should NOT be triggered

**2. Literature-Focused Queries (~175 queries)**
```
"Run hub detection and check what the literature says."
"Do CFC then search PubMed for validation."
"I need connectivity plus evidence from research papers."
```
**Expected:** Researcher SHOULD be triggered

**3. Mixed/Ambiguous Queries (~150 queries)**
```
"Run normative analysis and make sure it's reasonable."
"Do hub detection and validate the results."
"Can we get CFC done and verify it's correct?"
```
**Expected:** Context-dependent triggering

---

## 📈 Metrics Tracked

### Primary Metrics:
- ✅ **Success Rate** - Queries completed without errors
- ✅ **Researcher Accuracy** - Correct triggering decisions
- ✅ **Precision** - TP / (TP + FP) - When it triggers, how often is it correct?
- ✅ **Recall** - TP / (TP + FN) - When it should trigger, how often does it?
- ✅ **Execution Time** - Average time per query

### Confusion Matrix:
```
                     Researcher        Researcher
                     Triggered         NOT Triggered
Should Trigger       True Positive     False Negative
Shouldn't Trigger    False Positive    True Negative
```

---

## 🎯 Success Targets

| Metric | Target | Note |
|--------|--------|------|
| Success Rate | ≥95% | Pipeline stability |
| Researcher Accuracy | ≥90% | Correct triggering |
| Precision | ≥85% | Low false positives |
| Recall | ≥85% | Low false negatives |
| Avg Time | <5s | Performance |

---

## 📊 Expected Timeline

| Time | Progress | Event |
|------|----------|-------|
| ~10 min | 50 queries | First intermediate checkpoint |
| ~20 min | 100 queries | Second checkpoint |
| ~30 min | 150 queries | Third checkpoint |
| ~1 hour | 200 queries | 40% complete |
| ~2 hours | 300 queries | 60% complete |
| ~3 hours | 400 queries | 80% complete |
| **4-8 hours** | **500 queries** | **COMPLETE** ✅ |

**Note:** Times vary based on model load and query complexity

---

## 📁 Output Files

### Intermediate Checkpoints (every 50 queries):
```
robustness_test_intermediate_50.json
robustness_test_intermediate_100.json
robustness_test_intermediate_150.json
...
robustness_test_intermediate_500.json
```

### Final Results:
```
robustness_test_results_500q_20260216_HHMMSS.json
```

Contains:
- Complete summary statistics
- Researcher confusion matrix
- All 500 detailed query results
- Performance breakdown by query type
- Error analysis

### Log File:
```
robustness_test_500_20260216_102923.log
```

---

## 🔍 How to Analyze Results

### Quick Summary:
```bash
# View overall stats
cat robustness_test_results_500q_*.json | jq '.summary_stats'

# Researcher performance
cat robustness_test_results_500q_*.json | jq '.researcher_analysis'
```

### Find Issues:
```bash
# Failed queries
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.success == false)'

# False positives (shouldn't trigger but did)
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.metadata.should_trigger_researcher == false and .researcher_triggered == true)'

# False negatives (should trigger but didn't)
cat robustness_test_results_500q_*.json | jq '.detailed_results[] | select(.metadata.should_trigger_researcher == true and .researcher_triggered == false)'
```

### Performance Analysis:
```bash
# Average execution time
cat robustness_test_results_500q_*.json | jq '.summary_stats.avg_execution_time'

# Slowest queries
cat robustness_test_results_500q_*.json | jq '.detailed_results | sort_by(.execution_time_seconds) | reverse | .[0:10]'
```

---

## 🎓 Test Data

**Dataset:** `/ram/USERS/zhuoyu73/Andy/Amyloid_SUVR_Swapped.csv`

This file is referenced in many prompts to simulate real-world usage with actual data files.

---

## 🔧 Customization Options

### Generate Different Number of Queries:
```bash
./run_robustness_test.sh 100   # 100 queries
./run_robustness_test.sh 1000  # 1000 queries
```

### Modify Prompt Templates:
Edit `test_orchestrator_robustness_500.py`:
- `SIMPLE_TOOL_PROMPTS` - Add/remove simple tool request templates
- `LITERATURE_PROMPTS` - Add/remove literature-focused templates
- `MIXED_PROMPTS` - Add/remove mixed/ambiguous templates
- `TOOLS` - Add/remove analysis tools
- `CONTEXTS` - Add/remove context variations

### Adjust Researcher Keywords:
In `test_orchestrator_robustness_500.py`, modify:
```python
needs_literature = any(word in query.lower() for word in [
    'literature', 'pubmed', 'evidence', 'research',
    'your_new_keyword',  # Add custom keywords
])
```

---

## 📞 Troubleshooting

### Test Not Running?
```bash
# Check if process exists
ps aux | grep test_orchestrator_robustness_500

# If not, restart
cd /ram/USERS/zhuoyu73/Andy/brain-network-chart/a2a-server
./run_robustness_test.sh 500
```

### Slow Progress?
```bash
# Check server load
ssh yukon.acm.unc.edu
htop

# Check if model is responding
curl http://yukon.acm.unc.edu:11434/api/tags
```

### Log File Empty?
```bash
# Python output is buffered, wait for:
# - First output appears after ~2-3 minutes
# - First checkpoint at 50 queries (~10 minutes)

# Force output flush (if needed)
python3 -u test_orchestrator_robustness_500.py 500
```

---

## 📚 Related Documentation

1. **[README_ROBUSTNESS_TEST.md](./README_ROBUSTNESS_TEST.md)** - Complete test guide
2. **[README_ORCHESTRATION.md](./README_ORCHESTRATION.md)** - Orchestrator documentation
3. **[README_AGENTS.md](./README_AGENTS.md)** - Agent implementation details
4. **[TEST_RESULTS_20CASES.md](./TEST_RESULTS_20CASES.md)** - Previous test results

---

## ✅ Next Steps

### While Test is Running:
1. ⏱️ Wait for completion (4-8 hours estimated)
2. 📊 Monitor progress: `./monitor_test.sh`
3. 📈 Check intermediate results every 50 queries
4. 📝 Review log: `tail -f robustness_test_500_*.log`

### After Test Completes:
1. 📊 Analyze results JSON file
2. 📈 Review success rate and researcher accuracy
3. 🔍 Investigate false positives/negatives
4. 📝 Document findings
5. 🔧 Tune thresholds if needed
6. 🎯 Re-run with adjustments

---

## 🎉 Success Indicators

Your test will be successful if you see:
- ✅ `robustness_test_results_500q_*.json` created
- ✅ Success rate ≥95%
- ✅ Researcher accuracy ≥90%
- ✅ Precision & Recall ≥85%
- ✅ Detailed results for all 500 queries
- ✅ No systematic error patterns

---

## 📧 Quick Reference Commands

```bash
# Monitor status
./monitor_test.sh

# Watch live
tail -f robustness_test_500_20260216_102923.log

# Check progress
ls -lh robustness_test_intermediate_*.json

# Stop test
kill 1100061

# View results
cat robustness_test_results_500q_*.json | jq '.summary_stats'

# Analyze researcher performance
cat robustness_test_results_500q_*.json | jq '.researcher_analysis'
```

---

**Test Started:** 2026-02-16 10:29:23  
**Status:** ✅ RUNNING (PID: 1100061)  
**Working Directory:** `/ram/USERS/zhuoyu73/Andy/brain-network-chart/a2a-server/`  
**Expected Completion:** 4-8 hours from start
