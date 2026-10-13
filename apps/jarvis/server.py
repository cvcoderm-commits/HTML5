#!/usr/bin/env python3
"""
J.A.R.V.I.S. local launcher.

Browsers block camera (getUserMedia) and microphone access on pages opened
directly from disk (file:///...). They require a "secure context" — either
https:// or http://localhost. This script serves the app over localhost so
every feature (camera, mic, gestures) works correctly.

Usage:
    python3 server.py
    (then open the URL it prints — it should also open automatically)
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Helpful CORS header in case you swap in your own APIs later
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main():
    global PORT
    while True:
        try:
            with socketserver.TCPServer(("", PORT), Handler) as httpd:
                url = f"http://localhost:{PORT}/index.html"
                print(f"J.A.R.V.I.S. is running at {url}")
                print("Press Ctrl+C to stop.")
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
                httpd.serve_forever()
            break
        except OSError:
            PORT += 1
            if PORT > 8010:
                raise


if __name__ == "__main__":
    main()
