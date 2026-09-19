@echo off
REM Champion 3D preview launcher.
REM
REM Double-clicking index.html does NOT work: the page uses ES modules, and browsers block those
REM over file:// for CORS reasons, so nothing runs at all. It needs to be served over http.
REM This starts a tiny local server in this folder and opens the browser at it.

cd /d "%~dp0"
set PORT=8099

echo Starting local server on port %PORT% ...

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%/index.html
    python -m http.server %PORT%
    goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%/index.html
    npx --yes serve -l %PORT% .
    goto :eof
)

echo.
echo Neither Python nor Node was found on this machine.
echo Install either one, or just open the deployed Cloudflare URL instead.
echo.
pause
