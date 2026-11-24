/* ============================================================
   GROWTH BY MANNAT — TASKFLOW PRO (LIGHT THEME)
   ============================================================ */

const STORAGE_KEY = 'growth_by_mannat_taskflow_v3';

let state = {
  tasks: [],
  tracker: {},
  weekGoal: 20,
  filter: 'today',
  view: 'today',
  search: '',
  clientFilter: '',
  sort: 'priority'
};

let editingNoteId = null;
let editingSubtaskId = null;
const charts = {};

/* ---------- Utilities ---------- */
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}
function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Persistence ---------- */
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    tracker: state.tracker,
    weekGoal: state.weekGoal
  }));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state.tasks = p.tasks || [];
      state.tracker = p.tracker || {};
      state.weekGoal = p.weekGoal || 20;
    }
  } catch (e) { console.warn('Load failed', e); }
}

/* ---------- Carry Over ---------- */
function processCarryOver() {
  const today = dateKey();
  let carried = 0;
  state.tasks.forEach(t => {
    if (t.status === 'pending' && t.dueDate && t.dueDate < today) {
      t.carriedOver = true;
      t.dueDate = today;
      carried++;
    }
  });
  if (carried) {
    saveState();
    setTimeout(() => toast(`${carried} task${carried > 1 ? 's' : ''} carried over!`, 'info'), 400);
  }
}

