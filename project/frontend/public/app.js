const BOOKMARKS_API = '/api/bookmarks';
const FOLDERS_API = '/api/folders';
const TAGS_API = '/api/tags';
const PAGE_SIZE = 100;

const folderBarEl = document.getElementById('folder-bar');
const listEl = document.getElementById('bookmark-list');
const emptyStateEl = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const tagFilter = document.getElementById('tag-filter');
const newBookmarkBtn = document.getElementById('new-bookmark-btn');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const form = document.getElementById('bookmark-form');
const fieldUrl = document.getElementById('field-url');
const fieldTitle = document.getElementById('field-title');
const fieldDescription = document.getElementById('field-description');
const fieldFolderSelect = document.getElementById('field-folder-select');
const newFolderWrap = document.getElementById('new-folder-wrap');
const fieldNewFolderName = document.getElementById('field-new-folder-name');
const fieldTags = document.getElementById('field-tags');
const fieldFavorite = document.getElementById('field-favorite');
const fieldColorEnabled = document.getElementById('field-color-enabled');
const fieldColor = document.getElementById('field-color');
const fieldColorSwatches = document.getElementById('field-color-swatches');
const formError = document.getElementById('form-error');
const cancelBtn = document.getElementById('cancel-btn');

const folderModalOverlay = document.getElementById('folder-modal-overlay');
const folderModalTitle = document.getElementById('folder-modal-title');
const folderForm = document.getElementById('folder-form');
const folderNameInput = document.getElementById('folder-name-input');
const folderColorEnabled = document.getElementById('folder-color-enabled');
const folderColorInput = document.getElementById('folder-color-input');
const folderColorSwatches = document.getElementById('folder-color-swatches');
const folderFormError = document.getElementById('folder-form-error');
const folderCancelBtn = document.getElementById('folder-cancel-btn');
const folderSaveBtn = document.getElementById('folder-save-btn');

const COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
];

let folders = [];
let bookmarks = [];
let editingId = null;
let editingFolderId = null;
let renderedFoldersSignature = '';
let renderedFolderOptionsSignature = '';
let renderedTagsSignature = '';
let renderedListSignature = '';
let lastLoadedQueryKey = null;
let bookmarkRequestId = 0;
const loadMoreBtn = document.createElement('button');
loadMoreBtn.type = 'button';
loadMoreBtn.className = 'btn';
loadMoreBtn.textContent = 'Load more';
loadMoreBtn.hidden = true;

// view: { type: 'all' } | { type: 'favorites' } | { type: 'folder', id }
let currentView = { type: 'all' };

function getBookmarkQueryKey() {
  return JSON.stringify([
    currentView,
    tagFilter.value.toLowerCase(),
    searchInput.value.trim().toLowerCase(),
  ]);
}

async function loadAll() {
  await Promise.all([fetchFolders(), fetchTags()]);
  await fetchBookmarks({ force: true });
}

async function fetchFolders() {
  const res = await fetch(FOLDERS_API);
  if (!res.ok) throw new Error('Failed to load folders');
  folders = await res.json();
  renderFolderBar();
  renderFolderSelectOptions();
}

async function fetchTags() {
  const res = await fetch(TAGS_API);
  if (!res.ok) throw new Error('Failed to load tags');
  const tags = await res.json();
  const signature = JSON.stringify(tags);
  if (signature === renderedTagsSignature) return;

  const current = tagFilter.value;
  tagFilter.innerHTML = '<option value="">All tags</option>';
  for (const tag of tags) {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    tagFilter.appendChild(opt);
  }
  if (tags.includes(current)) {
    tagFilter.value = current;
  }
  renderedTagsSignature = signature;
}

