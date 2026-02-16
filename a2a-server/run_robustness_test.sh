#!/bin/bash
# Launcher for Orchestrator Robustness Test

echo "========================================"
echo "Orchestrator Robustness Test Launcher"
echo "========================================"
echo ""

# Check if number of queries is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <number_of_queries>"
    echo ""
    echo "Examples:"
    echo "  $0 10      # Quick test with 10 queries"
    echo "  $0 50      # Small test with 50 queries"
    echo "  $0 500     # Full robustness test (LONG - several hours)"
    echo ""
    exit 1
fi

N_QUERIES=$1
LOG_FILE="robustness_test_${N_QUERIES}q_$(date +%Y%m%d_%H%M%S).log"

echo "Configuration:"
echo "  Queries: $N_QUERIES"
echo "  Model: MedAIBase/MedGemma1.5:4b"
echo "  Host: yukon.acm.unc.edu:11434"
echo "  Test Data: /ram/USERS/zhuoyu73/Andy/Amyloid_SUVR_Swapped.csv"
echo "  Log File: $LOG_FILE"
echo ""

# Estimate time
if [ "$N_QUERIES" -le 10 ]; then
    estimate="~2-3 minutes"
elif [ "$N_QUERIES" -le 50 ]; then
    estimate="~10-15 minutes"
elif [ "$N_QUERIES" -le 100 ]; then
    estimate="~20-30 minutes"
else
    estimate="~$(($N_QUERIES / 2))-$(($N_QUERIES)) minutes (potentially hours)"
fi

echo "⏱️  Estimated time: $estimate"
echo ""
echo "Starting test..."
echo "Press Ctrl+C to cancel"
echo ""

# Run the test and save output to log
python3 test_orchestrator_robustness_500.py "$N_QUERIES" 2>&1 | tee "$LOG_FILE"

echo ""
echo "========================================"
echo "Test Complete!"
echo "Log saved to: $LOG_FILE"
echo "Results saved to: robustness_test_results_${N_QUERIES}q_*.json"
echo "========================================"
