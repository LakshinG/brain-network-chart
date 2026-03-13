#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  Ollama Auto-Setup Script for macOS"
echo "============================================================"
echo

# -----------------------------------------------------------
# Step 1 - Install Ollama
# -----------------------------------------------------------
echo "[Step 1/4] Installing Ollama..."

if command -v ollama &>/dev/null; then
    echo "  Ollama is already installed: $(ollama --version 2>/dev/null || echo 'unknown version')"
else
    curl -fsSL https://ollama.com/install.sh | sh
    echo "  Ollama installed successfully."
fi

echo

# -----------------------------------------------------------
# Step 2 - Configure CORS environment variables
# -----------------------------------------------------------
echo "[Step 2/4] Configuring OLLAMA_HOST and OLLAMA_ORIGINS..."

OLLAMA_HOST_VAL="0.0.0.0:11434"
OLLAMA_ORIGINS_VAL="https://acmlab.github.io"

launchctl setenv OLLAMA_HOST "${OLLAMA_HOST_VAL}" 2>/dev/null || true
launchctl setenv OLLAMA_ORIGINS "${OLLAMA_ORIGINS_VAL}" 2>/dev/null || true

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
fi

if [ -n "${SHELL_RC}" ]; then
    grep -q 'OLLAMA_HOST' "${SHELL_RC}" 2>/dev/null || {
        printf '\n# Ollama configuration\nexport OLLAMA_HOST="%s"\nexport OLLAMA_ORIGINS="%s"\n' \
            "${OLLAMA_HOST_VAL}" "${OLLAMA_ORIGINS_VAL}" >> "${SHELL_RC}"
        echo "  Environment variables appended to ${SHELL_RC}"
    }
else
    echo "  No shell profile found — creating ~/.zshrc"
    printf '# Ollama configuration\nexport OLLAMA_HOST="%s"\nexport OLLAMA_ORIGINS="%s"\n' \
        "${OLLAMA_HOST_VAL}" "${OLLAMA_ORIGINS_VAL}" > "$HOME/.zshrc"
fi

export OLLAMA_HOST="${OLLAMA_HOST_VAL}"
export OLLAMA_ORIGINS="${OLLAMA_ORIGINS_VAL}"

echo

# -----------------------------------------------------------
# Step 3 - Restart Ollama
# -----------------------------------------------------------
echo "[Step 3/4] Restarting Ollama with new configuration..."

pkill -x "Ollama" 2>/dev/null || true
pkill -x "ollama" 2>/dev/null || true
sleep 1

if [ -d "/Applications/Ollama.app" ]; then
    open -a Ollama
    echo "  Ollama.app relaunched."
else
    nohup ollama serve &>/dev/null &
    echo "  ollama serve started in background."
fi

echo "  Waiting for Ollama to become ready..."
RETRIES=0
while [ "$RETRIES" -lt 15 ]; do
    if ollama list &>/dev/null; then
        echo "  Ollama is ready."
        break
    fi
    sleep 2
    RETRIES=$((RETRIES + 1))
done

echo

# -----------------------------------------------------------
# Step 4 - Pull the default model
# -----------------------------------------------------------
echo "[Step 4/4] Pulling model gpt-oss:20b-cloud (this may take a while)..."
ollama pull gpt-oss:20b-cloud || echo "  WARNING: Model pull failed. Make sure Ollama is running and try again."

echo
echo "============================================================"
echo "  Setup complete!  You can now return to the web app."
echo "============================================================"
