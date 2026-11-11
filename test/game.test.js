import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { GameStore, generateSecret, score, validateGuess, MAX_ATTEMPTS } from '../src/game.js';

test('generateSecret returns 4 unique digits', () => {
  for (let i = 0; i < 100; i++) {
    const secret = generateSecret();
    assert.match(secret, /^\d{4}$/);
    assert.equal(new Set(secret).size, 4);
  }
});

test('score counts bulls and cows', () => {
  assert.deepEqual(score('1234', '1234'), { bulls: 4, cows: 0 });
  assert.deepEqual(score('1234', '4321'), { bulls: 0, cows: 4 });
  assert.deepEqual(score('1234', '1567'), { bulls: 1, cows: 0 });
  assert.deepEqual(score('1234', '5612'), { bulls: 0, cows: 2 });
  assert.deepEqual(score('1234', '5678'), { bulls: 0, cows: 0 });
});

test('validateGuess rejects bad input', () => {
  assert.equal(validateGuess('1234'), null);
  assert.ok(validateGuess('123'));
  assert.ok(validateGuess('12a4'));
  assert.ok(validateGuess('1123'));
  assert.ok(validateGuess(1234));
});

test('a game is lost after the last attempt', () => {
  const store = new GameStore();
  const { id } = store.create({ secret: '1234' });
  let state;
  const misses = ['5678', '5679', '5689', '5789', '6789', '5670', '5680', '5780', '6780', '5690'];
  for (const miss of misses.slice(0, MAX_ATTEMPTS)) state = store.guess(id, miss);
  assert.equal(state.status, 'lost');
  assert.equal(state.secret, '1234');
  assert.throws(() => store.guess(id, '1234'), { status: 409 });
});

test('expired games are removed', () => {
  let now = 0;
  const store = new GameStore({ ttlMs: 1000, now: () => now });
  const { id } = store.create();
  now = 2000;
  assert.throws(() => store.get(id), { status: 404 });
});

let server;
let baseUrl;
let store;

before(async () => {
  store = new GameStore();
  server = createApp({ games: store });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const post = (path, body) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', body: JSON.stringify(body) });

test('POST /game starts a game without revealing the secret', async () => {
  const res = await post('/game', { name: 'Ada' });
  assert.equal(res.status, 201);
  const game = await res.json();
  assert.equal(game.status, 'playing');
  assert.equal(game.name, 'Ada');
  assert.equal(game.attemptsLeft, MAX_ATTEMPTS);
  assert.equal(game.secret, undefined);
});

test('winning a game puts you on the leaderboard', async () => {
  const { id } = store.create({ name: 'Grace', secret: '9081' });

  let res = await post(`/game/${id}/guess`, { guess: '1890' });
  assert.deepEqual((await res.json()).attempts[0], { guess: '1890', bulls: 0, cows: 4 });

  res = await post(`/game/${id}/guess`, { guess: '9081' });
  const game = await res.json();
  assert.equal(game.status, 'won');
  assert.equal(game.secret, '9081');

  const board = await (await fetch(`${baseUrl}/leaderboard`)).json();
  assert.ok(board.leaderboard.some((e) => e.name === 'Grace' && e.attempts === 2));
});

test('invalid guesses and unknown games return errors', async () => {
  const { id } = await (await post('/game', {})).json();
  assert.equal((await post(`/game/${id}/guess`, { guess: '11' })).status, 400);
  assert.equal((await post('/game/nope/guess', { guess: '1234' })).status, 404);

  const res = await fetch(`${baseUrl}/game/${id}/guess`, { method: 'POST', body: '{oops' });
  assert.equal(res.status, 400);
});

test('GET /play serves the game page', async () => {
  const res = await fetch(`${baseUrl}/play`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Code Breaker/);
});

test('repeating a guess is rejected without using a try', () => {
  const store = new GameStore();
  const { id } = store.create({ secret: '5728' });
  store.guess(id, '1250');
  assert.throws(() => store.guess(id, '1250'), { status: 400, message: /already tried/ });
  assert.equal(store.get(id).attemptsLeft, MAX_ATTEMPTS - 1);
});

test('scores match a real game against 5728', () => {
  const cases = { 2634: [0, 1], 1529: [1, 1], 1258: [1, 2], 1725: [2, 1], 1752: [1, 2], 1720: [2, 0] };
  for (const [guess, [bulls, cows]] of Object.entries(cases)) {
    assert.deepEqual(score('5728', guess), { bulls, cows }, guess);
  }
});
