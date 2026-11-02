const path = require('node:path');
const http = require('node:http');
const express = require('express');

const PORT = 8080;
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 3001;
const app = express();

app.use('/api', (req, res) => {
  const proxyReq = http.request(
    {
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', () => {
    res.status(502).json({ error: 'Backend unavailable' });
  });
  req.pipe(proxyReq);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bookmark frontend listening on http://0.0.0.0:${PORT}`);
});
