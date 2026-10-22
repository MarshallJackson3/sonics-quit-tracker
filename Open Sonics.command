#!/bin/bash
# Double-click to open the Sonics app in your browser on this Mac.
# Keep this window open while you use it. Close it (or press Ctrl+C) to stop.

cd "$(dirname "$0")/app" || exit 1
printf '\033]0;Sonics\007'
PORT=8123

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python isn't installed. Get it from https://www.python.org/downloads/ and try again."
  read -r -p "Press Return to close this window." _
  exit 1
fi

if curl -s "http://localhost:$PORT/" >/dev/null 2>&1; then
  echo "Sonics is already running. Opening it..."
  open "http://localhost:$PORT/"
  exit 0
fi

echo "Starting Sonics at http://localhost:$PORT/"
echo "Keep this window open while you use it. Close it to stop."
(sleep 1; open "http://localhost:$PORT/") &
python3 -m http.server "$PORT" --bind 127.0.0.1
