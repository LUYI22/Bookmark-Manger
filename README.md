# Bookmark Manager

A local bookmark manager with folders, tags, favorites, search, and color labels.

## Requirements

- Node.js 22.5 or newer
- npm

## Run locally

From the project directory, run:

```sh
bash main.sh
```

The launcher installs each service's npm dependencies on first run, then starts
the frontend and backend. Open <http://127.0.0.1:8080> in your browser. Press
Ctrl+C in the terminal to stop both services.

Bookmarks are stored in `project/backend/data/bookmarks.db`.
Search, folder, favorite, and tag filters run in SQLite. Results load 100 at a
time using cursor-based pagination, and bookmark tags are indexed for filtering.

## AI assistance disclosure

I used Claude to help me create this app within approximately 45 minutes.
