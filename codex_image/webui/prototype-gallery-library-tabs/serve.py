"""PROTOTYPE ONLY: serve the personal/team gallery UI variants."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 4319


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Gallery prototype: http://{HOST}:{PORT}/?variant=A")
    ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler).serve_forever()
