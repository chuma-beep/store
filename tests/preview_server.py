#!/usr/bin/env python3
"""Local preview of the store site: page paths (/app/x/, /themes/) fall back to index.html like the real host.
Usage: python3 tests/preview_server.py [port]   (default 8794)"""
import http.server, os, sys
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=root, **k)

    def log_message(self, *a):
        pass

    def send_head(self):
        p = self.translate_path(self.path)
        if not os.path.exists(p) and "." not in os.path.basename(self.path.split("?")[0]):
            self.path = "/index.html"
        return super().send_head()


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8794), H).serve_forever()
