#!/bin/bash
# Monitor Robustness Test Progress

LOG_FILE=$(ls -t robustness_test_500_*.log 2>/dev/null | head -1)

if [ -z "$LOG_FILE" ]; then
    echo "❌ No log file found"
    echo "Looking for: robustness_test_500_*.log"
    exit 1
fi

echo "========================================"
echo "Robustness Test Monitor"
echo "========================================"
echo "Log file: $LOG_FILE"
echo "Size: $(du -h "$LOG_FILE" | cut -f1)"
echo ""

# Check if process is running
PID=$(ps aux | grep "test_orchestrator_robustness_500.py 500" | grep -v grep | awk '{print $2}')
if [ -n "$PID" ]; then
    echo "✅ Process running (PID: $PID)"
    echo "CPU: $(ps -p $PID -o %cpu | tail -1)%"
    echo "Memory: $(ps -p $PID -o %mem | tail -1)%"
    echo "Runtime: $(ps -p $PID -o etime | tail -1)"
else
    echo "⚠️  Process not running (may be complete or failed)"
fi

echo ""
echo "========================================"
echo "Latest Output:"
echo "========================================"
tail -30 "$LOG_FILE"

echo ""
echo "========================================"
echo "Intermediate Results:"
echo "========================================"
INTERMEDIATE=$(ls -t robustness_test_intermediate_*.json 2>/dev/null | head -1)
if [ -n "$INTERMEDIATE" ]; then
    echo "Latest checkpoint: $INTERMEDIATE"
    QUERIES=$(basename "$INTERMEDIATE" | grep -oP '\d+' | head -1)
    echo "Queries completed: $QUERIES / 500"
    echo "Progress: $(echo "scale=1; $QUERIES / 500 * 100" | bc)%"
else
    echo "No intermediate results yet (saved every 50 queries)"
fi

echo ""
echo "========================================"
echo "Commands:"
echo "  Watch live:    tail -f $LOG_FILE"
echo "  Stop test:     kill $PID"
echo "  View results:  ls -lh robustness_test_results_*.json"
echo "========================================"
