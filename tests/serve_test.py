"""Tiny static server for testing the store locally: serves files, and falls back to index.html for app routes
(like GitHub Pages' 404 -> app). Usage: serve_test.py DIR PORT"""
import http.server, os, sys, functools

class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or (os.path.isdir(path) and not os.path.exists(os.path.join(path, "index.html"))):
            self.path = "/index.html"
        return super().send_head()
    def log_message(self, *a): pass

d, port = sys.argv[1], int(sys.argv[2])
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=d)).serve_forever()
