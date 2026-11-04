// Teste local: node dev-server.js  ->  http://localhost:3000
// Sem as variáveis do Upstash, os dados ficam no arquivo .devdb.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const api = require('./api/index');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const PUBLICOS = new Set(['index.html', 'app.js', 'styles.css', 'banner.png', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js', 'xlsx.full.min.js']);

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api' || url === '/api/') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const r = {
        status(s) { res.statusCode = s; return r; },
        setHeader: (k, v) => res.setHeader(k, v),
        json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); },
      };
      api({ method: req.method, body: b }, r);
    });
    return;
  }
  const nome = url === '/' ? 'index.html' : url.slice(1);
  if (!PUBLICOS.has(nome)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TIPOS[path.extname(nome)] || 'application/octet-stream');
  fs.createReadStream(path.join(__dirname, nome)).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
