#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  Ollama Auto-Setup Script for Linux"
echo "============================================================"
echo

# -----------------------------------------------------------
# Step 1 - Install Ollama via the official installer
# -----------------------------------------------------------
echo "[Step 1/3] Installing Ollama..."

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
echo "[Step 2/3] Configuring OLLAMA_HOST and OLLAMA_ORIGINS..."

OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
OVERRIDE_FILE="${OVERRIDE_DIR}/environment.conf"

if [ -d /run/systemd/system ]; then
    sudo mkdir -p "${OVERRIDE_DIR}"

    sudo tee "${OVERRIDE_FILE}" >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=https://acmlab.github.io"
EOF

    sudo systemctl daemon-reload
    sudo systemctl restart ollama
    echo "  systemd override written to ${OVERRIDE_FILE}"
    echo "  Ollama service restarted."
else
    echo "  systemd not detected."
    echo "  Please add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "    export OLLAMA_HOST=\"0.0.0.0:11434\""
    echo "    export OLLAMA_ORIGINS=\"https://acmlab.github.io\""
    echo ""
    echo "  Then restart your terminal and re-launch Ollama."
fi

echo

# -----------------------------------------------------------
# Step 3 - Pull the default model
# -----------------------------------------------------------
echo "[Step 3/3] Pulling model gpt-oss:20b-cloud (this may take a while)..."
ollama pull gpt-oss:20b-cloud || echo "  WARNING: Model pull failed. Make sure Ollama is running and try again."

echo
echo "============================================================"
echo "  Setup complete!  You can now return to the web app."
echo "============================================================"
