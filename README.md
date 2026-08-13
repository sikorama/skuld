# Todo

Minimalist, dependency-free task manager (Node.js stdlib only — `http` +
`node:sqlite`), deployable on a NAS.

## Features

- Categories (e.g. code, garden, home improvement), renamable, reorderable
  via drag-and-drop, deletable (along with their tasks).
- Tasks with no dependencies, no estimates, no due dates — just a status:
  **to do / in progress / done**.
- **Kanban** view: drag a card from one column to another.
- **List** view: same content, grouped by status, status change via
  dropdown menu.
- Inline-editable task title (click inside, `Enter` or click elsewhere to
  confirm).

## Deployment

Requires **Node.js ≥ 22.5** (for `node:sqlite`).

```bash
node server.js            # http://localhost:8322
PORT=9000 node server.js  # to change the port
```

`todo.db` (SQLite) is created automatically on first run and is the sole
source of truth — no external database, no build step.

## Structure

- `lib/db.js` — SQLite schema and connection
- `server.js` — REST API + static files
- `public/` — front-end (vanilla HTML/CSS/JS, no build)
