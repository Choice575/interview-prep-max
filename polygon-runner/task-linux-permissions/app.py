from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

CONFIG = Path('/etc/anketa/config.ini').read_text(encoding='utf-8')
SECRET = Path('/etc/anketa/api.key').read_text(encoding='utf-8').strip()
PORT = int(next(line.split('=', 1)[1] for line in CONFIG.splitlines() if line.startswith('PORT=')))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/health':
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *_args):
        return

HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
