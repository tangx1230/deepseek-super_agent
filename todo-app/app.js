'use strict';

/* ==========================================================================
   存储部分
   ========================================================================== */

const STORAGE_KEY = 'todo-app-items';
const SCHEDULE_STORAGE_KEY = 'todo-app-schedules';
const MAX_TITLE_LENGTH = 100;
const MAX_SCHEDULE_TITLE_LENGTH = 100;
const PRIORITIES = ['normal', 'urgent'];
const PRIORITY_LABELS = { normal: '一般', urgent: '紧急' };
const DEFAULT_PRIORITY = 'normal';
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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

/**
 * 把日期对象格式化为本地日期 key(YYYY-MM-DD)。
 * 不使用 toISOString,避免时区换算导致日期偏移。
 * @param {Date} date 日期对象
 * @returns {string} 形如“2026-11-26”的本地日期 key
 */
function formatDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 解析 YYYY-MM-DD 日期 key,并校验是真实存在的日期(如排除 2 月 30 日)。
 * @param {string} key 日期 key
 * @returns {Date|null} 本地日期对象,非法时返回 null
 */
function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * 判断一条本地数据是否符合日程数据模型。
 * @param {unknown} item 待校验的数据
 * @returns {boolean} 是否符合数据模型
 */
function isValidSchedule(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    item.title.length <= MAX_SCHEDULE_TITLE_LENGTH &&
    typeof item.date === 'string' &&
    parseDateKey(item.date) !== null &&
    // time 为可选字段:缺省或 null 表示全天,否则必须是 HH:MM
    (item.time === undefined ||
      item.time === null ||
      (typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) &&
    typeof item.createdAt === 'string' &&
    !Number.isNaN(Date.parse(item.createdAt))
  );
}

/**
 * 从 localStorage 读取日程数据。
 * 读取失败或数据格式非法时降级为空列表,保证应用可继续使用。
 * @returns {Array<object>} 日程数组
 */
function loadSchedules() {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidSchedule)) {
      console.warn('本地日程数据格式非法,已降级为空列表。');
      return [];
    }
    return parsed.map((schedule) => ({
      ...schedule,
      time: schedule.time ?? null,
    }));
  } catch (error) {
    warnStorageOnce('读取本地日程数据失败,已降级为空列表。', error);
    return [];
  }
}

/**
 * 将日程数组写入 localStorage。
 * localStorage 不可用(如隐私模式)时仅跳过持久化,不影响正常使用。
 * @param {Array<object>} schedules 日程数组
 */
function saveSchedules(schedules) {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules));
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
  calendar: document.getElementById('calendar'),
  calendarMonth: document.getElementById('calendar-month'),
  calendarPrev: document.getElementById('calendar-prev'),
  calendarNext: document.getElementById('calendar-next'),
  calendarToday: document.getElementById('calendar-today'),
  selectedDateLabel: document.getElementById('selected-date'),
  scheduleCount: document.getElementById('schedule-count'),
  scheduleForm: document.getElementById('schedule-form'),
  scheduleTime: document.getElementById('schedule-time'),
  scheduleInput: document.getElementById('schedule-input'),
  scheduleError: document.getElementById('schedule-error'),
  scheduleList: document.getElementById('schedule-list'),
  scheduleEmpty: document.getElementById('schedule-empty'),
};

let todos = loadTodos();
let schedules = loadSchedules();
let activeFilter = 'all';
let editingId = null;
let newItemId = null;

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = formatDateKey(today);

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
 * 返回某一天的日程。
 * @param {string} dateKey 日期 key
 * @returns {Array<object>} 当天日程数组
 */
function getSchedulesOn(dateKey) {
  return schedules.filter((schedule) => schedule.date === dateKey);
}

/**
 * 按时间排序当天日程:全天在前,其余按 HH:MM 升序,同一时间按创建时间。
 * @param {Array<object>} daySchedules 当天日程
 * @returns {Array<object>} 排序后的副本
 */
function sortSchedulesForDay(daySchedules) {
  return daySchedules.slice().sort((a, b) => {
    if (a.time === b.time) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    if (a.time === null) {
      return -1;
    }
    if (b.time === null) {
      return 1;
    }
    return a.time.localeCompare(b.time);
  });
}

/**
 * 生成日期面板标题,同年省略年份。
 * @param {Date} date 日期
 * @returns {string} 形如“11月26日 周四”
 */
