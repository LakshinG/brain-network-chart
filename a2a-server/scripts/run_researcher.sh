#!/usr/bin/env bash
set -euo pipefail

uvicorn researcher_agent.server:app --host 0.0.0.0 --port 8013
