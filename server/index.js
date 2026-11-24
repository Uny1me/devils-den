// Web server: serves the browser files and runs rooms over WebSockets.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Registry, RoomError } from './room.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = { '/shared/': join(ROOT, 'shared'), '/': join(ROOT, 'public') };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function serveFile(req, res) {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (path === '/') path = '/index.html';
  const prefix = path.startsWith('/shared/') ? '/shared/' : '/';
  const base = DIRS[prefix];
  const file = normalize(join(base, path.slice(prefix.length)));
  if (!file.startsWith(base + sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

export function startServer(port = Number(process.env.PORT) || 3000) {
  const registry = new Registry();
  const server = http.createServer(serveFile);
  const wss = new WebSocketServer({ server });

  wss.on('connection', ws => {
    let room = null, me = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const send = msg => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
    const fail = text => send({ t: 'error', text });

    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      try {
        if (m.t === 'create' || m.t === 'join') {
          if (me) return fail('You are already in a room.');
          if (m.t === 'create') room = registry.create();
          else {
            room = registry.get(m.code);
            if (!room) return send({ t: 'error', code: 'no-room', text: `There’s no room called ${String(m.code || '').toUpperCase() || '…'}. Check the letters with your host.` });
          }
          me = (m.token && room.reconnect(m.token, send)) || room.addPlayer({ name: m.name, look: m.look, send });
          send({ t: 'joined', code: room.code, id: me.id, token: me.token });
          room.broadcast();
          return;
        }
        if (!me) return fail('Join a room first.');
        switch (m.t) {
          case 'look': room.setLook(me, m.look); break;
          case 'playlist': room.setPlaylist(me, m.playlist); break;
          case 'start': room.start(me); break;
          case 'lobby': room.backToLobby(me); break;
          case 'answer': room.answer(me, m.value); break;
          case 'skip': room.skip(me); break;
          case 'leave': room.removePlayer(me.id); room = me = null; send({ t: 'left' }); break;
        }
      } catch (err) {
        if (err instanceof RoomError) {
          if (room && !me && room.players.size === 0) registry.remove(room); // a create that failed to seat anyone
          return fail(err.message);
        }
        console.error(err);
        fail('Something went wrong on the server.');
      }
    });

    ws.on('close', () => { if (room && me) room.disconnect(me); });
  });

  // Drop connections that stopped answering (closed laptop, lost wifi), so the grace timer can start.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref();

  return new Promise(resolve => server.listen(port, () => resolve({ server, wss, registry, port: server.address().port })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer();
  console.log(`Game night server running at http://localhost:${port}`);
}