async function fetchBookmarks({ append = false, force = false } = {}) {
  const query = searchInput.value.trim();
  const queryKey = getBookmarkQueryKey();
  if (append && queryKey !== lastLoadedQueryKey) return;
  if (!append && !force && queryKey === lastLoadedQueryKey) return;

  const params = new URLSearchParams();

  if (currentView.type === 'favorites') {
    params.set('favorite', 'true');
  } else if (currentView.type === 'folder') {
    params.set('folderId', String(currentView.id));
  }

  if (tagFilter.value) params.set('tag', tagFilter.value);
  if (query) params.set('q', query);
  params.set('limit', String(PAGE_SIZE));
  if (append && bookmarks.length > 0) {
    const cursor = bookmarks[bookmarks.length - 1];
    params.set('cursorCreatedAt', cursor.createdAt);
    params.set('cursorId', String(cursor.id));
  } else {
    params.set('offset', '0');
  }

  const requestId = ++bookmarkRequestId;
  if (!append) loadMoreBtn.disabled = false;
  else loadMoreBtn.disabled = true;

  try {
    const res = await fetch(`${BOOKMARKS_API}?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load bookmarks');
    const page = await res.json();
    if (requestId !== bookmarkRequestId || queryKey !== getBookmarkQueryKey()) return;

    const appendFrom = bookmarks.length;
    bookmarks = append ? [...bookmarks, ...page] : page;
    lastLoadedQueryKey = queryKey;
    loadMoreBtn.hidden = res.headers.get('X-Has-More') !== 'true';
    renderList({ append, appendFrom });
  } finally {
    if (requestId === bookmarkRequestId) loadMoreBtn.disabled = false;
  }
}

function renderFolderBar() {
  const signature = JSON.stringify([folders, currentView]);
  if (signature === renderedFoldersSignature) return;

  folderBarEl.innerHTML = '';

  folderBarEl.appendChild(
    buildPill({
      label: 'All',
      active: currentView.type === 'all',
      onClick: () => selectView({ type: 'all' }),
    })
  );

  folderBarEl.appendChild(
    buildPill({
      label: '★ Favorites',
      active: currentView.type === 'favorites',
      onClick: () => selectView({ type: 'favorites' }),
    })
  );

  for (const folder of folders) {
    folderBarEl.appendChild(
      buildPill({
        label: folder.name,
        count: folder.count,
        color: folder.color,
        active: currentView.type === 'folder' && currentView.id === folder.id,
        onClick: () => selectView({ type: 'folder', id: folder.id }),
        onDelete: () => deleteFolder(folder),
        onColorClick: () => openFolderModal(folder),
      })
    );
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'folder-pill folder-pill-add';
  addBtn.textContent = '+ Folder';
  addBtn.addEventListener('click', () => openFolderModal());
  folderBarEl.appendChild(addBtn);
  renderedFoldersSignature = signature;
}

function buildPill({ label, count, color, active, onClick, onDelete, onColorClick }) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'folder-pill' + (active ? ' active' : '');

  if (onColorClick) {
    const dot = document.createElement('span');
    dot.className = 'folder-color-dot';
    dot.style.background = color || '#d1d5db';
    dot.title = 'Edit folder';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      onColorClick();
    });
    pill.appendChild(dot);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  pill.appendChild(labelSpan);

  if (count !== undefined) {
    const countSpan = document.createElement('span');
    countSpan.className = 'folder-pill-count';
    countSpan.textContent = `(${count})`;
    pill.appendChild(countSpan);
  }

  pill.addEventListener('click', onClick);

  if (onDelete) {
    const delBtn = document.createElement('span');
    delBtn.className = 'folder-pill-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete folder';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    pill.appendChild(delBtn);
  }

  return pill;
}

function selectView(view) {
  if (
    currentView.type === view.type &&
    (view.type !== 'folder' || currentView.id === view.id)
  ) {
    return;
  }
  currentView = view;
  renderFolderBar();
  fetchBookmarks().catch((err) => console.error(err));
}

async function deleteFolder(folder) {
  const confirmed = confirm(
    `Delete folder "${folder.name}"? This will also delete ${folder.count} bookmark(s) inside it.`
  );
  if (!confirmed) return;

  const res = await fetch(`${FOLDERS_API}/${folder.id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('Failed to delete folder');
    return;
  }

  if (currentView.type === 'folder' && currentView.id === folder.id) {
    currentView = { type: 'all' };
  }

  await fetchFolders();
  await fetchTags();
  await fetchBookmarks({ force: true });
}

function renderFolderSelectOptions() {
  const current = fieldFolderSelect.value;
  const signature = JSON.stringify([
    folders.map(({ id, name }) => [id, name]),
    current,
  ]);
  if (signature === renderedFolderOptionsSignature) return;

  fieldFolderSelect.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'No folder';
  fieldFolderSelect.appendChild(noneOpt);

  for (const folder of folders) {
    const opt = document.createElement('option');
    opt.value = String(folder.id);
    opt.textContent = folder.name;
    fieldFolderSelect.appendChild(opt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ Create new folder...';
  fieldFolderSelect.appendChild(newOpt);

  if ([...fieldFolderSelect.options].some((o) => o.value === current)) {
    fieldFolderSelect.value = current;
  }
  renderedFolderOptionsSignature = JSON.stringify([
    folders.map(({ id, name }) => [id, name]),
    fieldFolderSelect.value,
  ]);
}

function renderList({ append = false, appendFrom = 0 } = {}) {
  const emptyMessage = bookmarks.length === 0
    ? currentView.type === 'all' && !tagFilter.value && !searchInput.value.trim()
      ? 'No bookmarks yet. Click "New Bookmark" to add one.'
      : 'No bookmarks match this view.'
    : '';
  const signature = JSON.stringify({
    bookmarks: bookmarks.map((bookmark) => [
      bookmark.id,
      bookmark.url,
      bookmark.title,
      bookmark.description,
      bookmark.folderName,
      bookmark.tags,
      bookmark.isFavorite,
      bookmark.color,
    ]),
    emptyMessage,
    hasMore: !loadMoreBtn.hidden,
  });
  if (signature === renderedListSignature) return;

  if (bookmarks.length === 0) {
    listEl.replaceChildren();
    emptyStateEl.textContent = emptyMessage;
    listEl.appendChild(emptyStateEl);
    loadMoreBtn.remove();
    renderedListSignature = signature;
    return;
  }

  if (append) {
    const newBookmarks = bookmarks.slice(appendFrom);
    for (const bookmark of newBookmarks) {
      listEl.appendChild(renderCard(bookmark));
    }
  } else {
    listEl.replaceChildren(...bookmarks.map(renderCard));
  }

  if (!loadMoreBtn.hidden) {
    listEl.appendChild(loadMoreBtn);
  } else {
    loadMoreBtn.remove();
  }
  renderedListSignature = signature;
}

function renderCard(bookmark) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';

  if (bookmark.color) {
    const bar = document.createElement('div');
    bar.className = 'bookmark-color-bar';
    bar.style.background = bookmark.color;
    card.appendChild(bar);
  }

  const main = document.createElement('div');
  main.className = 'bookmark-main';

  const topRow = document.createElement('div');
  topRow.className = 'bookmark-top-row';

  const title = document.createElement('h3');
  title.className = 'bookmark-title';
  title.textContent = bookmark.title || bookmark.url;
  topRow.appendChild(title);

  if (bookmark.folderName) {
    const badge = document.createElement('span');
    badge.className = 'bookmark-category';
    badge.textContent = bookmark.folderName;
    topRow.appendChild(badge);
  }

  main.appendChild(topRow);

  const link = document.createElement('a');
  link.className = 'bookmark-url';
  link.href = bookmark.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = bookmark.url;
  main.appendChild(link);

  if (bookmark.description) {
    const desc = document.createElement('p');
    desc.className = 'bookmark-description';
    desc.textContent = bookmark.description;
    main.appendChild(desc);
  }

  if (bookmark.tags && bookmark.tags.length > 0) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'bookmark-tags';
    for (const tag of bookmark.tags) {
      const chip = document.createElement('span');
      chip.className = 'bookmark-tag';
      chip.textContent = tag;
      tagsRow.appendChild(chip);
    }
    main.appendChild(tagsRow);
  }

  const actions = document.createElement('div');
  actions.className = 'bookmark-actions';

  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'favorite-btn' + (bookmark.isFavorite ? ' active' : '');
  favoriteBtn.textContent = bookmark.isFavorite ? '★' : '☆';
  favoriteBtn.title = bookmark.isFavorite ? 'Remove from favorites' : 'Add to favorites';
  favoriteBtn.addEventListener('click', () => toggleFavorite(bookmark));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-icon';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openModal(bookmark));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-icon btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteBookmark(bookmark.id));

  actions.appendChild(favoriteBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(main);
  card.appendChild(actions);

  return card;
}

async function toggleFavorite(bookmark) {
  const res = await fetch(`${BOOKMARKS_API}/${bookmark.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFavorite: !bookmark.isFavorite }),
  });
  if (!res.ok) {
    alert('Failed to update favorite status');
    return;
  }
  await fetchFolders();
  await fetchBookmarks({ force: true });
}

function openModal(bookmark) {
  editingId = bookmark ? bookmark.id : null;
  modalTitle.textContent = bookmark ? 'Edit Bookmark' : 'New Bookmark';
  fieldUrl.value = bookmark ? bookmark.url : '';
  fieldTitle.value = bookmark ? bookmark.title || '' : '';
  fieldDescription.value = bookmark ? bookmark.description || '' : '';
  fieldTags.value = bookmark ? (bookmark.tags || []).join(', ') : '';
  fieldFavorite.checked = bookmark ? !!bookmark.isFavorite : false;
  setColorFieldState(fieldColorEnabled, fieldColor, fieldColorSwatches, bookmark ? bookmark.color : null);

  renderFolderSelectOptions();
  fieldFolderSelect.value = bookmark && bookmark.folderId ? String(bookmark.folderId) : '';
  newFolderWrap.classList.add('hidden');
  fieldNewFolderName.value = '';

  formError.classList.add('hidden');
  modalOverlay.classList.remove('hidden');
  fieldUrl.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  form.reset();
  editingId = null;
}

async function deleteBookmark(id) {
  if (!confirm('Delete this bookmark?')) return;
  const res = await fetch(`${BOOKMARKS_API}/${id}`, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) {
    alert('Failed to delete bookmark');
    return;
  }
  await fetchFolders();
  await fetchTags();
  await fetchBookmarks({ force: true });
}

function buildSwatches(container, colorInput, enabledCheckbox) {
  container.innerHTML = '';
  for (const hex of COLOR_PALETTE) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = hex;
    swatch.title = hex;
    swatch.addEventListener('click', () => {
      colorInput.value = hex;
      enabledCheckbox.checked = true;
      colorInput.disabled = false;
      updateActiveSwatch(container, hex);
    });
    container.appendChild(swatch);
  }
}

function updateActiveSwatch(container, hex) {
  for (const swatch of container.children) {
    swatch.classList.toggle('active', swatch.title === hex);
  }
}

function setColorFieldState(enabledCheckbox, colorInput, swatchContainer, color) {
  enabledCheckbox.checked = !!color;
  colorInput.value = color || '#3b82f6';
  colorInput.disabled = !color;
  updateActiveSwatch(swatchContainer, color || null);
}

buildSwatches(fieldColorSwatches, fieldColor, fieldColorEnabled);
buildSwatches(folderColorSwatches, folderColorInput, folderColorEnabled);

fieldColorEnabled.addEventListener('change', () => {
  fieldColor.disabled = !fieldColorEnabled.checked;
  if (fieldColorEnabled.checked) updateActiveSwatch(fieldColorSwatches, fieldColor.value);
  else updateActiveSwatch(fieldColorSwatches, null);
});
fieldColor.addEventListener('input', () => {
  updateActiveSwatch(fieldColorSwatches, fieldColor.value);
});

folderColorEnabled.addEventListener('change', () => {
  folderColorInput.disabled = !folderColorEnabled.checked;
  if (folderColorEnabled.checked) updateActiveSwatch(folderColorSwatches, folderColorInput.value);
  else updateActiveSwatch(folderColorSwatches, null);
});
folderColorInput.addEventListener('input', () => {
  updateActiveSwatch(folderColorSwatches, folderColorInput.value);
});

function parseTagsInput(value) {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

fieldFolderSelect.addEventListener('change', () => {
  newFolderWrap.classList.toggle('hidden', fieldFolderSelect.value !== '__new__');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.classList.add('hidden');

  const url = fieldUrl.value.trim();
  if (!url) {
    formError.textContent = 'URL is required.';
    formError.classList.remove('hidden');
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;

  try {
    let folderId = null;

    if (fieldFolderSelect.value === '__new__') {
      const newName = fieldNewFolderName.value.trim();
      if (!newName) {
        throw new Error('Enter a name for the new folder.');
      }
      const createRes = await fetch(FOLDERS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (createRes.status === 409) {
        // Folder already exists (e.g. created in another tab) - reuse it.
        await fetchFolders();
        const existing = folders.find(
          (f) => f.name.toLowerCase() === newName.toLowerCase()
        );
        if (!existing) throw new Error('A folder with that name already exists.');
        folderId = existing.id;
      } else if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create folder');
      } else {
        const created = await createRes.json();
        folderId = created.id;
      }
    } else if (fieldFolderSelect.value) {
      folderId = Number(fieldFolderSelect.value);
    }

    const payload = {
      url,
      title: fieldTitle.value.trim(),
      description: fieldDescription.value.trim(),
      folderId,
      tags: parseTagsInput(fieldTags.value),
      isFavorite: fieldFavorite.checked,
      color: fieldColorEnabled.checked ? fieldColor.value : null,
    };

    const res = await fetch(editingId ? `${BOOKMARKS_API}/${editingId}` : BOOKMARKS_API, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save bookmark');
    }

    closeModal();
    await fetchFolders();
    await fetchTags();
    await fetchBookmarks({ force: true });
  } catch (err) {
    formError.textContent = err.message;
    formError.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
  }
});

newBookmarkBtn.addEventListener('click', () => openModal(null));
cancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

let searchDebounce;
searchInput.addEventListener('input', () => {
  bookmarkRequestId += 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => fetchBookmarks().catch((err) => console.error(err)), 200);
});
tagFilter.addEventListener('change', () => {
  bookmarkRequestId += 1;
  fetchBookmarks().catch((err) => console.error(err));
});
loadMoreBtn.addEventListener('click', () => {
  fetchBookmarks({ append: true }).catch((err) => console.error(err));
});

function openFolderModal(folder) {
  editingFolderId = folder ? folder.id : null;
  folderModalTitle.textContent = folder ? 'Edit Folder' : 'New Folder';
  folderSaveBtn.textContent = folder ? 'Save' : 'Create';
  folderNameInput.value = folder ? folder.name : '';
  setColorFieldState(folderColorEnabled, folderColorInput, folderColorSwatches, folder ? folder.color : null);
  folderFormError.classList.add('hidden');
  folderModalOverlay.classList.remove('hidden');
  folderNameInput.focus();
}

function closeFolderModal() {
  folderModalOverlay.classList.add('hidden');
  folderForm.reset();
  editingFolderId = null;
}

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  folderFormError.classList.add('hidden');

  const name = folderNameInput.value.trim();
  if (!name) {
    folderFormError.textContent = 'Folder name is required.';
    folderFormError.classList.remove('hidden');
    return;
  }

  const payload = {
    name,
    color: folderColorEnabled.checked ? folderColorInput.value : null,
  };

  const res = await fetch(
    editingFolderId ? `${FOLDERS_API}/${editingFolderId}` : FOLDERS_API,
    {
      method: editingFolderId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    folderFormError.textContent = data.error || 'Failed to save folder';
    folderFormError.classList.remove('hidden');
    return;
  }

  const wasEditing = editingFolderId !== null;
  closeFolderModal();
  await fetchFolders();
  if (wasEditing) await fetchBookmarks({ force: true });
});

folderCancelBtn.addEventListener('click', closeFolderModal);
folderModalOverlay.addEventListener('click', (e) => {
  if (e.target === folderModalOverlay) closeFolderModal();
});

loadAll().catch((err) => {
  console.error(err);
  emptyStateEl.textContent = 'Failed to load bookmarks. Is the backend running?';
});
