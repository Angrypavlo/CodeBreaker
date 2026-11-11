import { randomInt, randomUUID } from 'node:crypto';

export const CODE_LENGTH = 4;
export const MAX_ATTEMPTS = 10;

/** Pick `length` distinct random digits, e.g. "4071". */
export function generateSecret(length = CODE_LENGTH) {
  const digits = [...'0123456789'];
  for (let i = 0; i < length; i++) {
    const j = randomInt(i, digits.length);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, length).join('');
}

/** Returns an error message, or null if the guess is valid. */
export function validateGuess(guess, length = CODE_LENGTH) {
  if (typeof guess !== 'string' || !/^\d+$/.test(guess) || guess.length !== length) {
    return `Guess must be exactly ${length} digits`;
  }
  if (new Set(guess).size !== length) {
    return 'Digits must not repeat';
  }
  return null;
}

/** Bulls: right digit in the right place. Cows: right digit in the wrong place. */
export function score(secret, guess) {
  let bulls = 0;
  let cows = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) bulls++;
    else if (secret.includes(guess[i])) cows++;
  }
  return { bulls, cows };
}

export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class GameStore {
  #games = new Map();
  #leaderboard = [];

  constructor({ maxGames = 1000, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    this.maxGames = maxGames;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  create({ name, secret = generateSecret() } = {}) {
    this.#prune();
    const game = {
      id: randomUUID(),
      name: cleanName(name),
      secret,
      attempts: [],
      status: 'playing',
      startedAt: this.now(),
      finishedAt: null,
    };
    this.#games.set(game.id, game);
    return view(game);
  }

  get(id) {
    return view(this.#find(id));
  }

  guess(id, guess) {
    const game = this.#find(id);
    if (game.status !== 'playing') {
      throw new GameError(409, `Game is already ${game.status}`);
    }
    const error = validateGuess(guess, game.secret.length);
    if (error) throw new GameError(400, error);
    if (game.attempts.some((a) => a.guess === guess)) {
      throw new GameError(400, `You already tried ${guess}`);
    }

    const result = score(game.secret, guess);
    game.attempts.push({ guess, ...result });

    if (result.bulls === game.secret.length) {
      game.status = 'won';
    } else if (game.attempts.length >= MAX_ATTEMPTS) {
      game.status = 'lost';
    }
    if (game.status !== 'playing') {
      game.finishedAt = this.now();
      if (game.status === 'won') this.#record(game);
    }
    return view(game);
  }

  leaderboard(limit = 10) {
    return this.#leaderboard.slice(0, limit);
  }

  #find(id) {
    const game = this.#games.get(id);
    if (!game || this.#expired(game)) {
      this.#games.delete(id);
      throw new GameError(404, 'Game not found');
    }
    return game;
  }

  #record(game) {
    this.#leaderboard.push({
      name: game.name,
      attempts: game.attempts.length,
      timeMs: game.finishedAt - game.startedAt,
      date: new Date(game.finishedAt).toISOString(),
    });
    this.#leaderboard.sort((a, b) => a.attempts - b.attempts || a.timeMs - b.timeMs);
    this.#leaderboard.length = Math.min(this.#leaderboard.length, 100);
  }

  #expired(game) {
    return this.now() - game.startedAt > this.ttlMs;
  }

  #prune() {
    for (const [id, game] of this.#games) {
      if (this.#expired(game)) this.#games.delete(id);
    }
    // Map keeps insertion order, so the first keys are the oldest games.
    while (this.#games.size >= this.maxGames) {
      this.#games.delete(this.#games.keys().next().value);
    }
  }
}

function cleanName(name) {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 20) : '';
  return trimmed || 'Anonymous';
}

function view(game) {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    codeLength: game.secret.length,
    attempts: game.attempts,
    attemptsLeft: MAX_ATTEMPTS - game.attempts.length,
    // Only reveal the secret once the game is over.
    ...(game.status !== 'playing' && { secret: game.secret }),
  };
}
