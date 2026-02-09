#!/usr/bin/env bash
set -euo pipefail

SCHEMA_URL="${1:-http://yukon.acm.unc.edu:8010/api/schema}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "python3 or python not found"
  exit 1
fi

echo "Fetching MCP schema from ${SCHEMA_URL} ..."
response="$(curl -sS -w "\n%{http_code}" "${SCHEMA_URL}" || true)"
schema_json="$(printf "%s" "${response}" | sed '$d')"
status_code="$(printf "%s" "${response}" | tail -n 1)"

if [ -z "${schema_json}" ] || [ "${status_code}" != "200" ]; then
  echo "Failed to fetch MCP schema (status ${status_code})."
  if [ -n "${schema_json}" ]; then
    echo "Response (first 200 chars):"
    printf "%s" "${schema_json}" | head -c 200
    echo ""
  fi
  exit 1
fi

if ! printf "%s" "${schema_json}" | "${PYTHON_BIN}" - <<'PY' >/dev/null 2>&1; then
import json, sys
json.load(sys.stdin)
PY
  echo "MCP schema is not valid JSON."
  echo "Response (first 200 chars):"
  printf "%s" "${schema_json}" | head -c 200
  echo ""
  exit 1
fi

read -r PUBMED DUCKDUCK STATS < <(
  printf "%s" "${schema_json}" | "${PYTHON_BIN}" - <<'PY'
import json, sys

schema = json.load(sys.stdin)

def all_strings(node, acc):
    if node is None:
        return
    if isinstance(node, str):
        acc.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            all_strings(v, acc)
    elif isinstance(node, list):
        for v in node:
            all_strings(v, acc)

strings = []
all_strings(schema, strings)
paths = list(schema.get("paths", {}).keys()) if isinstance(schema, dict) else []

candidates = []
for s in paths + strings:
    if isinstance(s, str) and (s.startswith("/") or s.startswith("http")):
        candidates.append(s)

def pick(tokens):
    tokens = [t.lower() for t in tokens]
    filtered = [c for c in candidates if any(t in c.lower() for t in tokens)]
    filtered = sorted(set(filtered), key=len)
    return filtered[0] if filtered else ""

pubmed = pick(["pubmed"])
duckduck = pick(["duckduck", "duckduckgo", "search"])
stats = pick(["stat", "stats", "analysis", "regression", "correlation"])

print(pubmed, duckduck, stats)
PY
)

if [ -z "${PUBMED}" ] && [ -z "${DUCKDUCK}" ] && [ -z "${STATS}" ]; then
  echo "No endpoints discovered. Set MCP_*_ENDPOINT manually."
  exit 1
fi

export MCP_PUBMED_ENDPOINT="${PUBMED}"
export MCP_DUCKDUCK_ENDPOINT="${DUCKDUCK}"
export MCP_STATS_ENDPOINT="${STATS}"

echo "Resolved endpoints (current shell session):"
echo "MCP_PUBMED_ENDPOINT=${MCP_PUBMED_ENDPOINT}"
echo "MCP_DUCKDUCK_ENDPOINT=${MCP_DUCKDUCK_ENDPOINT}"
echo "MCP_STATS_ENDPOINT=${MCP_STATS_ENDPOINT}"

echo ""
echo "To persist, add to your shell profile:"
echo "export MCP_PUBMED_ENDPOINT=\"${MCP_PUBMED_ENDPOINT}\""
echo "export MCP_DUCKDUCK_ENDPOINT=\"${MCP_DUCKDUCK_ENDPOINT}\""
echo "export MCP_STATS_ENDPOINT=\"${MCP_STATS_ENDPOINT}\""