/* ---------- Streak ---------- */
function getStreak() {
  let streak = 0;
  let d = new Date();
  if (state.tracker[dateKey(d)] !== true) d.setDate(d.getDate() - 1);
  while (state.tracker[dateKey(d)] === true) {
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
}
function updateTrackerUI() {
  const v = state.tracker[dateKey()];
  document.getElementById('trackerYes').classList.toggle('active', v === true);
  document.getElementById('trackerNo').classList.toggle('active', v === false);
}

/* ---------- Sidebar ---------- */
function updateSidebar() {
  document.getElementById('streakNum').textContent = getStreak();
  const done = state.tasks.filter(t => t.status === 'done');
  document.getElementById('totalDone').textContent = done.length;
  const sec = done.reduce((s, t) => s + (t.timeSpent || 0), 0);
  document.getElementById('totalTime').textContent = fmtDuration(sec);
}

/* ---------- Today Stats ---------- */
function updateTodayStats() {
  const today = dateKey();
  const todays = state.tasks.filter(t => t.dueDate === today);
  const done = todays.filter(t => t.status === 'done').length;
  const time = todays.reduce((s, t) => {
    let sec = t.timeSpent || 0;
    if (t.timerRunning && t.timerStartedAt) sec += Math.floor((Date.now() - t.timerStartedAt) / 1000);
    return s + sec;
  }, 0);
  document.getElementById('statTotal').textContent = todays.length;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPending').textContent = todays.length - done;
  document.getElementById('statTime').textContent = fmtDuration(time);
}

/* ---------- Render Tasks ---------- */
function renderTasks() {
  const container = document.getElementById('taskList');
  const today = dateKey();
  let tasks = [...state.tasks];

  // Filters
  if (state.filter === 'today') tasks = tasks.filter(t => t.dueDate === today);
  else if (state.filter === 'pending') tasks = tasks.filter(t => t.status === 'pending');
  else if (state.filter === 'done') tasks = tasks.filter(t => t.status === 'done');

  // Client filter
  if (state.clientFilter) tasks = tasks.filter(t => t.client === state.clientFilter);

  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    tasks = tasks.filter(t =>
      (t.client || '').toLowerCase().includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.tags || []).join(' ').toLowerCase().includes(q)
    );
  }

  // Sorting
  const pOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    if (state.sort === 'priority') {
      if (a.carriedOver !== b.carriedOver) return b.carriedOver - a.carriedOver;
      return pOrder[a.priority] - pOrder[b.priority];
    }
    if (state.sort === 'newest') return b.createdAt - a.createdAt;
    if (state.sort === 'oldest') return a.createdAt - b.createdAt;
    if (state.sort === 'client') return (a.client || '').localeCompare(b.client || '');
    if (state.sort === 'time') return (b.timeSpent || 0) - (a.timeSpent || 0);
    return 0;
  });

  if (!tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">${state.filter === 'done' ? '🏆' : '✨'}</div>
        <h3>${state.filter === 'done' ? 'No completed tasks yet' : 'All clear!'}</h3>
        <p>${state.filter === 'done' ? 'Complete a task to see it here.' : 'Add your first task above to get started.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = tasks.map((t, i) => {
    let sec = t.timeSpent || 0;
    if (t.timerRunning && t.timerStartedAt) sec += Math.floor((Date.now() - t.timerStartedAt) / 1000);

    const tags = (t.tags || []).map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('');
    const carry = t.carriedOver ? `<span class="carry-badge">↻ Carried</span>` : '';
    const dueToday = t.dueDate === today && !t.carriedOver;
    const dueBadge = t.dueDate && !dueToday && t.status !== 'done'
      ? `<span class="due-badge">📅 ${t.dueDate}</span>` : '';
    const est = t.estimate ? `<span class="dot"></span><span>Est: ${t.estimate}h</span>` : '';
    const notes = t.notes ? `<span class="dot"></span><span title="Has notes">📝</span>` : '';

    let subtasksHtml = '';
    if (t.subtasks && t.subtasks.length) {
      const doneST = t.subtasks.filter(st => st.done).length;
      const pct = Math.round((doneST / t.subtasks.length) * 100);
      subtasksHtml = `<span class="dot"></span>
        <span class="subtask-progress">
          ☑ ${doneST}/${t.subtasks.length}
          <span class="st-bar"><span class="st-fill" style="width:${pct}%"></span></span>
        </span>`;
    }

    return `
      <div class="task-card priority-${t.priority} ${t.status === 'done' ? 'done' : ''}" style="animation-delay:${i * 30}ms">
        <div class="task-priority-bar"></div>
        <div class="task-main">
          <div class="task-top">
            <span class="client-badge">${escapeHtml(t.client)}</span>
            <span class="priority-badge ${t.priority}">${t.priority}</span>
            ${carry}${dueBadge}${tags}
          </div>
          <h3 class="task-title">${escapeHtml(t.title)}</h3>
          <div class="task-meta">
            <span class="timer ${t.timerRunning ? 'running' : ''}" data-timer-id="${t.id}">
              ${t.timerRunning ? '⏱ ' : ''}${fmtDuration(sec)}
            </span>
            ${est}${subtasksHtml}${notes}
            ${t.status === 'done' ? '<span class="dot"></span><span style="color:var(--success)">✓ Done</span>' : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" onclick="openNotes('${t.id}')" title="Notes">📝</button>
          <button class="icon-btn sub-btn" onclick="openSubtasks('${t.id}')" title="Subtasks">☑</button>
          ${t.status !== 'done' ? `
            <button class="icon-btn timer-btn ${t.timerRunning ? 'running' : ''}" onclick="toggleTimer('${t.id}')" title="${t.timerRunning ? 'Pause' : 'Start'}">
              ${t.timerRunning ? '⏸' : '▶'}
            </button>
            <button class="icon-btn done-btn" onclick="completeTask('${t.id}')" title="Complete">✓</button>
          ` : ''}
          <button class="icon-btn delete-btn" onclick="deleteTask('${t.id}')" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');
}

/* ---------- Client dropdown ---------- */
function updateClientFilter() {
  const sel = document.getElementById('clientFilter');
  const current = sel.value;
  const clients = [...new Set(state.tasks.map(t => t.client).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All Clients</option>` +
    clients.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (clients.includes(current)) sel.value = current;
}

/* ---------- Add task ---------- */
function addTask(data) {
  const task = {
    id: uid(),
    client: data.client.trim(),
    title: data.title.trim(),
    priority: data.priority,
    estimate: data.estimate ? parseFloat(data.estimate) : null,
    tags: data.tags ? data.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    notes: '',
    subtasks: [],
    status: 'pending',
    createdAt: Date.now(),
    dueDate: data.dueDate || dateKey(),
    carriedOver: false,
    timeSpent: 0,
    timerRunning: false,
    timerStartedAt: null,
    completedAt: null
  };
  state.tasks.push(task);
  saveState();
  renderAll();
  toast('Task added!', 'success');
}

/* ---------- Timer ---------- */
function toggleTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.timerRunning) {
    task.timeSpent += Math.floor((Date.now() - task.timerStartedAt) / 1000);
    task.timerRunning = false; task.timerStartedAt = null;
  } else {
    state.tasks.forEach(t => {
      if (t.timerRunning && t.id !== id) {
        t.timeSpent += Math.floor((Date.now() - t.timerStartedAt) / 1000);
        t.timerRunning = false; t.timerStartedAt = null;
      }
    });
    task.timerRunning = true; task.timerStartedAt = Date.now();
  }
  saveState(); renderAll();
}

