/* ============================================================
   TASKFLOW PRO — CORE LOGIC
   ============================================================ */

const STORAGE_KEY = 'taskflow_pro_v1';

let state = {
  tasks: [],
  tracker: {},      // { 'YYYY-MM-DD': true/false }
  filter: 'today',
  view: 'today'
};

let editingNoteId = null;
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

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Persistence ---------- */
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    tracker: state.tracker
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.tasks = parsed.tasks || [];
      state.tracker = parsed.tracker || {};
    }
  } catch (e) {
    console.warn('Load failed', e);
  }
}

/* ---------- Carry Over Logic ---------- */
function processCarryOver() {
  const today = dateKey();
  let carried = 0;
  state.tasks.forEach(task => {
    if (task.status === 'pending' && task.dueDate && task.dueDate < today) {
      task.carriedOver = true;
      task.dueDate = today;
      carried++;
    }
  });
  if (carried > 0) {
    saveState();
    setTimeout(() => toast(`${carried} task${carried > 1 ? 's' : ''} carried over — finish these first!`, 'info'), 500);
  }
}

/* ---------- Tracker ---------- */
function getStreak() {
  let streak = 0;
  let d = new Date();
  if (state.tracker[dateKey(d)] !== true) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    if (state.tracker[dateKey(d)] === true) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function updateTrackerUI() {
  const today = dateKey();
  const val = state.tracker[today];
  document.getElementById('trackerYes').classList.toggle('active', val === true);
  document.getElementById('trackerNo').classList.toggle('active', val === false);
}

/* ---------- Stats ---------- */
function updateSidebar() {
  document.getElementById('streakNum').textContent = getStreak();
  const done = state.tasks.filter(t => t.status === 'done');
  document.getElementById('totalDone').textContent = done.length;
  const totalSec = done.reduce((s, t) => s + (t.timeSpent || 0), 0);
  document.getElementById('totalTime').textContent = fmtDuration(totalSec);
}

function updateTodayStats() {
  const today = dateKey();
  const todays = state.tasks.filter(t => t.dueDate === today);
  const done = todays.filter(t => t.status === 'done').length;
  const pending = todays.length - done;
  const time = todays.reduce((s, t) => {
    let sec = t.timeSpent || 0;
    if (t.timerRunning && t.timerStartedAt) sec += Math.floor((Date.now() - t.timerStartedAt) / 1000);
    return s + sec;
  }, 0);

  document.getElementById('statTotal').textContent = todays.length;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statTime').textContent = fmtDuration(time);
}

/* ---------- Task Rendering ---------- */
function renderTasks() {
  const container = document.getElementById('taskList');
  const today = dateKey();
  let tasks = [...state.tasks];

  // Apply filter
  if (state.filter === 'today') tasks = tasks.filter(t => t.dueDate === today);
  else if (state.filter === 'pending') tasks = tasks.filter(t => t.status === 'pending');
  else if (state.filter === 'done') tasks = tasks.filter(t => t.status === 'done');

  // Sort: carried over first → pending before done → priority → newest
  const pOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    if (a.carriedOver !== b.carriedOver) return b.carriedOver - a.carriedOver;
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    return b.createdAt - a.createdAt;
  });

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">${state.filter === 'done' ? '🏆' : '✨'}</div>
        <h3>${state.filter === 'done' ? 'No completed tasks yet' : 'All clear!'}</h3>
        <p>${state.filter === 'done' ? 'Complete a task to see it here.' : 'Add your first task above to get started.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = tasks.map((t, i) => {
    let displaySec = t.timeSpent || 0;
    if (t.timerRunning && t.timerStartedAt) {
      displaySec += Math.floor((Date.now() - t.timerStartedAt) / 1000);
    }

    const estHtml = t.estimate ? `<span class="dot"></span><span>Est: ${t.estimate}h</span>` : '';
    const carryHtml = t.carriedOver ? `<span class="carry-badge">↻ Carried Over</span>` : '';
    const notesIndicator = t.notes ? `<span class="dot"></span><span title="Has notes">📝 Notes</span>` : '';

    return `
      <div class="task-card priority-${t.priority} ${t.status === 'done' ? 'done' : ''}" style="animation-delay:${i * 35}ms">
        <div class="task-priority-bar"></div>
        <div class="task-main">
          <div class="task-top">
            <span class="client-badge">${escapeHtml(t.client)}</span>
            <span class="priority-badge ${t.priority}">${t.priority}</span>
            ${carryHtml}
          </div>
          <h3 class="task-title">${escapeHtml(t.title)}</h3>
          <div class="task-meta">
            <span class="timer ${t.timerRunning ? 'running' : ''}" data-timer-id="${t.id}">
              ${t.timerRunning ? '⏱ ' : ''}${fmtDuration(displaySec)}
            </span>
            ${estHtml}
            ${notesIndicator}
            ${t.status === 'done' ? '<span class="dot"></span><span style="color:var(--success)">✓ Completed</span>' : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" onclick="openNotes('${t.id}')" title="Notes">📝</button>
          ${t.status !== 'done' ? `
            <button class="icon-btn timer-btn ${t.timerRunning ? 'running' : ''}" onclick="toggleTimer('${t.id}')" title="${t.timerRunning ? 'Pause' : 'Start timer'}">
              ${t.timerRunning ? '⏸' : '▶'}
            </button>
            <button class="icon-btn done-btn" onclick="completeTask('${t.id}')" title="Mark done">✓</button>
          ` : ''}
          <button class="icon-btn delete-btn" onclick="deleteTask('${t.id}')" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ---------- Task Actions ---------- */
function addTask(client, title, priority, estimate) {
  const task = {
    id: uid(),
    client: client.trim(),
    title: title.trim(),
    priority,
    estimate: estimate ? parseFloat(estimate) : null,
    notes: '',
    status: 'pending',
    createdAt: Date.now(),
    dueDate: dateKey(),
    carriedOver: false,
    timeSpent: 0,
    timerRunning: false,
    timerStartedAt: null,
    completedAt: null
  };
  state.tasks.push(task);
  saveState();
  renderAll();
  toast('Task added successfully!', 'success');
}

function toggleTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  if (task.timerRunning) {
    task.timeSpent += Math.floor((Date.now() - task.timerStartedAt) / 1000);
    task.timerRunning = false;
    task.timerStartedAt = null;
  } else {
    // Pause any other running timer
    state.tasks.forEach(t => {
      if (t.timerRunning && t.id !== id) {
        t.timeSpent += Math.floor((Date.now() - t.timerStartedAt) / 1000);
        t.timerRunning = false;
        t.timerStartedAt = null;
      }
    });
    task.timerRunning = true;
    task.timerStartedAt = Date.now();
  }
  saveState();
  renderAll();
}

function completeTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  if (task.timerRunning) {
    task.timeSpent += Math.floor((Date.now() - task.timerStartedAt) / 1000);
    task.timerRunning = false;
    task.timerStartedAt = null;
  }
  task.status = 'done';
  task.completedAt = Date.now();
  saveState();
  renderAll();
  toast(`Task completed in ${fmtDuration(task.timeSpent)}!`, 'success');
}

function deleteTask(id) {
  if (!confirm('Delete this task permanently?')) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderAll();
  toast('Task deleted', 'info');
}

/* ---------- Notes ---------- */
function openNotes(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  editingNoteId = id;
  document.getElementById('noteTaskTitle').textContent = task.title;
  document.getElementById('noteText').value = task.notes || '';
  document.getElementById('notesModal').classList.add('active');
}

function closeNotes() {
  document.getElementById('notesModal').classList.remove('active');
  editingNoteId = null;
}

function saveNotes() {
  if (!editingNoteId) return;
  const task = state.tasks.find(t => t.id === editingNoteId);
  if (task) {
    task.notes = document.getElementById('noteText').value;
    saveState();
    toast('Notes saved', 'success');
    renderTasks();
  }
  closeNotes();
}

/* ---------- Charts ---------- */
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function renderCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });

  const gridColor = 'rgba(255,255,255,0.06)';
  const tickColor = '#8892a6';
  const font = { family: 'Inter', size: 11, weight: '600' };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: tickColor, font, boxWidth: 12, padding: 12 } },
      tooltip: {
        backgroundColor: '#121a2e',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#c7cde0',
        titleFont: { family: 'Inter', weight: '700' },
        bodyFont: { family: 'Inter' },
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font }, beginAtZero: true }
    }
  };

  /* ---- Weekly Chart ---- */
  const week = getLast7Days();
  const weekData = week.map(d => {
    const key = dateKey(d);
    return state.tasks.filter(t => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === key).length;
  });
  const weekLabels = week.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));

  const ctx1 = document.getElementById('weeklyChart');
  if (ctx1) {
    charts.weekly = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: weekLabels,
        datasets: [{
          label: 'Tasks Completed',
          data: weekData,
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return '#6366f1';
            const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            g.addColorStop(0, 'rgba(99,102,241,0.15)');
            g.addColorStop(1, 'rgba(139,92,246,0.9)');
            return g;
          },
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(139,92,246,1)'
        }]
      },
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  /* ---- Priority Distribution ---- */
  const priorityCounts = { high: 0, medium: 0, low: 0 };
  state.tasks.filter(t => t.status === 'done').forEach(t => priorityCounts[t.priority]++);
  const totalPriority = priorityCounts.high + priorityCounts.medium + priorityCounts.low;

  const ctx2 = document.getElementById('priorityChart');
  if (ctx2) {
    charts.priority = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: totalPriority === 0 ? ['No data'] : ['High', 'Medium', 'Low'],
        datasets: [{
          data: totalPriority === 0 ? [1] : [priorityCounts.high, priorityCounts.medium, priorityCounts.low],
          backgroundColor: totalPriority === 0 ? ['#1e2842'] : ['#ef4444', '#f59e0b', '#22c55e'],
          borderColor: '#0d1220',
          borderWidth: 3,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tickColor, font, boxWidth: 12, padding: 14 } },
          tooltip: baseOptions.plugins.tooltip
        }
      }
    });
  }

  /* ---- Monthly Trend (line) ---- */
  const month = getLast30Days();
  const monthData = month.map(d => {
    const key = dateKey(d);
    return state.tasks.filter(t => t.status === 'done' && t.completedAt && dateKey(new Date(t.completedAt)) === key).length;
  });
  const monthLabels = month.map((d, i) => {
    if (i % 5 === 0 || i === month.length - 1) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return '';
  });

  const ctx3 = document.getElementById('monthlyChart');
  if (ctx3) {
    charts.monthly = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Tasks Completed',
          data: monthData,
          borderColor: '#8b5cf6',
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(139,92,246,0.15)';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(139,92,246,0.35)');
            g.addColorStop(1, 'rgba(139,92,246,0)');
            return g;
          },
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#0d1220',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  /* ---- Time Spent (last 7 days) ---- */
  const timeData = week.map(d => {
    const key = dateKey(d);
    const sec = state.tasks
      .filter(t => t.completedAt && dateKey(new Date(t.completedAt)) === key)
      .reduce((s, t) => s + (t.timeSpent || 0), 0);
    return Math.round((sec / 3600) * 10) / 10;
  });

  const ctx4 = document.getElementById('timeChart');
  if (ctx4) {
    charts.time = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: weekLabels,
        datasets: [{
          label: 'Hours',
          data: timeData,
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return '#06b6d4';
            const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            g.addColorStop(0, 'rgba(6,182,212,0.15)');
            g.addColorStop(1, 'rgba(6,182,212,0.9)');
            return g;
          },
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(6,182,212,1)'
        }]
      },
      options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }
    });
  }

  /* ---- Summary numbers ---- */
  const weekDoneCount = weekData.reduce((a, b) => a + b, 0);
  const monthDoneCount = monthData.reduce((a, b) => a + b, 0);
  const allDone = state.tasks.filter(t => t.status === 'done');
  const avgSec = allDone.length > 0 ? allDone.reduce((s, t) => s + (t.timeSpent || 0), 0) / allDone.length : 0;
  const allTasks = state.tasks.length;
  const completionRate = allTasks > 0 ? Math.round((allDone.length / allTasks) * 100) : 0;

  document.getElementById('weekDone').textContent = weekDoneCount;
  document.getElementById('monthDone').textContent = monthDoneCount;
  document.getElementById('avgTime').textContent = fmtDuration(Math.round(avgSec));
  document.getElementById('completionRate').textContent = completionRate + '%';
}

/* ---------- View switching ---------- */
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  if (view === 'analytics') {
    setTimeout(renderCharts, 60);
  }
}

/* ---------- Master Render ---------- */
function renderAll() {
  renderTasks();
  updateTodayStats();
  updateSidebar();
  updateTrackerUI();
  if (state.view === 'analytics') renderCharts();
}

/* ---------- Live timer updates ---------- */
setInterval(() => {
  document.querySelectorAll('[data-timer-id]').forEach(el => {
    const task = state.tasks.find(t => t.id === el.dataset.timerId);
    if (task && task.timerRunning && task.timerStartedAt) {
      const sec = task.timeSpent + Math.floor((Date.now() - task.timerStartedAt) / 1000);
      el.textContent = `⏱ ${fmtDuration(sec)}`;
    }
  });
  if (state.view === 'today') updateTodayStats();
}, 1000);

/* ---------- Event Listeners ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  processCarryOver();

  // Date display
  document.getElementById('dateDisplay').textContent = fmtDate(new Date());

  // Task form
  document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const client = document.getElementById('clientInput').value;
    const title = document.getElementById('titleInput').value;
    const priority = document.getElementById('priorityInput').value;
    const estimate = document.getElementById('estimateInput').value;
    if (!client.trim() || !title.trim()) return;
    addTask(client, title, priority, estimate);
    document.getElementById('taskForm').reset();
    document.getElementById('priorityInput').value = 'medium';
    document.getElementById('clientInput').focus();
  });

  // Tracker buttons
  document.getElementById('trackerYes').addEventListener('click', () => {
    state.tracker[dateKey()] = true;
    saveState();
    updateTrackerUI();
    updateSidebar();
    toast('Great! Day marked as worked 💪', 'success');
  });
  document.getElementById('trackerNo').addEventListener('click', () => {
    state.tracker[dateKey()] = false;
    saveState();
    updateTrackerUI();
    updateSidebar();
    toast('Day marked as off. Rest well!', 'info');
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderTasks();
    });
  });

  // Notes modal
  document.getElementById('saveNote').addEventListener('click', saveNotes);
  document.getElementById('cancelNote').addEventListener('click', closeNotes);
  document.getElementById('notesModal').addEventListener('click', (e) => {
    if (e.target.id === 'notesModal') closeNotes();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNotes();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.getElementById('notesModal').classList.contains('active')) {
      saveNotes();
    }
  });

  renderAll();
});
