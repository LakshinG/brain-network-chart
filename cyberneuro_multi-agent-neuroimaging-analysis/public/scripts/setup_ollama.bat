@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo   Ollama Auto-Setup Script for Windows
echo ============================================================
echo.

:: Step 1 - Install Ollama automatically via the official installer
echo [Step 1/3] Installing Ollama...

where ollama >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo   Ollama is already installed, skipping download.
    goto :step2
)

echo   Downloading and installing via official installer...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://ollama.com/install.ps1 | iex"

:: Refresh PATH so the current session can find the newly installed binary.
:: The installer writes to the User PATH, which this shell has not reloaded.
for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do (
    set "PATH=%%B;!PATH!"
)

where ollama >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo.
    echo   ERROR: Could not find ollama after installation.
    echo   Please install manually from https://ollama.com/download
    goto :end
)
echo.
echo   Ollama installed successfully.

:step2
:: Step 2 - Set environment variables for the current user
echo.
echo [Step 2/3] Configuring environment variables...

powershell -NoProfile -Command ^
  "[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User');"^
  "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','https://acmlab.github.io','User');"

echo   OLLAMA_HOST    = 0.0.0.0:11434
echo   OLLAMA_ORIGINS = https://acmlab.github.io
echo   (User-level environment variables have been written.)
echo.
echo   Please quit and reopen the Ollama desktop app so it picks
echo   up the new variables, then press any key to continue...
pause >nul

:: Step 3 - Pull the default model
echo.
echo [Step 3/3] Pulling model gpt-oss:20b-cloud (this may take a while)...
ollama pull gpt-oss:20b-cloud

if !ERRORLEVEL! neq 0 (
    echo   WARNING: Model pull failed. Make sure Ollama is running and try again.
)

:end
echo.
echo ============================================================
echo   Setup complete!  You can now return to the web app.
echo ============================================================
pause
endlocal
