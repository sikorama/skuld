'use strict';

const STATUSES = ['todo', 'doing', 'done'];

const state = {
  categories: [],
  activeCategoryId: null,
  tasks: [],
  view: 'kanban',
};

const el = {
  categoryList: document.getElementById('category-list'),
  newCategoryForm: document.getElementById('new-category-form'),
  newCategoryInput: document.getElementById('new-category-input'),
  emptyState: document.getElementById('empty-state'),
  boardWrap: document.getElementById('board-wrap'),
  categoryTitle: document.getElementById('category-title'),
  viewToggle: document.getElementById('view-toggle'),
  kanbanView: document.getElementById('kanban-view'),
  listView: document.getElementById('list-view'),
  notesView: document.getElementById('notes-view'),
  notesEdit: document.getElementById('notes-edit'),
};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;
const BOLD_RE = /\*([^*]+)\*/g;

function renderInline(text) {
  return escapeHtml(text)
    .replace(BOLD_RE, '<strong>$1</strong>')
    .replace(URL_RE, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMiniMarkdown(text) {
  const lines = (text || '').split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${renderInline(item[1])}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim()) html += `<div>${renderInline(line)}</div>`;
      else html += '<br>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function loadCategories() {
  state.categories = await api('/api/categories');
  renderCategoryList();
}

async function loadTasks() {
  if (!state.activeCategoryId) {
    state.tasks = [];
    return;
  }
  state.tasks = await api(`/api/tasks?category_id=${state.activeCategoryId}`);
}

function renderCategoryList() {
  el.categoryList.innerHTML = '';
  for (const cat of state.categories) {
    const li = document.createElement('li');
    li.dataset.id = cat.id;
    li.draggable = true;
    if (cat.id === state.activeCategoryId) li.classList.add('active');

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = cat.name;

    const count = document.createElement('span');
    const total = cat.counts.todo + cat.counts.doing + cat.counts.done;
    count.className = 'cat-count';
    count.textContent = total ? `${cat.counts.done}/${total}` : '';

    const actions = document.createElement('span');
    actions.className = 'cat-actions';

    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✎';
    renameBtn.title = 'Renommer';
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const next = prompt('Renommer la catégorie', cat.name);
      if (next && next.trim()) {
        await api(`/api/categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ name: next.trim() }) });
        await loadCategories();
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Supprimer';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer « ${cat.name} » et toutes ses tâches ?`)) return;
      await api(`/api/categories/${cat.id}`, { method: 'DELETE' });
      if (state.activeCategoryId === cat.id) state.activeCategoryId = null;
      await loadCategories();
      await refreshBoard();
    });

    actions.append(renameBtn, deleteBtn);
    li.append(name, count, actions);

    li.addEventListener('click', async () => {
      state.activeCategoryId = cat.id;
      renderCategoryList();
      await refreshBoard();
    });

    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/category-id', String(cat.id));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', async (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const draggedId = Number(e.dataTransfer.getData('text/category-id'));
      if (!draggedId || draggedId === cat.id) return;
      const ids = state.categories.map((c) => c.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(cat.id);
      ids.splice(from, 1);
      ids.splice(to, 0, draggedId);
      await api('/api/categories/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
      await loadCategories();
    });

    el.categoryList.appendChild(li);
  }
}

async function refreshBoard() {
  const cat = state.categories.find((c) => c.id === state.activeCategoryId);
  if (!cat) {
    el.emptyState.classList.remove('hidden');
    el.boardWrap.classList.add('hidden');
    return;
  }
  el.emptyState.classList.add('hidden');
  el.boardWrap.classList.remove('hidden');
  el.categoryTitle.textContent = cat.name;
  renderNotes(cat.notes);
  await loadTasks();
  renderTasks();
}

function renderNotes(notes) {
  el.notesEdit.value = notes || '';
  el.notesView.innerHTML = renderMiniMarkdown(notes);
  el.notesView.classList.remove('hidden');
  el.notesEdit.classList.add('hidden');
}

el.notesView.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  if (!state.activeCategoryId) return;
  el.notesView.classList.add('hidden');
  el.notesEdit.classList.remove('hidden');
  el.notesEdit.focus();
});

