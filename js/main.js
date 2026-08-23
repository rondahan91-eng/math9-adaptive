// ==========================================================================
// main.js - ניתוב בין המסכים ומצב האפליקציה
// ==========================================================================

import { CONFIG, isDevMode } from './config.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { emptyState, normalizeState } from './learn/mastery.js';
import { renderAuth } from './screens/auth.js';
import { renderHome } from './screens/home.js';
import { renderLesson } from './screens/lesson.js';
import { renderPractice } from './screens/practice.js';
import { renderDashboard } from './screens/dashboard.js';
import { tutorAvailable, resetTutorStatus } from './tutor.js';

const root = document.getElementById('app');
const header = document.getElementById('app-header');
const nav = document.getElementById('nav');

const ctx = {
  user: null,
  state: emptyState(),
  tutor: { available: false, reason: '' },
  navigate,
  save: saveProgress,
  logout,
};

const SCREENS = {
  home: renderHome,
  lesson: renderLesson,
  practice: renderPractice,
  dashboard: renderDashboard,
};

let current = { name: 'home', params: {} };

function navigate(name, params = {}) {
  current = { name, params };
  render();
}

function render() {
  if (!ctx.user) {
    header.hidden = true;
    renderAuth(root, ctx, onLogin);
    return;
  }
  header.hidden = false;
  renderNav();
  const screen = SCREENS[current.name] || renderHome;
  root.innerHTML = '';
  screen(root, ctx, current.params);
}

function renderNav() {
  const isTeacher = ctx.user.role === 'admin';
  const items = isTeacher
    ? [['dashboard', 'מעקב כיתה'], ['home', 'מפת היחידה']]
    : [['home', 'מפת היחידה'], ['practice', 'תרגול']];
  nav.innerHTML = items
    .map(([id, label]) => `<button class="small${current.name === id ? ' primary' : ''}" data-go="${id}">${label}</button>`)
    .join('') + `<button class="small ghost" data-logout>יציאה</button>`;
  nav.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => navigate(b.dataset.go)));
  nav.querySelector('[data-logout]').addEventListener('click', logout);
}

// -------------------------------------------------------------- התחברות
async function onLogin(user) {
  ctx.user = user;
  localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(user));
  await loadProgress();
  resetTutorStatus();
  ctx.tutor = await tutorAvailable();
  navigate(user.role === 'admin' ? 'dashboard' : 'home');
}

function logout() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
  ctx.user = null;
  ctx.state = emptyState();
  render();
}

async function loadProgress() {
  // האחסון המקומי הוא מקור אמת מיידי; השרת מסונכרן ברקע ומנצח אם הוא עדכני
  const localRaw = localStorage.getItem(CONFIG.STATE_KEY + ':' + ctx.user.studentId);
  if (localRaw) {
    try { ctx.state = normalizeState(JSON.parse(localRaw)); } catch { /* מתעלמים */ }
  }
  if (ctx.user.role === 'admin') return;
  try {
    const remote = await api.fetchMyProgress(ctx.user.studentId);
    if (remote) ctx.state = normalizeState(remote);
  } catch (err) {
    if (!isDevMode()) toast('לא הצלחתי לטעון התקדמות מהשרת — עובדים מקומית', 'err');
  }
}

let saveTimer = null;
function saveProgress() {
  if (!ctx.user) return;
  localStorage.setItem(CONFIG.STATE_KEY + ':' + ctx.user.studentId, JSON.stringify(ctx.state));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api.saveProgress(ctx.user.studentId, ctx.state); }
    catch { /* המצב כבר נשמר מקומית - ננסה שוב בשמירה הבאה */ }
  }, 1200);
}

// -------------------------------------------------------------- הפעלה
(async function start() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY));
    if (saved && saved.studentId) {
      ctx.user = saved;
      await loadProgress();
      ctx.tutor = await tutorAvailable();
      current = { name: saved.role === 'admin' ? 'dashboard' : 'home', params: {} };
    }
  } catch { /* אין סשן שמור */ }
  render();
})();
