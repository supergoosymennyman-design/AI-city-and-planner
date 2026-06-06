@echo off
setlocal enabledelayedexpansion

REM Engineering Note: Browsers block WASM/MediaPipe if opened as a local file (CORS).
REM This script spawns a lightweight server to bypass that.

set PORT=8000

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Gesture Snake Launcher
echo ========================================
echo.
echo ^> Launching server on http://localhost:!PORT!
echo.

REM Open browser
start "" "http://localhost:!PORT!"

REM Start Python HTTP server
python -m http.server !PORT!
pause
