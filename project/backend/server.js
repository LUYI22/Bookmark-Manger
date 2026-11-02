const express = require('express');
const cors = require('cors');
const db = require('./db');

const PORT = 3001;
const app = express();

app.use(cors());
app.use(express.json());

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of tags) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

// Returns { ok: true, value } where value is a lowercase hex string or null
// (null/empty means "no color"), or { ok: false } if the input is malformed.
function normalizeColor(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }
  const trimmed = String(raw).trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    return { ok: false };
  }
  return { ok: true, value: trimmed.toLowerCase() };
}

function serializeBookmark(row) {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    folderId: row.folder_id,
    folderName: row.folder_name || null,
    folderColor: row.folder_color || null,
    tags: JSON.parse(row.tags || '[]'),
    isFavorite: !!row.is_favorite,
    color: row.color || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeFolder(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || null,
    count: row.count ?? 0,
    createdAt: row.created_at,
  };
}

function getFolderOr404(id, res) {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
  if (!folder) {
    res.status(404).json({ error: 'folder not found' });
    return null;
  }
  return folder;
}

function getFolderWithCount(id) {
  return db
    .prepare(
      `SELECT f.*, COUNT(b.id) AS count
       FROM folders f
       LEFT JOIN bookmarks b ON b.folder_id = f.id
       WHERE f.id = ?
       GROUP BY f.id`
    )
    .get(id);
}

const BOOKMARK_SELECT = `
  SELECT b.*, f.name AS folder_name, f.color AS folder_color
  FROM bookmarks b
  LEFT JOIN folders f ON f.id = b.folder_id
`;

// ---------- Folders ----------

app.get('/api/folders', (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, COUNT(b.id) AS count
       FROM folders f
       LEFT JOIN bookmarks b ON b.folder_id = f.id
       GROUP BY f.id
       ORDER BY f.name COLLATE NOCASE ASC`
    )
    .all();
  res.json(rows.map(serializeFolder));
});

app.post('/api/folders', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'folder name is required' });
  }

  const colorResult = normalizeColor(req.body?.color);
  if (!colorResult.ok) {
    return res.status(400).json({ error: 'color must be a hex value like #3b82f6' });
  }

  const existing = db
    .prepare('SELECT * FROM folders WHERE name = ? COLLATE NOCASE')
    .get(name);
  if (existing) {
    return res.status(409).json({ error: 'a folder with that name already exists' });
  }

  const result = db
    .prepare('INSERT INTO folders (name, color) VALUES (?, ?)')
    .run(name, colorResult.value);

  res.status(201).json(serializeFolder(getFolderWithCount(result.lastInsertRowid)));
});

app.put('/api/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getFolderOr404(id, res);
  if (!existing) return;

  const body = req.body || {};

  let newName = existing.name;
  if (body.name !== undefined) {
    newName = String(body.name).trim();
    if (!newName) {
      return res.status(400).json({ error: 'folder name is required' });
    }
    const duplicate = db
      .prepare('SELECT * FROM folders WHERE name = ? COLLATE NOCASE AND id != ?')
      .get(newName, id);
    if (duplicate) {
      return res.status(409).json({ error: 'a folder with that name already exists' });
    }
  }

  let newColor = existing.color;
  if (Object.prototype.hasOwnProperty.call(body, 'color')) {
    const colorResult = normalizeColor(body.color);
    if (!colorResult.ok) {
      return res.status(400).json({ error: 'color must be a hex value like #3b82f6' });
    }
    newColor = colorResult.value;
  }

  db.prepare('UPDATE folders SET name = ?, color = ? WHERE id = ?').run(newName, newColor, id);

  res.json(serializeFolder(getFolderWithCount(id)));
});

app.delete('/api/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  const folder = getFolderOr404(id, res);
  if (!folder) return;

  // ON DELETE CASCADE removes bookmarks whose folder_id = id.
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  res.status(204).end();
});

// ---------- Tags ----------

app.get('/api/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM bookmarks').all();
  const tagSet = new Map();
  for (const row of rows) {
    for (const tag of JSON.parse(row.tags || '[]')) {
      const key = tag.toLowerCase();
      if (!tagSet.has(key)) tagSet.set(key, tag);
    }
  }
  const tags = Array.from(tagSet.values()).sort((a, b) => a.localeCompare(b));
  res.json(tags);
});

// ---------- Bookmarks ----------

app.get('/api/bookmarks', (req, res) => {
  const { folderId, favorite, tag, q } = req.query;

  let rows = db.prepare(`${BOOKMARK_SELECT} ORDER BY b.created_at DESC`).all();

  let bookmarks = rows.map(serializeBookmark);

  if (favorite === 'true') {
    bookmarks = bookmarks.filter((b) => b.isFavorite);
  } else if (folderId !== undefined && folderId !== '' && folderId !== 'all') {
    if (folderId === 'none') {
      bookmarks = bookmarks.filter((b) => b.folderId === null);
    } else {
      const fid = Number(folderId);
      bookmarks = bookmarks.filter((b) => b.folderId === fid);
    }
  }

  if (tag) {
    const tagLower = String(tag).toLowerCase();
    bookmarks = bookmarks.filter((b) =>
      b.tags.some((t) => t.toLowerCase() === tagLower)
    );
  }

  if (q) {
    const query = String(q).toLowerCase();
    bookmarks = bookmarks.filter((b) => {
      const haystack = [b.title, b.url, b.description, ...b.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  res.json(bookmarks);
});

app.post('/api/bookmarks', (req, res) => {
  const { url, title, description, folderId, tags, isFavorite, color } = req.body || {};
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return res.status(400).json({ error: 'url is required' });
  }

  const colorResult = normalizeColor(color);
  if (!colorResult.ok) {
    return res.status(400).json({ error: 'color must be a hex value like #3b82f6' });
  }

  let resolvedFolderId = null;
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(Number(folderId));
    if (!folder) {
      return res.status(400).json({ error: 'folder not found' });
    }
    resolvedFolderId = folder.id;
  }

  const sanitizedTags = sanitizeTags(tags);

  const result = db
    .prepare(
      `INSERT INTO bookmarks (url, title, description, folder_id, tags, is_favorite, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalizedUrl,
      title ? String(title).trim() : null,
      description ? String(description).trim() : null,
      resolvedFolderId,
      JSON.stringify(sanitizedTags),
      isFavorite ? 1 : 0,
      colorResult.value
    );

  const row = db
    .prepare(`${BOOKMARK_SELECT} WHERE b.id = ?`)
    .get(result.lastInsertRowid);

  res.status(201).json(serializeBookmark(row));
});

