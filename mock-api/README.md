# RequestDesk Mock API

A small Node server with no dependencies that implements the API in [`../domain-and-api.md`](../domain-and-api.md). It needs **Node.js 20+** and nothing else: no `npm install`.

```bash
node mock-api/server.js
```

The API is then at `http://localhost:3001/api`. Data is held in memory and resets when you restart the server.

| Env var | Default | Use |
|---|---|---|
| `PORT` | `3001` | Change it if 3001 is taken |
| `LATENCY_MS` | `300` | Delay on every response |
| `FAIL_RATE` | `0` | 0–1 probability of a random `503` |
| `SEED` | `42` | The same seed always gives the same data |

## Utility endpoints
| Call | Effect |
|---|---|
| `POST /api/__reset` | Restore the seeded data |
| `POST /api/__chaos` with `{ "failRate": 0.3 }` | Change the failure rate without restarting |
| `GET /health` | Liveness check |

Your interviewer may use these during the session to show how your UI behaves under failure.

## Using it from your app
Proxy `/api` to `http://localhost:3001` in your dev server, so the app calls relative URLs like `/api/requests`. The server also sends permissive CORS headers if you'd rather call it directly.

You're welcome to change `server.js` if your task asks for it.
