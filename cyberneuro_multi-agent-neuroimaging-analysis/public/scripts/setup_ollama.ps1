# Ollama Auto-Setup Script for Windows (PowerShell)
# Run via: irm <URL> | iex

$ErrorActionPreference = "Continue"

Write-Host "============================================================"
Write-Host "  Ollama Auto-Setup Script for Windows"
Write-Host "============================================================"
Write-Host ""

# Step 1 - Install Ollama
Write-Host "[Step 1/5] Installing Ollama..."

if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host "  Ollama is already installed, skipping."
} else {
    Write-Host "  Downloading and installing (please wait)..."
    Write-Host ""
    irm https://ollama.com/install.ps1 | iex
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "  ERROR: Could not find ollama after installation."
        Write-Host "  Please install manually from https://ollama.com/download"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
    Write-Host "  Ollama installed successfully."
}

Write-Host ""

# Step 2 - Configure environment variables
Write-Host "[Step 2/5] Configuring environment variables..."

[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://acmlab.github.io", "User")

$env:OLLAMA_HOST = "0.0.0.0:11434"
$env:OLLAMA_ORIGINS = "https://acmlab.github.io"

Write-Host "  OLLAMA_HOST    = 0.0.0.0:11434"
Write-Host "  OLLAMA_ORIGINS = https://acmlab.github.io"

Write-Host ""

# Step 3 - Restart Ollama
Write-Host "[Step 3/5] Restarting Ollama with new configuration..."

Get-Process -Name "Ollama","ollama app","ollama_llama_server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
Write-Host "  Waiting for Ollama to become ready..."

$retries = 0
while ($retries -lt 15) {
    Start-Sleep -Seconds 2
    try {
        ollama list 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Ollama is ready."
            break
        }
    } catch {}
    $retries++
}
if ($retries -ge 15) {
    Write-Host "  WARNING: Ollama did not respond within 30 seconds."
}

Write-Host ""

# Step 4 - Login to Ollama
Write-Host "[Step 4/5] Logging in to Ollama..."
Write-Host "  (If prompted, enter your Ollama credentials.)"
Write-Host ""
ollama login
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Login failed or was skipped."
}

Write-Host ""

# Step 5 - Pull the default model
Write-Host "[Step 5/5] Pulling model gpt-oss:20b-cloud (this may take a while)..."
ollama pull gpt-oss:20b-cloud
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Model pull failed. Make sure Ollama is running and try again."
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  Setup complete!  You can now return to the web app."
Write-Host "============================================================"
Read-Host "Press Enter to exit"