app.put('/api/bookmarks/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: 'bookmark not found' });
  }

  const body = req.body || {};

  let normalizedUrl = existing.url;
  if (body.url !== undefined) {
    normalizedUrl = normalizeUrl(body.url);
    if (!normalizedUrl) {
      return res.status(400).json({ error: 'url cannot be empty' });
    }
  }

  const newTitle =
    body.title !== undefined
      ? body.title
        ? String(body.title).trim()
        : null
      : existing.title;

  const newDescription =
    body.description !== undefined
      ? body.description
        ? String(body.description).trim()
        : null
      : existing.description;

  let newFolderId = existing.folder_id;
  if (Object.prototype.hasOwnProperty.call(body, 'folderId')) {
    if (body.folderId === null || body.folderId === '') {
      newFolderId = null;
    } else {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(Number(body.folderId));
      if (!folder) {
        return res.status(400).json({ error: 'folder not found' });
      }
      newFolderId = folder.id;
    }
  }

  const newTags =
    body.tags !== undefined ? sanitizeTags(body.tags) : JSON.parse(existing.tags || '[]');

  const newIsFavorite =
    body.isFavorite !== undefined ? (body.isFavorite ? 1 : 0) : existing.is_favorite;

  let newColor = existing.color;
  if (Object.prototype.hasOwnProperty.call(body, 'color')) {
    const colorResult = normalizeColor(body.color);
    if (!colorResult.ok) {
      return res.status(400).json({ error: 'color must be a hex value like #3b82f6' });
    }
    newColor = colorResult.value;
  }

  db.prepare(
    `UPDATE bookmarks
     SET url = ?, title = ?, description = ?, folder_id = ?, tags = ?, is_favorite = ?, color = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    normalizedUrl,
    newTitle,
    newDescription,
    newFolderId,
    JSON.stringify(newTags),
    newIsFavorite,
    newColor,
    id
  );

  const updated = db.prepare(`${BOOKMARK_SELECT} WHERE b.id = ?`).get(id);

  res.json(serializeBookmark(updated));
});

app.delete('/api/bookmarks/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'bookmark not found' });
  }

  res.status(204).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bookmark backend listening on http://0.0.0.0:${PORT}`);
});
