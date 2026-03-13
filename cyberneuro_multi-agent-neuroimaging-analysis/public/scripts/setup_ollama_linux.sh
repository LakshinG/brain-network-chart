#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  Ollama Auto-Setup Script for Linux"
echo "============================================================"
echo

# -----------------------------------------------------------
# Step 1 - Install Ollama
# -----------------------------------------------------------
echo "[Step 1/5] Installing Ollama..."

if command -v ollama &>/dev/null; then
    echo "  Ollama is already installed: $(ollama --version 2>/dev/null || echo 'unknown version')"
else
    curl -fsSL https://ollama.com/install.sh | sh
    echo "  Ollama installed successfully."
fi

echo

# -----------------------------------------------------------
# Step 2 - Configure CORS via systemd override
# -----------------------------------------------------------
echo "[Step 2/5] Configuring OLLAMA_HOST and OLLAMA_ORIGINS..."

OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
OVERRIDE_FILE="${OVERRIDE_DIR}/environment.conf"

if [ -d /run/systemd/system ]; then
    sudo mkdir -p "${OVERRIDE_DIR}"

    sudo tee "${OVERRIDE_FILE}" >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=https://acmlab.github.io"
EOF

    echo "  systemd override written to ${OVERRIDE_FILE}"
else
    echo "  systemd not detected — writing to ~/.bashrc instead."
    grep -q 'OLLAMA_HOST' "$HOME/.bashrc" 2>/dev/null || {
        printf '\n# Ollama configuration\nexport OLLAMA_HOST="0.0.0.0:11434"\nexport OLLAMA_ORIGINS="https://acmlab.github.io"\n' >> "$HOME/.bashrc"
    }
fi

export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="https://acmlab.github.io"

echo

# -----------------------------------------------------------
# Step 3 - Restart Ollama
# -----------------------------------------------------------
echo "[Step 3/5] Restarting Ollama with new configuration..."

if [ -d /run/systemd/system ]; then
    sudo systemctl daemon-reload
    sudo systemctl restart ollama
    echo "  Ollama service restarted via systemd."
else
    pkill -x ollama 2>/dev/null || true
    sleep 1
    nohup ollama serve &>/dev/null &
    echo "  Ollama restarted in background."
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
# Step 4 - Login to Ollama
# -----------------------------------------------------------
echo "[Step 4/5] Logging in to Ollama..."
echo "  (If prompted, enter your Ollama credentials.)"
echo
ollama login || echo "  WARNING: Login failed or was skipped."

echo

# -----------------------------------------------------------
# Step 5 - Pull the default model
# -----------------------------------------------------------
echo "[Step 5/5] Pulling model gpt-oss:20b-cloud (this may take a while)..."
ollama pull gpt-oss:20b-cloud || echo "  WARNING: Model pull failed. Make sure Ollama is running and try again."

echo
echo "============================================================"
echo "  Setup complete!  You can now return to the web app."
echo "============================================================"
