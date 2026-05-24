#!/bin/bash

# ==============================================================
# PCPartShop - Start Backend & Frontend
# ==============================================================

echo "=========================================="
echo "  PCPartShop - Starting Application..."
echo "=========================================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Start Backend ---
echo ""
echo "[Backend] Starting Flask server on port 5000..."
cd "$SCRIPT_DIR/backend"
python main.py &
BACKEND_PID=$!
echo "[Backend] PID: $BACKEND_PID"

# --- Start Frontend ---
echo ""
echo "[Frontend] Starting React dev server on port 3000..."
cd "$SCRIPT_DIR/frontend"
npm start &
FRONTEND_PID=$!
echo "[Frontend] PID: $FRONTEND_PID"

echo ""
echo "=========================================="
echo "  Backend:  http://localhost:5000"
echo "  Frontend: http://localhost:3000"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both processes
cleanup() {
    echo ""
    echo "[Shutdown] Stopping Backend (PID: $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null
    echo "[Shutdown] Stopping Frontend (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID 2>/dev/null
    echo "[Shutdown] All servers stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
