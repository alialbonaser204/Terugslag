// Duel Arcade on Cloudflare: static game files + a WebSocket relay for online 1v1 duels.
// One Durable Object ("lobby") holds every room, like the old Node server did.
import { DurableObject } from 'cloudflare:workers';

const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_MSG = 32 * 1024;

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // ws -> { peer, rooms: Map(name -> presence), budget, last }
    this.socks = new Map();
    // after waking from hibernation, rebuild who is in which room
    for (const ws of ctx.getWebSockets()) this.sock(ws);
  }

  sock(ws) {
    let s = this.socks.get(ws);
    if (!s) {
      const a = ws.deserializeAttachment() || {};
      s = { peer: a.peer || newPeer(), rooms: new Map(Object.entries(a.rooms || {})), budget: 0, last: Date.now() };
      this.socks.set(ws, s);
    }
    return s;
  }

  save(ws, s) {
    // attachments are small (2 KB): keep presence when it fits, otherwise just the room names
    let rooms = Object.fromEntries(s.rooms);
    if (JSON.stringify(rooms).length > 1800) rooms = Object.fromEntries([...s.rooms.keys()].map((n) => [n, {}]));
    try { ws.serializeAttachment({ peer: s.peer, rooms }); } catch (e) {}
  }

  broadcast(name, fromPeer, msg) {
    const str = JSON.stringify(msg);
    for (const [ws, s] of this.socks) {
      if (s.peer === fromPeer || !s.rooms.has(name)) continue;
      try { ws.send(str); } catch (e) {}
    }
  }

  leave(ws, s, name) {
    if (!s.rooms.delete(name)) return;
    this.save(ws, s);
    this.broadcast(name, s.peer, { t: 'bye', room: name, peer: s.peer });
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const s = { peer: newPeer(), rooms: new Map(), budget: 0, last: Date.now() };
    this.socks.set(server, s);
    this.save(server, s);
    server.send(JSON.stringify({ t: 'hello', peer: s.peer }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const s = this.sock(ws);
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    // flood protection: ~60 messages/second sustained
    const now = Date.now();
    s.budget = Math.max(0, s.budget - (now - s.last) * 0.06); s.last = now;
    if (++s.budget > 120) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;
    const p = m.p && typeof m.p === 'object' && !Array.isArray(m.p) ? m.p : {};

    if (m.t === 'join') {
      if (!s.rooms.has(m.room) && s.rooms.size >= 8) return;
      s.rooms.set(m.room, p);
      this.save(ws, s);
      const list = [];
      for (const [, o] of this.socks) if (o !== s && o.rooms.has(m.room)) list.push({ peer: o.peer, p: o.rooms.get(m.room) });
      ws.send(JSON.stringify({ t: 'peers', room: m.room, list }));
      this.broadcast(m.room, s.peer, { t: 'p', room: m.room, peer: s.peer, p });
    } else if (m.t === 'p') {
      if (!s.rooms.has(m.room)) return;
      s.rooms.set(m.room, p);
      this.save(ws, s);
      this.broadcast(m.room, s.peer, { t: 'p', room: m.room, peer: s.peer, p });
    } else if (m.t === 'leave') {
      this.leave(ws, s, m.room);
    } else if (m.t === 'sig') {
      // voice chat signalling: forward an offer/answer/ICE candidate to one peer in the same room
      if (!s.rooms.has(m.room) || typeof m.to !== 'string') return;
      if (JSON.stringify(m.data ?? null).length > 24000) return;
      for (const [ows, o] of this.socks) {
        if (o.peer === m.to && o.rooms.has(m.room)) {
          try { ows.send(JSON.stringify({ t: 'sig', room: m.room, from: s.peer, data: m.data })); } catch (e) {}
          break;
        }
      }
    }
  }

  gone(ws) {
    const s = this.socks.get(ws) || this.sock(ws);
    for (const name of [...s.rooms.keys()]) this.leave(ws, s, name);
    this.socks.delete(ws);
  }

  async webSocketClose(ws, code) {
    this.gone(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) {}
  }

  async webSocketError(ws) {
    this.gone(ws);
  }
}

function newPeer() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') return env.RELAY.get(env.RELAY.idFromName('lobby')).fetch(req);
    if (url.pathname === '/health') return new Response('ok');
    return env.ASSETS.fetch(req);
  },
};
