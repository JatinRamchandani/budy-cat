#!/usr/bin/env python3
"""
CAT Prep App — one-command launcher.
Runs the parser (if needed) then starts a local HTTP server.

Usage:
    python3 serve.py          # serves on http://localhost:8080
    python3 serve.py 9000     # custom port
"""

import http.server
import os
import subprocess
import sys
import webbrowser
from pathlib import Path

WEB_DIR = Path(__file__).parent / "web"
QJS = WEB_DIR / "questions.json"


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

    if not QJS.exists():
        print("questions.json not found — running parser...")
        result = subprocess.run([sys.executable, "parse_questions.py"], cwd=Path(__file__).parent)
        if result.returncode != 0:
            print("Parser failed. Install beautifulsoup4:  pip3 install beautifulsoup4")
            sys.exit(1)

    os.chdir(WEB_DIR)
    url = f"http://localhost:{port}"
    print(f"\n✅  CAT Prep App running at  {url}\n   Press Ctrl+C to stop.\n")

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass  # suppress request logs

    webbrowser.open(url)
    with http.server.HTTPServer(("", port), QuietHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