function formatDayLabel(date) {
  const prefix = date.getFullYear() === today.getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_NAMES[date.getDay()]}`;
}

/**
 * 生成日历日期的读屏文案,包含当天日程数量。
 * @param {string} dateKey 日期 key
 * @returns {string} 读屏文案
 */
function getDayAriaLabel(dateKey) {
  const date = parseDateKey(dateKey);
  const count = getSchedulesOn(dateKey).length;
  const dayLabel = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_NAMES[date.getDay()]}`;
  return count > 0 ? `${dayLabel}，${count} 个日程` : dayLabel;
}

/**
 * 创建一个日历日期按钮。
 * @param {string} dateKey 日期 key
 * @param {number} dayNumber 当月第几天
 * @param {string} todayKey 今天的日期 key
 * @returns {HTMLButtonElement} 日期按钮
 */
function createCalendarDayButton(dateKey, dayNumber, todayKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-day';
  button.dataset.date = dateKey;
  button.textContent = String(dayNumber);

  const isSelected = dateKey === selectedDate;
  if (dateKey === todayKey) {
    button.classList.add('is-today');
    button.setAttribute('aria-current', 'date');
  }
  if (isSelected) {
    button.classList.add('is-selected');
  }
  if (getSchedulesOn(dateKey).length > 0) {
    button.classList.add('has-schedule');
    const dot = document.createElement('span');
    dot.className = 'calendar-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);
  }
  button.setAttribute('aria-pressed', String(isSelected));
  button.setAttribute('aria-label', getDayAriaLabel(dateKey));
  return button;
}

/**
 * 渲染当前月份的日历。
 */
function renderCalendar() {
  elements.calendarMonth.textContent = `${viewYear}年${viewMonth + 1}月`;
  elements.calendar.querySelectorAll('.calendar-row').forEach((row) => row.remove());

  // 周一作为一周的第一天
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const todayKey = formatDateKey(new Date());
  const fragment = document.createDocumentFragment();

  let row = null;
  for (let index = 0; index < totalCells; index += 1) {
    if (index % 7 === 0) {
      row = document.createElement('div');
      row.className = 'calendar-row';
      row.setAttribute('role', 'row');
      fragment.appendChild(row);
    }
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.setAttribute('role', 'gridcell');
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber >= 1 && dayNumber <= daysInMonth) {
      const monthPart = String(viewMonth + 1).padStart(2, '0');
      const dayPart = String(dayNumber).padStart(2, '0');
      cell.appendChild(createCalendarDayButton(`${viewYear}-${monthPart}-${dayPart}`, dayNumber, todayKey));
    } else {
      cell.setAttribute('aria-hidden', 'true');
    }
    row.appendChild(cell);
  }
  elements.calendar.appendChild(fragment);
}

/**
 * 只更新日历里的选中状态,避免键盘焦点因整体重绘而丢失。
 */