el.notesEdit.addEventListener('blur', async () => {
  const cat = state.categories.find((c) => c.id === state.activeCategoryId);
  if (!cat) return;
  const value = el.notesEdit.value;
  if (value !== cat.notes) {
    cat.notes = value;
    await api(`/api/categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ notes: value }) });
  }
  renderNotes(value);
});

function tasksByStatus(status) {
  return state.tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
}

function makeCardTitle(task) {
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = task.title;
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      title.blur();
    }
  });
  title.addEventListener('blur', async () => {
    const value = title.textContent.trim();
    if (value && value !== task.title) {
      task.title = value;
      await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ title: value }) });
    } else {
      title.textContent = task.title;
    }
  });
  return title;
}

function makeDeleteBtn(task) {
  const btn = document.createElement('button');
  btn.className = 'card-delete';
  btn.textContent = '×';
  btn.title = 'Supprimer';
  btn.addEventListener('click', async () => {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    renderTasks();
  });
  return btn;
}

function renderKanban() {
  for (const status of STATUSES) {
    const list = el.kanbanView.querySelector(`.card-list[data-status="${status}"]`);
    list.innerHTML = '';
    for (const task of tasksByStatus(status)) {
      const card = document.createElement('div');
      card.className = 'card';
      card.draggable = true;
      card.dataset.id = task.id;
      card.append(makeCardTitle(task), makeDeleteBtn(task));

      card.addEventListener('mousedown', (e) => {
        card.draggable = !e.target.closest('.card-title');
      });
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/task-id', String(task.id));
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      list.appendChild(card);
    }
  }

  for (const list of el.kanbanView.querySelectorAll('.card-list')) {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.classList.add('drag-over');
      const dragging = list.querySelector('.card.dragging') || document.querySelector('.card.dragging');
      const after = [...list.querySelectorAll('.card:not(.dragging)')].find(
        (c) => e.clientY < c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2
      );
      if (dragging) {
        if (after) list.insertBefore(dragging, after);
        else list.appendChild(dragging);
      }
    });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', async (e) => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const status = list.dataset.status;
      const ids = [...list.querySelectorAll('.card')].map((c) => Number(c.dataset.id));
      for (const t of state.tasks) {
        const idx = ids.indexOf(t.id);
        if (idx !== -1) {
          t.status = status;
          t.position = idx;
        }
      }
      await api('/api/tasks/reorder', { method: 'POST', body: JSON.stringify({ status, ids }) });
      renderCategoryList();
    });
  }
}

function renderList() {
  for (const status of STATUSES) {
    const ul = el.listView.querySelector(`.task-rows[data-status="${status}"]`);
    ul.innerHTML = '';
    for (const task of tasksByStatus(status)) {
      const li = document.createElement('li');

      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = task.title;
      title.contentEditable = 'true';
      title.spellcheck = false;
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          title.blur();
        }
      });
      title.addEventListener('blur', async () => {
        const value = title.textContent.trim();
        if (value && value !== task.title) {
          task.title = value;
          await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ title: value }) });
        } else {
          title.textContent = task.title;
        }
      });

      const select = document.createElement('select');
      for (const s of STATUSES) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = { todo: 'À faire', doing: 'En cours', done: 'Fait' }[s];
        if (s === task.status) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', async () => {
        task.status = select.value;
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
        renderCategoryList();
        renderList();
      });

      li.append(title, select, makeDeleteBtn(task));
      ul.appendChild(li);
    }
  }
}

function renderTasks() {
  renderKanban();
  renderList();
}

function setView(view) {
  state.view = view;
  for (const btn of el.viewToggle.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.view === view);
  }
  el.kanbanView.classList.toggle('hidden', view !== 'kanban');
  el.listView.classList.toggle('hidden', view !== 'list');
}

el.viewToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (btn) setView(btn.dataset.view);
});

el.newCategoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = el.newCategoryInput.value.trim();
  if (!name) return;
  const cat = await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
  el.newCategoryInput.value = '';
  await loadCategories();
  state.activeCategoryId = cat.id;
  renderCategoryList();
  await refreshBoard();
});

for (const form of document.querySelectorAll('.add-task-form')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title || !state.activeCategoryId) return;
    const status = form.dataset.status;
    const task = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ category_id: state.activeCategoryId, title, status }),
    });
    input.value = '';
    state.tasks.push(task);
    renderTasks();
    await loadCategories();
    renderCategoryList();
  });
}

(async function init() {
  await loadCategories();
  if (state.categories.length) {
    state.activeCategoryId = state.categories[0].id;
    renderCategoryList();
  }
  await refreshBoard();
})();
