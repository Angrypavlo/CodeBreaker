# Node.js Project

A simple HTTP server built with Node.js. It has no dependencies.

## Requirements

- Node.js 20 or later

## Scripts

| Command         | Description                              |
| --------------- | ---------------------------------------- |
| `npm start`     | Start the server                         |
| `npm run dev`   | Start the server and restart on changes  |
| `npm test`      | Run the tests with the built-in runner   |

The server listens on port `3000` by default. Set `PORT` to change it.

## Endpoints

- `GET /` returns a greeting
- `GET /health` returns the status and uptime
- `GET /play` opens the **Code Breaker** minigame in the browser

## Minigame: Code Breaker

The server picks a secret 4-digit code with no repeated digits. You have 10 tries to crack it.
After each guess you get:

- **bulls**: right digit in the right place
- **cows**: right digit in the wrong place

Run `npm start` and open <http://localhost:3000/play>, or play it from the terminal:

```sh
curl -X POST localhost:3000/game -d '{"name":"Ada"}'          # returns the game id
curl -X POST localhost:3000/game/<id>/guess -d '{"guess":"1234"}'
curl localhost:3000/game/<id>                                  # current state
curl localhost:3000/leaderboard                                # top 10 wins
```

Games and the leaderboard live in memory, so they reset when the server restarts.
Unfinished games expire after one hour.