function updateCalendarSelection() {
  elements.calendar.querySelectorAll('.calendar-day').forEach((button) => {
    const isSelected = button.dataset.date === selectedDate;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

/**
 * 创建一条日程的 DOM 节点。
 * @param {object} schedule 日程数据
 * @returns {HTMLLIElement} 列表项节点
 */
function createScheduleItem(schedule) {
  const item = document.createElement('li');
  item.className = 'schedule-item';
  item.dataset.id = schedule.id;

  const timeNode = document.createElement(schedule.time ? 'time' : 'span');
  timeNode.className = 'schedule-item-time';
  if (schedule.time) {
    timeNode.dateTime = schedule.time;
  } else {
    timeNode.classList.add('is-allday');
  }
  timeNode.textContent = schedule.time ?? '全天';

  const titleNode = document.createElement('span');
  titleNode.className = 'schedule-item-title';
  titleNode.textContent = schedule.title;

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'schedule-delete';
  deleteButton.dataset.action = 'delete-schedule';
  deleteButton.setAttribute('aria-label', `删除日程：${schedule.title}`);
  deleteButton.textContent = '×';

  item.append(timeNode, titleNode, deleteButton);
  return item;
}

/**
 * 渲染选中日期的日程摘要、列表与空状态。
 */
function renderDayPanel() {
  const date = parseDateKey(selectedDate);
  if (!date) {
    return;
  }
  elements.selectedDateLabel.textContent = formatDayLabel(date);

  const daySchedules = sortSchedulesForDay(getSchedulesOn(selectedDate));
  elements.scheduleCount.textContent = `${daySchedules.length} 个日程`;

  const fragment = document.createDocumentFragment();
  daySchedules.forEach((schedule) => {
    fragment.appendChild(createScheduleItem(schedule));
  });
  elements.scheduleList.replaceChildren(fragment);
  elements.scheduleList.hidden = daySchedules.length === 0;
  elements.scheduleEmpty.hidden = daySchedules.length > 0;
}

/**
 * 新增或删除日程后,原地刷新某一天的圆点与读屏文案。
 * @param {string} dateKey 日期 key
 */
function refreshCalendarDay(dateKey) {
  const button = elements.calendar.querySelector(`.calendar-day[data-date="${dateKey}"]`);
  if (!button) {
    return;
  }
  const count = getSchedulesOn(dateKey).length;
  button.classList.toggle('has-schedule', count > 0);

  const dot = button.querySelector('.calendar-dot');
  if (count > 0 && !dot) {
    const newDot = document.createElement('span');
    newDot.className = 'calendar-dot';
    newDot.setAttribute('aria-hidden', 'true');
    button.appendChild(newDot);
  } else if (count === 0 && dot) {
    dot.remove();
  }
  button.setAttribute('aria-label', getDayAriaLabel(dateKey));
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

/**
 * 展示日程内容为空的提示。
 */
function showScheduleError() {
  elements.scheduleError.hidden = false;
  elements.scheduleInput.setAttribute('aria-invalid', 'true');
  elements.scheduleInput.focus();
}

/**
 * 隐藏日程内容为空的提示。
 */
function hideScheduleError() {
  elements.scheduleError.hidden = true;
  elements.scheduleInput.removeAttribute('aria-invalid');
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
 * 解析 time 输入框的值,空值或非法值返回 null(表示全天)。
 * @param {string} value 输入框的值
 * @returns {string|null} HH:MM 或 null
 */
function parseScheduleTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

/**
 * 处理新增日程表单提交。
 * @param {SubmitEvent} event 提交事件
 */
function handleScheduleSubmit(event) {
  event.preventDefault();
  const title = elements.scheduleInput.value.trim();
  if (!title) {
    showScheduleError();
    return;
  }

  const schedule = {
    id: createId(),
    date: selectedDate,
    time: parseScheduleTime(elements.scheduleTime.value),
    title: title.slice(0, MAX_SCHEDULE_TITLE_LENGTH),
    createdAt: new Date().toISOString(),
  };

  schedules.push(schedule);
  saveSchedules(schedules);

  elements.scheduleInput.value = '';
  elements.scheduleTime.value = '';
  hideScheduleError();
  renderDayPanel();
  refreshCalendarDay(selectedDate);
  elements.scheduleInput.focus();
}

/**
 * 切换日历选中的日期,并同步下方的日程面板。
 * @param {string} dateKey 日期 key
 */
function selectCalendarDate(dateKey) {
  if (parseDateKey(dateKey) === null) {
    return;
  }
  selectedDate = dateKey;
  updateCalendarSelection();
  hideScheduleError();
  renderDayPanel();
}

/**
 * 切换月份,保留当前选中日期。
 * @param {number} delta 月份偏移量,-1 为上个月,1 为下个月
 */
function changeCalendarMonth(delta) {
  const nextMonth = new Date(viewYear, viewMonth + delta, 1);
  viewYear = nextMonth.getFullYear();
  viewMonth = nextMonth.getMonth();
  hideScheduleError();
  renderCalendar();
}

/**
 * 回到今天并选中今天。
 */
function goToToday() {
  const now = new Date();
  selectedDate = formatDateKey(now);
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  hideScheduleError();
  renderCalendar();
  renderDayPanel();
}

/**
 * 删除一条日程。
 * @param {HTMLButtonElement} button 删除按钮
 */
function handleScheduleDelete(button) {
  const item = button.closest('.schedule-item');
  if (!item) {
    return;
  }
  schedules = schedules.filter((schedule) => schedule.id !== item.dataset.id);
  saveSchedules(schedules);
  renderDayPanel();
  refreshCalendarDay(selectedDate);
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

  elements.calendarPrev.addEventListener('click', () => changeCalendarMonth(-1));
  elements.calendarNext.addEventListener('click', () => changeCalendarMonth(1));
  elements.calendarToday.addEventListener('click', goToToday);

  elements.calendar.addEventListener('click', (event) => {
    const dayButton = event.target.closest('.calendar-day');
    if (dayButton) {
      selectCalendarDate(dayButton.dataset.date);
    }
  });

  elements.scheduleForm.addEventListener('submit', handleScheduleSubmit);
  elements.scheduleInput.addEventListener('input', () => {
    if (!elements.scheduleError.hidden) {
      hideScheduleError();
    }
  });

  elements.scheduleList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.schedule-delete');
    if (deleteButton) {
      handleScheduleDelete(deleteButton);
    }
  });
}

/* ==========================================================================
   初始化
   ========================================================================== */

function init() {
  bindEvents();
  updateCharCount();
  renderCalendar();
  renderDayPanel();
  render();
}

init();
