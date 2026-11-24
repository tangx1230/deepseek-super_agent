'use strict';

/* ==========================================================================
   存储部分
   ========================================================================== */

const STORAGE_KEY = 'todo-app-items';
const MAX_TITLE_LENGTH = 100;

let storageWarningShown = false;

/**
 * 判断一条本地数据是否符合待办数据模型。
 * @param {unknown} item 待校验的数据
 * @returns {boolean} 是否符合数据模型
 */
function isValidTodo(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    item.title.length <= MAX_TITLE_LENGTH &&
    typeof item.completed === 'boolean' &&
    typeof item.createdAt === 'string' &&
    !Number.isNaN(Date.parse(item.createdAt))
  );
}

function warnStorageOnce(message, error) {
  if (storageWarningShown) {
    return;
  }
  storageWarningShown = true;
  console.warn(message, error);
}

/**
 * 从 localStorage 读取待办数据。
 * 读取失败或数据格式非法时降级为空列表,保证应用可继续使用。
 * @returns {Array<object>} 待办数组
 */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidTodo)) {
      console.warn('本地待办数据格式非法,已降级为空列表。');
      return [];
    }
    return parsed;
  } catch (error) {
    warnStorageOnce('读取本地待办数据失败,已降级为空列表。', error);
    return [];
  }
}

/**
 * 将待办数组写入 localStorage。
 * localStorage 不可用(如隐私模式)时仅跳过持久化,不影响正常使用。
 * @param {Array<object>} todos 待办数组
 */
function saveTodos(todos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
    warnStorageOnce('本地存储不可用,当前更改不会被保存。', error);
  }
}

/* ==========================================================================
   渲染部分
   ========================================================================== */

const elements = {
  form: document.getElementById('todo-form'),
  composerRow: document.querySelector('.composer-row'),
  input: document.getElementById('todo-input'),
  error: document.getElementById('input-error'),
  charCount: document.getElementById('char-count'),
  list: document.getElementById('todo-list'),
  emptyState: document.getElementById('empty-state'),
  filterTabs: document.querySelector('.filter-tabs'),
  remainingCount: document.getElementById('remaining-count'),
  clearButton: document.getElementById('clear-completed'),
};

let todos = loadTodos();
let activeFilter = 'all';
let editingId = null;
let newItemId = null;

/**
 * 按当前筛选条件返回要展示的待办。
 * @returns {Array<object>} 筛选后的待办数组
 */
function getVisibleTodos() {
  if (activeFilter === 'active') {
    return todos.filter((todo) => !todo.completed);
  }
  if (activeFilter === 'completed') {
    return todos.filter((todo) => todo.completed);
  }
  return todos;
}

/**
 * 创建单条待办的 DOM 节点。
 * @param {object} todo 待办数据
 * @returns {HTMLLIElement} 列表项节点
 */
function createTodoItem(todo) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  item.dataset.id = todo.id;
  if (todo.completed) {
    item.classList.add('is-completed');
  }
  if (todo.id === newItemId) {
    item.classList.add('is-new');
  }

  const checkLabel = document.createElement('label');
  checkLabel.className = 'todo-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = todo.completed;
  checkbox.setAttribute(
    'aria-label',
    todo.completed ? `将「${todo.title}」标记为未完成` : `将「${todo.title}」标记为已完成`
  );
  checkLabel.appendChild(checkbox);

  let titleNode;
  if (editingId === todo.id) {
    titleNode = document.createElement('input');
    titleNode.type = 'text';
    titleNode.className = 'todo-title-edit';
    titleNode.value = todo.title;
    titleNode.maxLength = MAX_TITLE_LENGTH;
    titleNode.setAttribute('aria-label', '编辑待办标题');
    titleNode.dataset.action = 'edit';
  } else {
    titleNode = document.createElement('span');
    titleNode.className = 'todo-title';
    titleNode.textContent = todo.title;
    titleNode.title = '双击编辑';
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.dataset.action = 'delete';
  deleteButton.setAttribute('aria-label', '删除待办');
  deleteButton.textContent = '×';

  item.append(checkLabel, titleNode, deleteButton);
  return item;
}

/**
 * 渲染待办列表与空状态。
 */
function renderList() {
  const visibleTodos = getVisibleTodos();
  const fragment = document.createDocumentFragment();
  visibleTodos.forEach((todo) => {
    fragment.appendChild(createTodoItem(todo));
  });
  elements.list.replaceChildren(fragment);
  elements.emptyState.hidden = visibleTodos.length > 0;
  newItemId = null;

  const editInput = elements.list.querySelector('.todo-title-edit');
  if (editInput) {
    editInput.focus();
    editInput.select();
  }
}

/**
 * 渲染筛选标签的选中状态。
 */
