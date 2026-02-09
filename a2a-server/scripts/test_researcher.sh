#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8013}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "python3 or python not found"
  exit 1
fi

call_api() {
  local file="$1"
  local response
  response="$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/a2a/act" \
    -H "Content-Type: application/json" \
    --data-binary @"${file}" || true)"
  local body status
  body="$(printf "%s" "${response}" | sed '$d')"
  status="$(printf "%s" "${response}" | tail -n 1)"
  echo "Status ${status} for ${file}"
  if [ -z "${body}" ]; then
    echo "Empty response body"
    return 1
  fi
  if ! printf "%s" "${body}" | "${PYTHON_BIN}" -m json.tool >/dev/null 2>&1; then
    echo "Non-JSON response:"
    printf "%s\n" "${body}"
    return 1
  fi
  printf "%s" "${body}" | "${PYTHON_BIN}" -m json.tool
}

call_api "examples/keywords.json"
call_api "examples/evidence.json"
call_api "examples/stats.json"
call_api "examples/config_check.json"
