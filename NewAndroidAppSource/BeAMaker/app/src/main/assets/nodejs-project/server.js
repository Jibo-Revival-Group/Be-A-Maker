'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { BamRom } = require('./lib/bam-rom');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const REPO = path.join(ROOT, '..');
const PUBLIC = path.join(ROOT, 'public');
const PLAYGROUND = path.join(REPO, 'assets', 'web', 'playground');
const ASSETS = path.join(REPO, 'assets');
const RES = path.join(REPO, 'res');
const MEDIA = path.join(ROOT, 'data', 'media');

fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(path.join(MEDIA, 'thumbs'), { recursive: true });

const app = express();
const rom = new BamRom();

app.use(express.json({ limit: '12mb' }));
app.get('/splash.png', (_req, res) => {
  res.sendFile(path.join(REPO, 'splash.png'));
});
app.use(express.static(PUBLIC));
app.use('/playground', express.static(PLAYGROUND));
app.use('/apk/assets', express.static(ASSETS));
app.use('/apk/mipmap', express.static(path.join(RES, 'mipmap-xxhdpi')));
app.use('/apk/mipmap', express.static(path.join(RES, 'mipmap-xhdpi')));
app.use('/apk/mipmap', express.static(path.join(RES, 'mipmap-hdpi')));
app.use('/apk/mipmap', express.static(path.join(RES, 'mipmap-mdpi')));
app.use('/apk/drawable', express.static(path.join(RES, 'drawable-xxhdpi')));
app.use('/apk/drawable', express.static(path.join(RES, 'drawable-xhdpi')));
app.use('/apk/drawable', express.static(path.join(RES, 'drawable-hdpi')));
app.use('/apk/raw', express.static(path.join(RES, 'raw')));
app.use('/media', express.static(MEDIA));

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function isLoopbackHost(host) {
  const name = String(host || '').split(':')[0];
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name === '[::1]';
}

function robotOrigin(req) {
  const hostHeader = req.get('host') || '';
  if (hostHeader && !isLoopbackHost(hostHeader)) {
    return `${req.protocol}://${hostHeader}`;
  }
  const ips = lanAddresses();
  if (ips[0]) return `http://${ips[0]}:${PORT}`;
  return `http://127.0.0.1:${PORT}`;
}

function decodeImageData(data) {
  const raw = String(data || '');
  const comma = raw.indexOf(',');
  const b64 = raw.startsWith('data:') && comma !== -1 ? raw.slice(comma + 1) : raw;
  return Buffer.from(b64, 'base64');
}

function sniffExt(buf, mime) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return '.png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return '.jpg';
  }
  const hinted = String(mime || '').toLowerCase();
  if (hinted.includes('jpeg') || hinted.includes('jpg')) return '.jpg';
  if (hinted.includes('png')) return '.png';
  return '';
}

function safeMediaRel(id, ext) {
  const raw = String(id || '').replace(/\\/g, '/');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  if (parts.some((part) => part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) {
    return null;
  }
  const last = parts[parts.length - 1].replace(/\.(png|jpe?g)$/i, '');
  if (!last) return null;
  parts[parts.length - 1] = last + ext;
  return parts.join('/');
}

function resolveMedia(rel) {
  const full = path.resolve(MEDIA, rel);
  const root = path.resolve(MEDIA);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

app.get('/scratch', (_req, res) => {
  res.sendFile(path.join(PUBLIC, 'scratch.html'));
});

app.get('/api/status', (_req, res) => {
  res.json(rom.status());
});

app.get('/api/lan', (req, res) => {
  res.json({
    port: PORT,
    addresses: lanAddresses(),
    origin: robotOrigin(req)
  });
});

app.get('/api/cool-ideas', (_req, res) => {
  res.sendFile(path.join(RES, 'raw', 'cool_ideas.json'));
});

app.post('/api/media', (req, res) => {
  try {
    const buf = decodeImageData(req.body && req.body.data);
    if (!buf.length || buf.length > 8 * 1024 * 1024) {
      res.status(400).json({ message: 'Image is missing or too large.' });
      return;
    }
    const ext = sniffExt(buf, req.body && req.body.mime);
    if (!ext) {
      res.status(400).json({ message: 'Use a PNG or JPEG image.' });
      return;
    }
    const fallback = 'm-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const rel = safeMediaRel((req.body && req.body.id) || fallback, ext);
    const file = rel && resolveMedia(rel);
    if (!file) {
      res.status(400).json({ message: 'Invalid media id.' });
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    res.json({ id: rel, url: '/media/' + rel });
  } catch (err) {
    res.status(400).json({
      message: err && err.message ? err.message : 'Could not save image.'
    });
  }
});

app.post('/api/display', async (req, res) => {
  try {
    if (req.body && (req.body.eye || req.body.clear)) {
      await rom.showEye();
      res.json({ ok: true, eye: true });
      return;
    }
    const mediaId = String((req.body && req.body.mediaId) || '');
    const ext = /\.jpe?g$/i.test(mediaId) ? '.jpg' : '.png';
    const rel = safeMediaRel(mediaId, ext);
    const file = rel && resolveMedia(rel);
    if (!file || !fs.existsSync(file)) {
      res.status(400).json({ message: 'Unknown media id.' });
      return;
    }
    let origin = String((req.body && req.body.origin) || robotOrigin(req)).replace(/\/$/, '');
    if (!/^https?:\/\//i.test(origin)) {
      origin = robotOrigin(req);
    }
    const uri = origin + '/media/' + rel;
    const name = path.basename(rel, path.extname(rel)).slice(0, 255);
    await rom.showImage(uri, name);
    res.json({ ok: true, uri });
  } catch (err) {
    res.status(502).json({
      ok: false,
      message: err && err.message ? err.message : String(err)
    });
  }
});

app.get('/api/camera/stream', async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    await rom.pipeCamera(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({
        message: err && err.message ? err.message : String(err)
      });
    }
  }
});

app.post('/api/camera/stop', (_req, res) => {
  rom.stopCamera();
  res.json({ ok: true });
});

app.post('/api/connect', async (req, res) => {
  try {
    const status = await rom.connect(req.body && req.body.host);
    res.json(status);
  } catch (err) {
    res.status(502).json({
      connected: false,
      message: err && err.message ? err.message : String(err)
    });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await rom.disconnect();
  res.json({ connected: false });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  send(ws, { type: 'status', state: rom.connected ? 'connected' : 'disconnected', ...rom.status() });
  const off = rom.onMessage((msg) => send(ws, msg));
  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw));
    } catch (_) {
      return;
    }
    if (data.type === 'command') {
      await rom.handleCommand(data);
    }
  });
  ws.on('close', off);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Be a Maker web app: http://127.0.0.1:${PORT}`);
});
