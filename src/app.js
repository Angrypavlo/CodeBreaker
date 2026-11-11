import http from 'node:http';
import { readFileSync } from 'node:fs';
import { GameStore, GameError } from './game.js';

const playPage = readFileSync(new URL('./public/play.html', import.meta.url));
const MAX_BODY_BYTES = 1024;

export function createApp({ games = new GameStore() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res, games);
    } catch (err) {
      if (err instanceof GameError) {
        return sendJson(res, err.status, { error: err.message });
      }
      console.error(err);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  });
}

async function route(req, res, games) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/') {
    return sendJson(res, 200, { message: 'Hello from Node.js!' });
  }

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  if (req.method === 'GET' && pathname === '/play') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(playPage);
  }

  if (req.method === 'GET' && pathname === '/leaderboard') {
    return sendJson(res, 200, { leaderboard: games.leaderboard() });
  }

  if (req.method === 'POST' && pathname === '/game') {
    const body = await readJson(req);
    return sendJson(res, 201, games.create({ name: body.name }));
  }

  const match = pathname.match(/^\/game\/([\w-]+)(\/guess)?$/);
  if (match) {
    const [, id, isGuess] = match;
    if (req.method === 'GET' && !isGuess) {
      return sendJson(res, 200, games.get(id));
    }
    if (req.method === 'POST' && isGuess) {
      const body = await readJson(req);
      return sendJson(res, 200, games.guess(id, body.guess));
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new GameError(413, 'Body too large');
  }
  if (!raw) return {};
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new GameError(400, 'Invalid JSON');
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
