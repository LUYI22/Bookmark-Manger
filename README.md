# Bookmark Manager

A self-hosted bookmark manager for saving, organizing, and finding links. It
provides a browser-based interface backed by a local SQLite database.

## Features

- Save bookmarks with a required URL and optional title and description.
- Organize bookmarks into folders, each with an optional color.
- Add multiple comma-separated tags and filter by tag.
- Mark bookmarks as favorites and switch to a favorites-only view.
- Search titles, URLs, descriptions, and tags.
- Assign an optional color to a bookmark.
- Edit or delete bookmarks and folders. Deleting a folder also deletes the
  bookmarks it contains.
- Load results a page at a time instead of returning the whole collection.

## Requirements

- Node.js 22.5 or newer (the backend uses Node's built-in `node:sqlite` module)
- npm

## Run locally

1. Open a terminal in the repository directory.
2. Start the app:

   ```sh
   bash main.sh
   ```

   The launcher installs dependencies for the frontend and backend on first
   run, then starts both services.

3. Open <http://127.0.0.1:8080> in your browser.
4. Press **Ctrl+C** in the terminal to stop both services.

The frontend listens on port `8080` and proxies `/api` requests to the backend
on port `3001`. Those ports must be available before starting the app.

## Using the app

- Select **+ New Bookmark** to save a link. The URL is required; title and
  description are optional.
- Choose an existing folder or select **+ Create new folder...** while creating
  a bookmark. Add tags as a comma-separated list.
- Use the favorite checkbox or optional color picker while creating or editing
  a bookmark.
- Use the folder bar to switch between all bookmarks, favorites, or a folder.
  Select **+ Folder** to create a folder. Select a folder's color dot to edit
  its name or color; use its **×** control to delete it.
- Search matches bookmark titles, URLs, descriptions, and tags. The tag menu
  can narrow the current results to one tag.
- Select **Load more** at the bottom of the list to fetch the next page.
- Each bookmark card includes favorite, edit, and delete controls.

## Data and configuration

By default, bookmarks are saved in:

```text
project/backend/data/bookmarks.db
```

The database directory is created automatically. The database is excluded from
Git so local bookmark data is not published with the app. To use a different
database file, set `BOOKMARKS_DB_PATH` when starting the backend, for example:

```sh
BOOKMARKS_DB_PATH=/path/to/bookmarks.db npm --prefix project/backend start
```

The backend port can be changed with `PORT`, but the frontend proxy in
`project/frontend/server.js` must be updated to match.

## Architecture

- **Frontend:** static HTML, CSS, and browser JavaScript served by Express.
- **Backend:** Express JSON API with SQLite persistence via `node:sqlite`.
- **Database:** folder and bookmark tables, with a normalized tag table and
  indexes used for filtering. Startup migration backfills the tag index from
  existing bookmark data.
- **Search and filtering:** title, URL, description, tag, folder, and favorite
  filtering are performed in parameterized SQLite queries rather than by
  downloading and filtering the entire bookmark collection in the browser.
- **Pagination:** the API returns 100 bookmarks by default and caps requested
  page sizes at 200. The UI uses a stable `(created_at, id)` cursor to fetch
  subsequent pages. The response includes the `X-Has-More` header.

## API overview

The API is served under `/api`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bookmarks` | List bookmarks; supports `q`, `tag`, `folderId`, `favorite`, `limit`, and pagination parameters. |
| `POST` | `/api/bookmarks` | Create a bookmark. |
| `PUT` | `/api/bookmarks/:id` | Update a bookmark. |
| `DELETE` | `/api/bookmarks/:id` | Delete a bookmark. |
| `GET` | `/api/folders` | List folders and their bookmark counts. |
| `POST` | `/api/folders` | Create a folder. |
| `PUT` | `/api/folders/:id` | Update a folder name or color. |
| `DELETE` | `/api/folders/:id` | Delete a folder and its bookmarks. |
| `GET` | `/api/tags` | List distinct tags. |

For `/api/bookmarks`, `q` searches titles, URLs, descriptions, and tags.
`folderId=none` selects bookmarks without a folder; `favorite=true` selects
favorites. Pagination accepts `limit` and `offset`, or `limit` and both
`cursorCreatedAt` and `cursorId`. When there are more results, `X-Has-More` is
`true`.

## AI assistance disclosure

I used Claude to help me create this app within approximately 45 minutes.
