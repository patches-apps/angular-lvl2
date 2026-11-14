# RequestDesk: Domain & API Reference

*Candidate-facing. Included in every challenge repo.*

RequestDesk is an internal tool where employees raise **service requests** (a broken laptop, a software licence, building access) and support agents **triage** and resolve them.

## Entities

### Request
| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `"REQ-1042"` |
| `title` | string | 5–120 chars after trimming |
| `description` | string | 0–2000 chars |
| `category` | `"hardware" \| "software" \| "access" \| "facilities"` | |
| `priority` | `"low" \| "medium" \| "high" \| "critical"` | |
| `status` | `"open" \| "in_progress" \| "blocked" \| "resolved"` | See transitions |
| `assigneeId` | string \| null | A `User.id`, or unassigned |
| `requesterId` | string | A `User.id` |
| `createdAt` | ISO-8601 string | |
| `updatedAt` | ISO-8601 string | |
| `slaDueAt` | ISO-8601 string | Set by the server from priority: critical 4h, high 24h, medium 72h, low 120h |
| `version` | number | Starts at 1, increments on every update. Used for optimistic concurrency |

### User
| Field | Type |
|---|---|
| `id` | string (`"u1"`…) |
| `name` | string |
| `team` | `"Service Desk" \| "Infrastructure" \| "Identity" \| "Workplace"` |

### Comment
| Field | Type |
|---|---|
| `id`, `requestId`, `authorId`, `body` (1–1000 chars), `createdAt` | |

### Status transitions
```
open        → in_progress | blocked | resolved
in_progress → open | blocked | resolved
blocked     → open | in_progress
resolved    → open                 (reopen)
```
Any other transition returns `422`.

### "Overdue"
A request is **overdue** when `status !== "resolved"` and `slaDueAt < now`.

## API

Base URL: `http://localhost:3001/api`. All bodies are JSON.

| Method & path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /users` | List users | `200 User[]` | |
| `GET /requests` | Search and list requests (see query params) | `200 { items, total, page, pageSize }` | `400` bad param |
| `GET /requests/:id` | One request | `200 Request` | `404` |
| `POST /requests` | Create | `201 Request` | `400` validation |
| `PATCH /requests/:id` | Partial update of `status`, `priority`, `assigneeId`. **Body must include `version`** | `200 Request` | `400`, `404`, `409` version conflict, `422` illegal transition |
| `GET /requests/:id/comments` | Comments, oldest first | `200 Comment[]` | `404` |
| `POST /requests/:id/comments` | Add comment `{ authorId, body }` | `201 Comment` | `400`, `404` |

### `GET /requests` query parameters
| Param | Example | Notes |
|---|---|---|
| `q` | `vpn` | Case-insensitive substring match on title and description |
| `status` | `open,blocked` | Comma-separated |
| `priority` | `high,critical` | Comma-separated |
| `assigneeId` | `u3` or `none` | `none` means unassigned |
| `sort` | `-createdAt` | One of `createdAt`, `updatedAt`, `slaDueAt`, `priority`. Prefix `-` for descending. `priority` sorts by severity, not alphabetically |
| `page` | `1` | 1-based |
| `pageSize` | `20` | Default 20, **max 100** |

### Error shape (every 4xx/5xx)
```json
{
  "message": "Validation failed",
  "errors": { "title": "Title must be 5–120 characters" }
}
```
`errors` appears on `400` responses. A `409` response also includes `"current": <Request>`, the latest server copy.

### Behaviour you should expect
- **Latency:** responses are delayed (default 300 ms) so loading states are visible.
- **Failures:** the interviewer may turn on random `503` errors to see how your UI copes.
- **Data:** seeded, in memory, and reset when the server restarts.
