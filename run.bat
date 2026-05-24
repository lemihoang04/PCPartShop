@echo off
REM ==============================================================
REM PCPartShop - Start Backend and Frontend
REM ==============================================================

echo ==========================================
echo   PCPartShop - Starting Application...
echo ==========================================

REM Start Backend in a new window
echo.
echo [Backend] Starting Flask server on port 5000...
start "PCPartShop-Backend" cmd /k "cd /d %~dp0backend && python main.py"

REM Start Frontend in a new window
echo.
echo [Frontend] Starting React dev server on port 3000...
start "PCPartShop-Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo ==========================================
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:3000
echo ==========================================
echo.
echo Both servers started in separate windows.
echo Close those windows to stop the servers.
pause
