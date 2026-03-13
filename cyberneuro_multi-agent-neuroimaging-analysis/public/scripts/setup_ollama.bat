@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo   Ollama Auto-Setup Script for Windows
echo ============================================================
echo.

:: ---- Step 1 - Install Ollama --------------------------------
echo [Step 1/5] Installing Ollama...

where ollama >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo   Ollama is already installed, skipping.
    goto :step2
)

echo   Downloading and installing (the install phase may appear
echo   idle for up to a minute — this is normal, please wait)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://ollama.com/install.ps1 | iex"

:: Refresh PATH so the current session sees the new binary
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
:: ---- Step 2 - Configure environment variables ---------------
echo.
echo [Step 2/5] Configuring environment variables...

:: Persist to User-level registry
powershell -NoProfile -Command ^
  "[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User');"^
  "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','https://acmlab.github.io','User');"

:: Also set for the current session so ollama serve picks them up
set "OLLAMA_HOST=0.0.0.0:11434"
set "OLLAMA_ORIGINS=https://acmlab.github.io"

echo   OLLAMA_HOST    = 0.0.0.0:11434
echo   OLLAMA_ORIGINS = https://acmlab.github.io

:: ---- Step 3 - Restart Ollama --------------------------------
echo.
echo [Step 3/5] Restarting Ollama with new configuration...

taskkill /f /im "Ollama.exe" >nul 2>&1
taskkill /f /im "ollama app.exe" >nul 2>&1
taskkill /f /im "ollama_llama_server.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start ollama serve in a hidden window
powershell -NoProfile -Command "Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden"
echo   Waiting for Ollama to become ready...

:: Poll until ollama responds (max 30 seconds)
set RETRIES=0
:wait_loop
if !RETRIES! geq 15 (
    echo   WARNING: Ollama did not respond within 30 seconds.
    echo   Attempting login anyway...
    goto :step4
)
timeout /t 2 /nobreak >nul
ollama list >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo   Ollama is ready.
    goto :step4
)
set /a RETRIES+=1
goto :wait_loop

:step4
:: ---- Step 4 - Login to Ollama -------------------------------
echo.
echo [Step 4/5] Logging in to Ollama...
echo   (If prompted, enter your Ollama credentials.)
echo.
ollama login

if !ERRORLEVEL! neq 0 (
    echo   WARNING: Login failed or was skipped. Model pull may fail
    echo   if the model requires authentication.
)

:: ---- Step 5 - Pull the default model ------------------------
echo.
echo [Step 5/5] Pulling model gpt-oss:20b-cloud (this may take a while)...
ollama pull gpt-oss:20b-cloud

if !ERRORLEVEL! neq 0 (
    echo   WARNING: Model pull failed. Make sure Ollama is running and try again.
)

:end
echo.
echo ============================================================
echo   Setup complete!  You can now return to the web app.
echo   This window will close in 10 seconds.
echo ============================================================
timeout /t 10 /nobreak >nul
endlocal
