// Terugslag – game server: serves the game and relays online 1v1 duels over WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = '/';
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) {}
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = path.join(PUB, path.normalize(p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Niet gevonden'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(data);
  });
});

// rooms: name -> Map(peerId -> { ws, p })
const rooms = new Map();
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

function broadcast(name, from, msg) {
  const r = rooms.get(name);
  if (!r) return;
  const s = JSON.stringify(msg);
  for (const [id, v] of r) if (id !== from && v.ws.readyState === 1) v.ws.send(s);
}

wss.on('connection', (ws) => {
  const peer = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const mine = new Set();
  let budget = 0, last = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ t: 'hello', peer }));

  function leave(name) {
    const r = rooms.get(name);
    mine.delete(name);
    if (!r) return;
    r.delete(peer);
    if (!r.size) rooms.delete(name);
    else broadcast(name, peer, { t: 'bye', room: name, peer });
  }

  ws.on('message', (raw) => {
    // simple flood protection: ~60 messages/second sustained
    const now = Date.now();
    budget = Math.max(0, budget - (now - last) * 0.06); last = now;
    if (++budget > 120) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;
    if (m.t === 'sig' && JSON.stringify(m.data || null).length > 24000) return;
    const p = m.p && typeof m.p === 'object' ? m.p : {};
    if (m.t === 'join') {
      if (!mine.has(m.room) && mine.size >= 8) return;
      let r = rooms.get(m.room);
      if (!r) { r = new Map(); rooms.set(m.room, r); }
      r.set(peer, { ws, p });
      mine.add(m.room);
      ws.send(JSON.stringify({ t: 'peers', room: m.room,
        list: [...r].filter(([id]) => id !== peer).map(([id, v]) => ({ peer: id, p: v.p })) }));
      broadcast(m.room, peer, { t: 'p', room: m.room, peer, p });
    } else if (m.t === 'p') {
      const r = rooms.get(m.room);
      if (!r || !r.has(peer)) return;
      r.get(peer).p = p;
      broadcast(m.room, peer, { t: 'p', room: m.room, peer, p });
    } else if (m.t === 'leave') {
      leave(m.room);
    } else if (m.t === 'sig') {
      // voice chat signalling: forward an offer/answer/ICE candidate to one peer in the same room
      const r = rooms.get(m.room);
      if (!r || !r.has(peer) || typeof m.to !== 'string' || !r.has(m.to)) return;
      const target = r.get(m.to).ws;
      if (target.readyState === 1) target.send(JSON.stringify({ t: 'sig', room: m.room, from: peer, data: m.data }));
    }
  });
  ws.on('close', () => { for (const n of [...mine]) leave(n); });
});

// drop dead connections so opponents see you leave
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 15000);

server.listen(PORT, () => console.log('Terugslag draait op poort ' + PORT));