function renderFilters() {
  elements.filterTabs.querySelectorAll('.filter-tab').forEach((tab) => {
    const isActive = tab.dataset.filter === activeFilter;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

/**
 * 渲染底部剩余数量与“清除已完成”按钮状态。
 */
function renderStatus() {
  const remaining = todos.filter((todo) => !todo.completed).length;
  elements.remainingCount.textContent = `剩余 ${remaining} 项未完成`;

  const hasCompleted = todos.some((todo) => todo.completed);
  elements.clearButton.disabled = !hasCompleted;
}

/**
 * 整体渲染。
 */
function render() {
  renderList();
  renderFilters();
  renderStatus();
}

/**
 * 更新输入框字符计数。
 */
function updateCharCount() {
  elements.charCount.textContent = `${elements.input.value.length}/${MAX_TITLE_LENGTH}`;
}

/**
 * 展示空值提示并触发输入框抖动。
 */
function showInputError() {
  elements.error.hidden = false;
  elements.input.setAttribute('aria-invalid', 'true');
  elements.composerRow.classList.remove('is-shaking');
  // 读取一次布局属性,确保抖动动画可以重复触发
  void elements.composerRow.offsetWidth;
  elements.composerRow.classList.add('is-shaking');
  elements.input.focus();
}

/**
 * 隐藏空值提示。
 */
function hideInputError() {
  elements.error.hidden = true;
  elements.input.removeAttribute('aria-invalid');
}

/* ==========================================================================
   事件处理部分
   ========================================================================== */

/**
 * 生成唯一标识,优先使用 crypto.randomUUID。
 * @returns {string} 唯一 id
 */
function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 处理新增待办表单提交(点击“添加”或输入框内按 Enter)。
 * @param {SubmitEvent} event 提交事件
 */
function handleSubmit(event) {
  event.preventDefault();
  const title = elements.input.value.trim();

  if (!title) {
    showInputError();
    return;
  }

  const todo = {
    id: createId(),
    title: title.slice(0, MAX_TITLE_LENGTH),
    completed: false,
    createdAt: new Date().toISOString(),
  };

  todos.unshift(todo);
  newItemId = todo.id;
  saveTodos(todos);

  elements.input.value = '';
  updateCharCount();
  hideInputError();
  elements.input.focus();
  render();
}

/**
 * 输入时更新计数并清除错误提示。
 */
function handleInput() {
  updateCharCount();
  if (!elements.error.hidden) {
    hideInputError();
  }
}

/**
 * 提交编辑:去空格、空值视为取消,然后写回并持久化。
 * @param {HTMLInputElement} input 编辑输入框
 */
function commitEdit(input) {
  const item = input.closest('.todo-item');
  if (!item) {
    return;
  }
  const id = item.dataset.id;
  // 已经退出编辑态(Esc 或重复触发)时不再提交
  if (editingId !== id) {
    return;
  }

  const todo = todos.find((entry) => entry.id === id);
  const title = input.value.trim().slice(0, MAX_TITLE_LENGTH);

  if (todo && title) {
    todo.title = title;
    saveTodos(todos);
  }

  editingId = null;
  render();
}

/**
 * 取消编辑,还原原标题。
 */
function cancelEdit() {
  editingId = null;
  render();
}

/**
 * 切换完成状态。
 * @param {HTMLInputElement} checkbox 被点击的复选框
 */
function handleToggle(checkbox) {
  const item = checkbox.closest('.todo-item');
  if (!item) {
    return;
  }
  const todo = todos.find((entry) => entry.id === item.dataset.id);
  if (!todo) {
    return;
  }
  todo.completed = checkbox.checked;
  saveTodos(todos);
  render();
}

/**
 * 删除单条待办。
 * @param {HTMLElement} item 待办列表项
 */
function handleDelete(item) {
  const id = item.dataset.id;
  todos = todos.filter((todo) => todo.id !== id);
  if (editingId === id) {
    editingId = null;
  }
  saveTodos(todos);
  render();
}

/**
 * 进入编辑态。
 * @param {HTMLElement} title 待办标题节点
 */
function startEdit(title) {
  const item = title.closest('.todo-item');
  if (!item) {
    return;
  }
  editingId = item.dataset.id;
  render();
}

/**
 * 删除全部已完成待办。
 */
function clearCompleted() {
  if (!todos.some((todo) => todo.completed)) {
    return;
  }
  todos = todos.filter((todo) => !todo.completed);
  if (editingId && !todos.some((todo) => todo.id === editingId)) {
    editingId = null;
  }
  saveTodos(todos);
  render();
}

/**
 * 绑定所有事件。
 */
function bindEvents() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.input.addEventListener('input', handleInput);

  elements.composerRow.addEventListener('animationend', () => {
    elements.composerRow.classList.remove('is-shaking');
  });

  // 列表使用事件委托,兼容每次渲染产生的新节点
  elements.list.addEventListener('change', (event) => {
    if (event.target.matches('.todo-checkbox')) {
      handleToggle(event.target);
    }
  });

  elements.list.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.delete-button');
    if (deleteButton) {
      handleDelete(deleteButton.closest('.todo-item'));
    }
  });

  elements.list.addEventListener('dblclick', (event) => {
    const title = event.target.closest('.todo-title');
    if (title) {
      startEdit(title);
    }
  });

  elements.list.addEventListener('keydown', (event) => {
    if (!event.target.matches('.todo-title-edit') || event.isComposing) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(event.target);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  // focusout 会冒泡,用于处理编辑框失焦保存
  elements.list.addEventListener('focusout', (event) => {
    if (event.target.matches('.todo-title-edit')) {
      commitEdit(event.target);
    }
  });

  elements.filterTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.filter-tab');
    if (!tab) {
      return;
    }
    activeFilter = tab.dataset.filter;
    render();
  });

  elements.clearButton.addEventListener('click', clearCompleted);
}

/* ==========================================================================
   初始化
   ========================================================================== */

function init() {
  bindEvents();
  updateCharCount();
  render();
}

init();
