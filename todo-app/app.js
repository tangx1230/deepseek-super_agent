'use strict';

/* ==========================================================================
   存储部分
   ========================================================================== */

const STORAGE_KEY = 'todo-app-items';
const MAX_TITLE_LENGTH = 100;
const PRIORITIES = ['normal', 'urgent'];
const PRIORITY_LABELS = { normal: '一般', urgent: '紧急' };
const DEFAULT_PRIORITY = 'normal';

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
    !Number.isNaN(Date.parse(item.createdAt)) &&
    // priority 为新增字段:缺省视为“一般”,只接受 normal / urgent
    (item.priority === undefined || PRIORITIES.includes(item.priority)) &&
    // dueAt 为新增的可选字段:缺省或 null 表示未指定时间
    (item.dueAt === undefined ||
      item.dueAt === null ||
      (typeof item.dueAt === 'string' &&
        item.dueAt.length > 0 &&
        !Number.isNaN(Date.parse(item.dueAt))))
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
    // 兼容旧数据:缺少 dueAt 视为未指定时间,缺少 priority 视为“一般”
    return parsed.map((todo) => ({
      ...todo,
      priority: todo.priority === 'urgent' ? 'urgent' : 'normal',
      dueAt: todo.dueAt ?? null,
    }));
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
  due: document.getElementById('todo-due'),
  priorityInputs: document.querySelectorAll('input[name="priority"]'),
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
 * 把存储中的 ISO 时间格式化为列表里展示的本地时间。
 * 同年省略年份,跨年时补全年份,避免“什么时间”产生歧义。
 * @param {string} iso ISO 时间字符串
 * @returns {string} 形如“11月25日 19:30”的本地时间文本,非法时间返回空字符串
 */
function formatDueAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value) => String(value).padStart(2, '0');
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${monthDay} ${time}`;
  }
  return `${date.getFullYear()}年${monthDay} ${time}`;
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

  const priority = todo.priority === 'urgent' ? 'urgent' : 'normal';
  const priorityBadge = document.createElement('span');
  priorityBadge.className = `todo-priority is-${priority}`;
  priorityBadge.dataset.priority = priority;
  priorityBadge.textContent = PRIORITY_LABELS[priority];

  const priorityButton = document.createElement('button');
  priorityButton.type = 'button';
  priorityButton.className = 'priority-toggle';
  priorityButton.dataset.action = 'toggle-priority';
  priorityButton.setAttribute('aria-label', getPriorityToggleLabel(todo.title, priority));
  priorityButton.title = priority === 'urgent' ? '点击切换为一般' : '点击切换为紧急';
  priorityButton.appendChild(priorityBadge);

  const titleRow = document.createElement('div');
  titleRow.className = 'todo-title-row';
  titleRow.append(priorityButton, titleNode);

  const content = document.createElement('div');
  content.className = 'todo-content';
  content.appendChild(titleRow);
  if (todo.dueAt) {
    const dueNode = document.createElement('time');
    dueNode.className = 'todo-due';
    dueNode.dateTime = todo.dueAt;
    dueNode.textContent = `时间:${formatDueAt(todo.dueAt)}`;
    content.appendChild(dueNode);
  }

  item.append(checkLabel, content, deleteButton);
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
 * 分类切换按钮的读屏文案。
 * @param {string} title 待办标题
 * @param {'normal'|'urgent'} priority 当前分类
 * @returns {string} 按钮说明
 */
function getPriorityToggleLabel(title, priority) {
  return priority === 'urgent' ? `将「${title}」改为一般` : `将「${title}」改为紧急`;
}

/**
 * 把 datetime-local 输入框的值转换为 ISO 时间字符串。
 * 空值或非法值返回 null,表示不为待办指定时间。
 * @param {string} value 输入框的值(本地时间)
 * @returns {string|null} ISO 时间字符串或 null
 */
function parseDueAtInput(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 读取当前选中的分类,未选或非法值回退到“一般”。
 * @returns {'normal'|'urgent'} 分类
 */
function getSelectedPriority() {
  const selected = elements.form.querySelector('input[name="priority"]:checked');
  return selected && PRIORITIES.includes(selected.value) ? selected.value : DEFAULT_PRIORITY;
}

/**
 * 新增成功后把分类选择重置为默认的“一般”。
 */
function resetPriorityInput() {
  elements.priorityInputs.forEach((input) => {
    input.checked = input.value === DEFAULT_PRIORITY;
  });
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
    priority: getSelectedPriority(),
    dueAt: parseDueAtInput(elements.due.value),
  };

  todos.unshift(todo);
  newItemId = todo.id;
  saveTodos(todos);

  elements.input.value = '';
  elements.due.value = '';
  resetPriorityInput();
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
 * 切换单条待办的分类(一般 <-> 紧急),并原地更新徽标,避免丢失键盘焦点。
 * @param {HTMLButtonElement} button 分类切换按钮
 */
function handlePriorityToggle(button) {
  const item = button.closest('.todo-item');
  if (!item) {
    return;
  }
  const todo = todos.find((entry) => entry.id === item.dataset.id);
  if (!todo) {
    return;
  }
  const priority = todo.priority === 'urgent' ? 'normal' : 'urgent';
  todo.priority = priority;
  saveTodos(todos);

  const badge = button.querySelector('.todo-priority');
  if (badge) {
    badge.className = `todo-priority is-${priority}`;
    badge.dataset.priority = priority;
    badge.textContent = PRIORITY_LABELS[priority];
  }
  button.setAttribute('aria-label', getPriorityToggleLabel(todo.title, priority));
  button.title = priority === 'urgent' ? '点击切换为一般' : '点击切换为紧急';
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
    const priorityButton = event.target.closest('.priority-toggle');
    if (priorityButton) {
      handlePriorityToggle(priorityButton);
      return;
    }
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
   重要日子
   ========================================================================== */

const DATE_STORAGE_KEY = 'todo-app-important-dates';
const MAX_DATE_NAME_LENGTH = 30;
const MAX_DATE_NOTE_LENGTH = 50;
const MIN_DATE_YEAR = 1900;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dateElements = {
  form: document.getElementById('date-form'),
  name: document.getElementById('date-name'),
  month: document.getElementById('date-month'),
  day: document.getElementById('date-day'),
  year: document.getElementById('date-year'),
  note: document.getElementById('date-note'),
  error: document.getElementById('date-error'),
  list: document.getElementById('date-list'),
  empty: document.getElementById('date-empty'),
};

let importantDates = loadImportantDates();

/**
 * 返回某个月份的天数。
 * 未填写年份时按闰年处理,使 2 月 29 日生日也能被记录。
 * @param {number} month 月份 1-12
 * @param {number|null} year 年份,可为 null
 * @returns {number} 该月天数
 */
function daysInMonth(month, year) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return 31;
  }
  const referenceYear = Number.isInteger(year) && year >= MIN_DATE_YEAR ? year : 2000;
  return new Date(referenceYear, month, 0).getDate();
}

/**
 * 判断一条本地数据是否符合重要日子数据模型。
 * @param {unknown} item 待校验的数据
 * @returns {boolean} 是否符合数据模型
 */
function isValidImportantDate(item) {
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof item.id !== 'string' ||
    item.id.length === 0 ||
    typeof item.name !== 'string' ||
    item.name.trim().length === 0 ||
    item.name.length > MAX_DATE_NAME_LENGTH ||
    !Number.isInteger(item.month) ||
    item.month < 1 ||
    item.month > 12 ||
    !Number.isInteger(item.day) ||
    item.day < 1 ||
    typeof item.createdAt !== 'string' ||
    Number.isNaN(Date.parse(item.createdAt))
  ) {
    return false;
  }
  const year = item.year ?? null;
  if (
    year !== null &&
    (!Number.isInteger(year) || year < MIN_DATE_YEAR || year > new Date().getFullYear())
  ) {
    return false;
  }
  if (item.day > daysInMonth(item.month, year)) {
    return false;
  }
  if (
    item.note !== undefined &&
    (typeof item.note !== 'string' || item.note.length > MAX_DATE_NOTE_LENGTH)
  ) {
    return false;
  }
  return true;
}

/**
 * 从 localStorage 读取重要日子。
 * 读取失败或数据格式非法时降级为空列表,不影响待办功能。
 * @returns {Array<object>} 重要日子数组
 */
function loadImportantDates() {
  try {
    const raw = localStorage.getItem(DATE_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidImportantDate)) {
      console.warn('本地重要日子数据格式非法,已降级为空列表。');
      return [];
    }
    return parsed.map((item) => ({
      ...item,
      year: item.year ?? null,
      note: item.note ?? '',
    }));
  } catch (error) {
    warnStorageOnce('读取本地重要日子数据失败,已降级为空列表。', error);
    return [];
  }
}

/**
 * 将重要日子写入 localStorage。
 */
function saveImportantDates() {
  try {
    localStorage.setItem(DATE_STORAGE_KEY, JSON.stringify(importantDates));
  } catch (error) {
    warnStorageOnce('本地存储不可用,当前更改不会被保存。', error);
  }
}

/**
 * 返回今天零点的本地 Date,用于按“天”计算倒数。
 * @returns {Date} 今天 00:00
 */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 计算某个“月-日”下一次出现的日期。
 * 2 月 29 日在平年会顺延到 3 月 1 日。
 * @param {number} month 月份 1-12
 * @param {number} day 日
 * @param {Date} today 今天 00:00
 * @returns {Date} 下一次出现的日期(本地 00:00)
 */
function getNextOccurrence(month, day, today) {
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return next;
}

/**
 * 计算目标日期距今天还有多少天。
 * @param {Date} target 目标日期(本地 00:00)
 * @param {Date} today 今天 00:00
 * @returns {number} 相差天数,0 表示今天
 */
function getDaysUntil(target, today) {
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * 把记录的年月日格式化为展示文本。
 * 未填写年份时只显示月日。
 * @param {object} item 重要日子
 * @returns {string} 形如“1999年3月14日”或“3月14日”
 */
function formatDateWhen(item) {
  if (item.year !== null) {
    return `${item.year}年${item.month}月${item.day}日`;
  }
  return `${item.month}月${item.day}日`;
}

/**
 * 倒数文案。
 * @param {number} days 相差天数
 * @returns {string} 今天 / 明天 / 还有 N 天
 */
function formatCountdown(days) {
  if (days === 0) {
    return '今天';
  }
  if (days === 1) {
    return '明天';
  }
  return `还有 ${days} 天`;
}

/**
 * 读取年份输入框:空值返回 null,非整数返回 NaN(由提交校验提示)。
 * @returns {number|null} 年份
 */
function readYearInput() {
  const raw = dateElements.year.value.trim();
  if (raw === '') {
    return null;
  }
  const year = Number(raw);
  return Number.isInteger(year) ? year : Number.NaN;
}

/**
 * 初始化月份下拉框。
 */
function buildMonthOptions() {
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '月';
  placeholder.disabled = true;
  placeholder.selected = true;
  fragment.appendChild(placeholder);

  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement('option');
    option.value = String(month);
    option.textContent = `${month}月`;
    fragment.appendChild(option);
  }
  dateElements.month.replaceChildren(fragment);
  syncDayOptions();
}

/**
 * 根据所选月份和年份重建“日”下拉框,并尽量保留已选日期。
 * 例如 2 月只列出 28/29 天,避免产生无效日期。
 */
function syncDayOptions() {
  const month = Number.parseInt(dateElements.month.value, 10);
  const year = readYearInput();
  const yearForDays = Number.isInteger(year) && year >= MIN_DATE_YEAR ? year : null;
  const maxDay = Number.isInteger(month) ? daysInMonth(month, yearForDays) : 31;
  const previousDay = Number.parseInt(dateElements.day.value, 10);

  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '日';
  placeholder.disabled = true;
  fragment.appendChild(placeholder);

  let hasSelectedDay = false;
  for (let day = 1; day <= maxDay; day += 1) {
    const option = document.createElement('option');
    option.value = String(day);
    option.textContent = `${day}日`;
    const isSelected = Number.isInteger(previousDay) && previousDay === day;
    option.selected = isSelected;
    if (isSelected) {
      hasSelectedDay = true;
    }
    fragment.appendChild(option);
  }
  placeholder.selected = !hasSelectedDay;
  dateElements.day.replaceChildren(fragment);
}

/**
 * 显示错误提示并聚焦到出错的控件。
 * @param {string} message 错误文案
 * @param {HTMLElement} [field] 需要聚焦并标记的控件
 */
function showDateError(message, field) {
  dateElements.error.textContent = message;
  dateElements.error.hidden = false;
  [dateElements.name, dateElements.month, dateElements.day, dateElements.year].forEach((control) => {
    control.removeAttribute('aria-invalid');
  });
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}

/**
 * 隐藏错误提示并清除控件的错误状态。
 */
function hideDateError() {
  dateElements.error.hidden = true;
  dateElements.error.textContent = '';
  [dateElements.name, dateElements.month, dateElements.day, dateElements.year].forEach((control) => {
    control.removeAttribute('aria-invalid');
  });
}

/**
 * 新增成功后重置表单,把月份 / 日期恢复为占位选项。
 */
function resetDateForm() {
  dateElements.form.reset();
  dateElements.month.value = '';
  syncDayOptions();
  dateElements.day.value = '';
  hideDateError();
}

/**
 * 创建单条重要日子的 DOM 节点。
 * @param {object} item 重要日子
 * @param {number} days 距下次出现的天数
 * @returns {HTMLLIElement} 列表项节点
 */
function createImportantDateItem(item, days) {
  const listItem = document.createElement('li');
  listItem.className = 'date-item';
  listItem.dataset.id = item.id;

  const main = document.createElement('div');
  main.className = 'date-main';

  const nameRow = document.createElement('div');
  nameRow.className = 'date-name-row';
  const name = document.createElement('span');
  name.className = 'date-name';
  name.textContent = item.name;
  const when = document.createElement('span');
  when.className = 'date-when';
  when.textContent = formatDateWhen(item);
  nameRow.append(name, when);
  main.appendChild(nameRow);

  if (item.note) {
    const note = document.createElement('span');
    note.className = 'date-note';
    note.textContent = item.note;
    main.appendChild(note);
  }

  const countdown = document.createElement('span');
  countdown.className = 'date-countdown';
  countdown.textContent = formatCountdown(days);
  if (days === 0) {
    countdown.classList.add('is-today');
  } else if (days <= 7) {
    countdown.classList.add('is-soon');
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button date-delete';
  deleteButton.dataset.action = 'delete-date';
  deleteButton.setAttribute('aria-label', `删除「${item.name}」`);
  deleteButton.textContent = '×';

  listItem.append(main, countdown, deleteButton);
  return listItem;
}

/**
 * 按距下次出现的天数升序渲染重要日子列表。
 */
function renderImportantDates() {
  const today = startOfToday();
  const entries = importantDates
    .map((item) => {
      const next = getNextOccurrence(item.month, item.day, today);
      return { item, days: getDaysUntil(next, today) };
    })
    .sort((a, b) => {
      if (a.days !== b.days) {
        return a.days - b.days;
      }
      if (a.item.month !== b.item.month) {
        return a.item.month - b.item.month;
      }
      return a.item.name.localeCompare(b.item.name, 'zh-Hans-CN');
    });

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    fragment.appendChild(createImportantDateItem(entry.item, entry.days));
  });
  dateElements.list.replaceChildren(fragment);
  dateElements.empty.hidden = entries.length > 0;
}

/**
 * 处理新增重要日子的表单提交。
 * @param {SubmitEvent} event 提交事件
 */
function handleDateSubmit(event) {
  event.preventDefault();
  const name = dateElements.name.value.trim();
  const month = Number.parseInt(dateElements.month.value, 10);
  const day = Number.parseInt(dateElements.day.value, 10);
  const year = readYearInput();
  const note = dateElements.note.value.trim();

  if (!name) {
    showDateError('请填写名称', dateElements.name);
    return;
  }
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    showDateError('请选择日期', Number.isInteger(month) ? dateElements.day : dateElements.month);
    return;
  }
  if (Number.isNaN(year)) {
    showDateError('年份请填写数字', dateElements.year);
    return;
  }
  if (year !== null && (year < MIN_DATE_YEAR || year > new Date().getFullYear())) {
    showDateError(
      `年份需在 ${MIN_DATE_YEAR} 到 ${new Date().getFullYear()} 之间`,
      dateElements.year
    );
    return;
  }
  if (day > daysInMonth(month, year)) {
    showDateError('请选择有效日期', dateElements.day);
    return;
  }

  importantDates.push({
    id: createId(),
    name: name.slice(0, MAX_DATE_NAME_LENGTH),
    month,
    day,
    year,
    note: note.slice(0, MAX_DATE_NOTE_LENGTH),
    createdAt: new Date().toISOString(),
  });
  saveImportantDates();
  resetDateForm();
  renderImportantDates();
  dateElements.name.focus();
}

/**
 * 删除一条重要日子。
 * @param {HTMLElement} listItem 列表项
 */
function handleDateDelete(listItem) {
  const id = listItem.dataset.id;
  importantDates = importantDates.filter((item) => item.id !== id);
  saveImportantDates();
  renderImportantDates();
}

/**
 * 初始化重要日子:月份选项、事件绑定与首屏渲染。
 */
function initImportantDates() {
  buildMonthOptions();

  dateElements.form.addEventListener('submit', handleDateSubmit);
  dateElements.month.addEventListener('change', () => {
    syncDayOptions();
    hideDateError();
  });
  dateElements.year.addEventListener('input', () => {
    syncDayOptions();
    hideDateError();
  });
  dateElements.name.addEventListener('input', hideDateError);

  dateElements.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete-date"]');
    if (button) {
      handleDateDelete(button.closest('.date-item'));
    }
  });

  renderImportantDates();
}

/* ==========================================================================
   初始化
   ========================================================================== */

function init() {
  bindEvents();
  initImportantDates();
  updateCharCount();
  render();
}

init();
