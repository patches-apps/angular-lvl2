# RequestDesk Challenge, Level 2 (Angular): Triage Workspace

**Time:** 50 minutes (review, design, build), then a 20-minute presentation.
**Stack:** Angular (latest, standalone components), TypeScript, the provided mock API (Node).
**You may:** use any library (NgRx / SignalStore, Angular Material, CDK and so on), docs and search, and ask us questions at any time.

## In this repo
| Path | What it is |
|---|---|
| `README.md` | This brief |
| `domain-and-api.md` | The RequestDesk data model and API contract |
| `mock-api/` | The API server: Node 20+, no install needed |
| `app/` | The starter app you build in |
| `pr-review/` | The pull request you'll review |

## Getting started
Clone the repo, then start the API from the repo root:
```bash
node mock-api/server.js
```
Check that it works by opening <http://localhost:3001/api/users>.

Then, in a second terminal, install and start the app:
```bash
cd app
```
```bash
npm install
```
```bash
npm start
```
Open <http://localhost:4200>. The app shows a RequestDesk header, and calls to `/api` are proxied to the mock API. Run the tests with `npm test`.

**What the starter includes:** An Angular 22 app with routing, `HttpClient`, an `/api` proxy, the API model types in `src/app/models/request.model.ts`, and a passing Vitest test.

## Context
RequestDesk has a basic request list. Support **agents triage dozens of requests at once**: they reassign, reprioritise and move status, often while colleagues work the same queue. Today, two agents can overwrite each other's changes, the UI feels slow because it waits for every save, and agents can't share a filtered view with each other.

You're the senior engineer on this feature. You'll **review a teammate's PR**, **design** the triage workspace, and **build the riskiest slice** yourself.

Read [domain-and-api.md](domain-and-api.md). Note the `version` field and the `409` response on `PATCH`.

## Challenge

### Part 1: PR review (about 10 min)
Review the PR in [`pr-review/`](pr-review/). Follow the instructions in `PR-1287.md`. Keep it to the comments you'd actually leave at work. Prioritise.

### Part 2: Design (about 10 min)
Write a short `DESIGN.md` (bullet points are fine, and an ASCII diagram is welcome) for the full **Triage Workspace**:

- Filterable, sortable, paginated queue. **Filters and sort live in the URL**, so a link shows a colleague the same view, and back/forward work.
- **Inline edits** per row (status, priority, assignee) that feel instant.
- **Multi-select and bulk actions** (for example, assign 15 requests to Aiko).
- Safe concurrent editing: if someone else changed a request, we must not silently overwrite their change.

Cover:
1. **Component and service architecture:** what owns state, and what is presentational.
2. **State management:** your approach and why. Where the source of truth lives. How the list stays consistent after edits.
3. **API contract** for a new `PATCH /api/requests/bulk`: request and response shapes, **partial failure**, versioning, and idempotency.
4. **Error and concurrency strategy:** optimistic updates, rollback, 409 and 422 handling, and what the user sees.
5. **Testing strategy:** what you test at which level.
6. **Delivery:** how you'd split this across yourself and two less experienced developers.

### Part 3: Build (about 30 min)
Build a working vertical slice of the riskiest parts:

1. **URL-synced filters:** status and priority filters (plus search if you have time) read from and written to query params. Reloading the page or pressing back restores the view.
2. **Inline status change with optimistic update:**
   - The row updates immediately and shows a pending indicator.
   - On failure, it **rolls back** and tells the user.
   - On **409**, it shows that someone else changed the request and updates the row with the server's `current` copy.
   - On **422**, it shows the reason. Bonus: only offer valid transitions.
3. **A unit test** of the optimistic update / rollback logic.

**Stretch:** implement `PATCH /api/requests/bulk` in `mock-api/server.js` to match your design, and a bulk-assign action in the UI.

## What we're looking for
- Sound architecture with **trade-offs you can defend**.
- Correct async behaviour under concurrency and failure.
- A review that would genuinely improve the code and grow its author.
- Pragmatism: what you build fully, what you stub, and **saying which is which**.

## Presentation (20 min)
- ~3 min: the most important points from your PR review.
- ~5 min: walk through your design.
- ~4 min: demo and code walkthrough.
- ~8 min: our questions, including how you'd lead others through this work.