/* ---------- Complete / Delete ---------- */
function completeTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.timerRunning) {
    task.timeSpent += Math.floor((Date.now() - task.timerStartedAt) / 1000);
    task.timerRunning = false; task.timerStartedAt = null;
  }
  task.status = 'done'; task.completedAt = Date.now();
  saveState(); renderAll();
  toast(`Completed in ${fmtDuration(task.timeSpent)}!`, 'success');
}

function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState(); renderAll();
  toast('Task deleted', 'info');
}

/* ---------- Notes ---------- */
function openNotes(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  editingNoteId = id;
  document.getElementById('noteTaskTitle').textContent = t.title;
  document.getElementById('noteText').value = t.notes || '';
  document.getElementById('notesModal').classList.add('active');
}
function closeNotes() {
  document.getElementById('notesModal').classList.remove('active');
  editingNoteId = null;
}
function saveNotes() {
  if (!editingNoteId) return;
  const t = state.tasks.find(t => t.id === editingNoteId);
  if (t) { t.notes = document.getElementById('noteText').value; saveState(); toast('Notes saved', 'success'); }
  closeNotes(); renderTasks();
}

/* ---------- Subtasks ---------- */
function openSubtasks(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  editingSubtaskId = id;
  document.getElementById('subtaskTaskTitle').textContent = t.title;
  renderSubtasks();
  document.getElementById('subtasksModal').classList.add('active');
  setTimeout(() => document.getElementById('newSubtaskInput').focus(), 100);
}
function closeSubtasks() {
  document.getElementById('subtasksModal').classList.remove('active');
  editingSubtaskId = null; renderTasks();
}
function renderSubtasks() {
  const t = state.tasks.find(t => t.id === editingSubtaskId);
  if (!t) return;
  const list = document.getElementById('subtaskList');
  if (!t.subtasks.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--muted);padding:18px;font-size:12px">No subtasks yet. Add your first below.</div>`;
    return;
  }
  list.innerHTML = t.subtasks.map(st => `
    <div class="subtask-item ${st.done ? 'done' : ''}">
      <input type="checkbox" ${st.done ? 'checked' : ''} onchange="toggleSubtask('${st.id}')">
      <span>${escapeHtml(st.text)}</span>
      <button class="del-st" onclick="deleteSubtask('${st.id}')">✕</button>
    </div>
  `).join('');
}
function addSubtask() {
  const input = document.getElementById('newSubtaskInput');
  const text = input.value.trim();
  if (!text || !editingSubtaskId) return;
  const t = state.tasks.find(t => t.id === editingSubtaskId);
  if (t) {
    t.subtasks.push({ id: uid(), text, done: false });
    input.value = '';
    saveState(); renderSubtasks();
  }
}
function toggleSubtask(stId) {
  const t = state.tasks.find(t => t.id === editingSubtaskId);
  if (!t) return;
  const st = t.subtasks.find(s => s.id === stId);
  if (st) { st.done = !st.done; saveState(); renderSubtasks(); }
}
function deleteSubtask(stId) {
  const t = state.tasks.find(t => t.id === editingSubtaskId);
  if (!t) return;
  t.subtasks = t.subtasks.filter(s => s.id !== stId);
  saveState(); renderSubtasks();
}

