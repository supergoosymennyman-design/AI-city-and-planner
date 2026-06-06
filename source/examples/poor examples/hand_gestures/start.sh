#!/bin/bash
# Engineering Note: Browsers block WASM/MediaPipe if opened as a local file (CORS).
# This script spawns a lightweight server to bypass that.
# Engineering Note: Serves files on localhost to avoid CORS issues with MediaPipe WASM.

PORT=8000
echo "🚀 Launching Gesture Snake on http://localhost:$PORT"
# Try to open browser
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$PORT" &
elif command -v open &> /dev/null; then
    open "http://localhost:$PORT" &
fi
# Start Python HTTP server
python3 -m http.server $PORT