/* ---------- Charts (Light Theme Fixes) ---------- */
function getLastNDays(n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); arr.push(d);
  }
  return arr;
}

function renderCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });

  // Light theme chart colors
  const gridColor = 'rgba(0,0,0,0.06)';
  const tickColor = '#64748B'; 
  const font = { family: 'Inter', size: 11, weight: '600' };
  const baseOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: tickColor, font, boxWidth: 12, padding: 12 } },
      tooltip: {
        backgroundColor: '#0F172A', titleColor: '#fff', bodyColor: '#E2E8F0', padding: 12, cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font }, beginAtZero: true }
    }
  };

  const week = getLastNDays(7);
  const weekData = week.map(d => {
    const k = dateKey(d);
    return state.tasks.filter(t => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === k).length;
  });
  const weekLabels = week.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));

  const c1 = document.getElementById('weeklyChart');
  if (c1) {
    charts.weekly = new Chart(c1, {
      type: 'bar',
      data: { labels: weekLabels, datasets: [{
        data: weekData,
        backgroundColor: '#8B5CF6',
        borderRadius: 6, borderSkipped: false,
        hoverBackgroundColor: '#7C3AED'
      }]},
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  // Priority
  const pc = { high: 0, medium: 0, low: 0 };
  state.tasks.filter(t => t.status === 'done').forEach(t => pc[t.priority]++);
  const totalP = pc.high + pc.medium + pc.low;
  const c2 = document.getElementById('priorityChart');
  if (c2) {
    charts.priority = new Chart(c2, {
      type: 'doughnut',
      data: {
        labels: totalP === 0 ? ['No data'] : ['High', 'Medium', 'Low'],
        datasets: [{
          data: totalP === 0 ? [1] : [pc.high, pc.medium, pc.low],
          backgroundColor: totalP === 0 ? ['#E2E8F0'] : ['#EF4444', '#F59E0B', '#10B981'],
          borderColor: '#FFFFFF', borderWidth: 2, hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tickColor, font, boxWidth: 12, padding: 12 } },
          tooltip: baseOptions.plugins.tooltip
        }
      }
    });
  }

  // Monthly
  const month = getLastNDays(30);
  const monthData = month.map(d => {
    const k = dateKey(d);
    return state.tasks.filter(t => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === k).length;
  });
  const monthLabels = month.map((d, i) => (i % 5 === 0 || i === 29) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
  const c3 = document.getElementById('monthlyChart');
  if (c3) {
    charts.monthly = new Chart(c3, {
      type: 'line',
      data: { labels: monthLabels, datasets: [{
        data: monthData,
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139,92,246,0.1)',
        fill: true, tension: 0.4, borderWidth: 2.5,
        pointBackgroundColor: '#8B5CF6', pointBorderColor: '#fff', pointBorderWidth: 2,
        pointRadius: 3, pointHoverRadius: 6
      }]},
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  // Time
  const timeData = week.map(d => {
    const k = dateKey(d);
    const sec = state.tasks.filter(t => t.completedAt && dateKey(new Date(t.completedAt)) === k)
      .reduce((s, t) => s + (t.timeSpent || 0), 0);
    return Math.round((sec / 3600) * 10) / 10;
  });
  const c4 = document.getElementById('timeChart');
  if (c4) {
    charts.time = new Chart(c4, {
      type: 'bar',
      data: { labels: weekLabels, datasets: [{
        data: timeData,
        backgroundColor: '#8B5CF6',
        borderRadius: 6, borderSkipped: false,
        hoverBackgroundColor: '#7C3AED'
      }]},
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  // Summary + goal
  const weekDone = weekData.reduce((a, b) => a + b, 0);
  const monthDone = monthData.reduce((a, b) => a + b, 0);
  const allDone = state.tasks.filter(t => t.status === 'done');
  const avgSec = allDone.length ? allDone.reduce((s, t) => s + (t.timeSpent || 0), 0) / allDone.length : 0;
  const rate = state.tasks.length ? Math.round((allDone.length / state.tasks.length) * 100) : 0;

  document.getElementById('weekDone').textContent = weekDone;
  document.getElementById('monthDone').textContent = monthDone;
  document.getElementById('avgTime').textContent = fmtDuration(Math.round(avgSec));
  document.getElementById('completionRate').textContent = rate + '%';
  document.getElementById('weekGoalDone').textContent = weekDone;
  const goalPct = Math.min(100, Math.round((weekDone / (state.weekGoal || 20)) * 100));
  document.getElementById('weekGoalFill').style.width = goalPct + '%';

  renderHeatmap();
}

/* ---------- Heatmap ---------- */
function renderHeatmap() {
  const container = document.getElementById('heatmap');
  if (!container) return;
  const days = 84;
  const today = new Date(); today.setHours(0,0,0,0);
  const counts = {};
  state.tasks.filter(t => t.status === 'done' && t.completedAt).forEach(t => {
    const k = dateKey(new Date(t.completedAt));
    counts[k] = (counts[k] || 0) + 1;
  });
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = dateKey(d);
    const c = counts[k] || 0;
    let lvl = 0;
    if (c >= 7) lvl = 4;
    else if (c >= 5) lvl = 3;
    else if (c >= 3) lvl = 2;
    else if (c >= 1) lvl = 1;
    cells.push(`<div class="heatmap-cell l${lvl}" title="${k}: ${c} task${c !== 1 ? 's' : ''}"></div>`);
  }
  container.innerHTML = cells.join('');
}

/* ---------- Clients View ---------- */
function renderClients() {
  const grid = document.getElementById('clientsGrid');
  if (!grid) return;
  const clients = {};
  state.tasks.forEach(t => {
    if (!t.client) return;
    if (!clients[t.client]) clients[t.client] = { total: 0, done: 0, pending: 0, time: 0, priorities: { high: 0, medium: 0, low: 0 } };
    const c = clients[t.client];
    c.total++;
    c.priorities[t.priority]++;
    if (t.status === 'done') { c.done++; c.time += t.timeSpent || 0; }
    else c.pending++;
  });

  const names = Object.keys(clients).sort();
  if (!names.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="emoji">👥</div>
      <h3>No clients yet</h3>
      <p>Add your first task with a client name to see them here.</p>
    </div>`;
    return;
  }

  grid.innerHTML = names.map(name => {
    const c = clients[name];
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    const initial = name.charAt(0).toUpperCase();
    return `
      <div class="client-card">
        <div class="client-card-header">
          <div class="client-avatar">${escapeHtml(initial)}</div>
          <div>
            <div class="client-name">${escapeHtml(name)}</div>
            <div class="client-sub">${c.total} task${c.total !== 1 ? 's' : ''} total</div>
          </div>
        </div>
        <div class="client-stats">
          <div class="client-stat-item"><div class="num" style="color:var(--success)">${c.done}</div><div class="lbl">Done</div></div>
          <div class="client-stat-item"><div class="num" style="color:var(--warning)">${c.pending}</div><div class="lbl">Pending</div></div>
          <div class="client-stat-item"><div class="num">${fmtDuration(c.time)}</div><div class="lbl">Time</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);font-weight:600">
          <span>Completion</span><span>${pct}%</span>
        </div>
        <div class="client-progress-bar"><div class="client-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

/* ---------- Export / Import ---------- */
function exportData() {
  const payload = {
    tasks: state.tasks,
    tracker: state.tracker,
    weekGoal: state.weekGoal,
    exportedAt: new Date().toISOString(),
    agency: 'Growth By Mannat'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `growth-by-mannat-backup-${dateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded!', 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.tasks)) throw new Error('Invalid format');
      if (!confirm('This will REPLACE all your current tasks. Continue?')) return;
      state.tasks = data.tasks;
      state.tracker = data.tracker || {};
      state.weekGoal = data.weekGoal || 20;
      saveState();
      renderAll();
      toast('Data imported!', 'success');
    } catch (err) {
      toast('Invalid file', 'error');
    }
  };
  reader.readAsText(file);
}

/* ---------- View Switch ---------- */
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  if (view === 'analytics') setTimeout(renderCharts, 60);
  if (view === 'clients') renderClients();
}

/* ---------- Render All ---------- */
function renderAll() {
  renderTasks();
  updateTodayStats();
  updateSidebar();
  updateTrackerUI();
  updateClientFilter();
  if (state.view === 'analytics') renderCharts();
  if (state.view === 'clients') renderClients();
}

/* ---------- Live timer ---------- */
setInterval(() => {
  document.querySelectorAll('[data-timer-id]').forEach(el => {
    const t = state.tasks.find(x => x.id === el.dataset.timerId);
    if (t && t.timerRunning && t.timerStartedAt) {
      const sec = t.timeSpent + Math.floor((Date.now() - t.timerStartedAt) / 1000);
      el.textContent = `⏱ ${fmtDuration(sec)}`;
    }
  });
  if (state.view === 'today') updateTodayStats();
}, 1000);

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  processCarryOver();

  document.getElementById('dateDisplay').textContent = fmtDate(new Date());
  document.getElementById('dueDateInput').value = dateKey();

  // Task form
  document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const client = document.getElementById('clientInput').value.trim();
    const title = document.getElementById('titleInput').value.trim();
    if (!client || !title) return;
    addTask({
      client, title,
      priority: document.getElementById('priorityInput').value,
      dueDate: document.getElementById('dueDateInput').value || dateKey(),
      estimate: document.getElementById('estimateInput').value,
      tags: document.getElementById('tagsInput').value
    });
    document.getElementById('taskForm').reset();
    document.getElementById('priorityInput').value = 'medium';
    document.getElementById('dueDateInput').value = dateKey();
    document.getElementById('clientInput').focus();
  });

  // Tracker
  document.getElementById('trackerYes').addEventListener('click', () => {
    state.tracker[dateKey()] = true; saveState(); updateTrackerUI(); updateSidebar();
    toast('Streak updated! 💪', 'success');
  });
  document.getElementById('trackerNo').addEventListener('click', () => {
    state.tracker[dateKey()] = false; saveState(); updateTrackerUI(); updateSidebar();
    toast('Day marked as off', 'info');
  });

  // Nav
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // Filters
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderTasks();
    });
  });

  // Search / client filter / sort
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value; renderTasks();
  });
  document.getElementById('clientFilter').addEventListener('change', (e) => {
    state.clientFilter = e.target.value; renderTasks();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value; renderTasks();
  });

  // Notes modal
  document.getElementById('saveNote').addEventListener('click', saveNotes);
  document.getElementById('cancelNote').addEventListener('click', closeNotes);
  document.getElementById('notesModal').addEventListener('click', (e) => {
    if (e.target.id === 'notesModal') closeNotes();
  });

  // Subtasks modal
  document.getElementById('addSubtaskBtn').addEventListener('click', addSubtask);
  document.getElementById('newSubtaskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
  });
  document.getElementById('closeSubtasks').addEventListener('click', closeSubtasks);
  document.getElementById('subtasksModal').addEventListener('click', (e) => {
    if (e.target.id === 'subtasksModal') closeSubtasks();
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeNotes(); closeSubtasks(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.getElementById('notesModal').classList.contains('active')) saveNotes();
  });

  // Week goal
  document.getElementById('weekGoalTarget').value = state.weekGoal;
  document.getElementById('weekGoalTarget').addEventListener('change', (e) => {
    state.weekGoal = Math.max(1, parseInt(e.target.value) || 20);
    e.target.value = state.weekGoal;
    saveState(); renderCharts();
  });

  // Export / Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  renderAll();
});
