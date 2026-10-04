// ==========================================================================
// main.js - ניתוב בין המסכים ומצב האפליקציה
// ==========================================================================

import { CONFIG, isDevMode } from './config.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { emptyState, normalizeState } from './learn/mastery.js';
import { mergeStates } from './learn/merge.js';
import { renderAuth } from './screens/auth.js';
import { renderHome } from './screens/home.js';
import { renderLesson } from './screens/lesson.js';
import { renderPractice } from './screens/practice.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderContent } from './screens/content.js';
import { renderStudents } from './screens/students.js';
import { tutorAvailable, resetTutorStatus, loadQuota } from './tutor.js';
import { setReveals, resetReveals } from './learn/reveals.js';

const root = document.getElementById('app');
const header = document.getElementById('app-header');
const nav = document.getElementById('nav');

const ctx = {
  user: null,
  state: emptyState(),
  synced: false,   // האם ידוע לנו מה יש בשרת. בלי זה אסור לשלוח אליו
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
  content: renderContent,
  students: renderStudents,
};

let current = { name: 'home', params: {} };

function navigate(name, params = {}) {
  current = { name, params };
  render();
  retrySync();
}

/**
 * כשאין חיבור, מנסים שוב ברקע: במעבר בין מסכים (לכל היותר פעם בחצי דקה)
 * וברגע שהדפדפן מדווח שהרשת חזרה. כך תלמיד/ה שהתחיל/ה לעבוד בלי רשת
 * מתחבר/ת חזרה בלי לעשות כלום, והעבודה שבתור נשלחת.
 */
let lastRetry = 0;
async function retrySync() {
  if (!ctx.user || ctx.synced || Date.now() - lastRetry < 30000) return;
  lastRetry = Date.now();
  await loadProgress();
  if (ctx.synced) { render(); toast('החיבור חזר. ההתקדמות נשמרה', 'ok'); }
}
window.addEventListener('online', () => { lastRetry = 0; retrySync(); });

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
    ? [['dashboard', 'מעקב כיתה'], ['students', 'תלמידים'], ['content', 'תוכן וחשיפה'], ['home', 'מפת היחידה']]
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
  await loadReveals();
  await loadProgress();
  resetTutorStatus();
  ctx.tutor = await tutorAvailable();
  if (ctx.tutor.available && user.role !== 'admin') await loadQuota(user.studentId);
  navigate(user.role === 'admin' ? 'dashboard' : 'home');
}

function logout() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
  ctx.user = null;
  ctx.state = emptyState();
  ctx.synced = false;
  resetReveals();
  render();
}

/**
 * מצב החשיפה נטען לפני ההתקדמות, כי הוא קובע מה בכלל נספר. כישלון רשת אינו
 * מרוקן את המפה: reveals.js נופל לקאש המקומי, ורק אם גם הוא ריק - לברירת
 * המחדל. עדיף שתלמיד/ה יראה/תראה רגע תוכן ישן מאשר מסך ריק בלי הסבר.
 */
async function loadReveals() {
  try {
    setReveals(await api.fetchReveals());
  } catch (err) {
    // שרת שעדיין לא עודכן אינו תקלה שצריך להטריד בה תלמיד/ה - הוא פשוט
    // לא מכיר את הפעולה, והלקוח ממשיך עם ברירת המחדל. כל שגיאה אחרת כן
    // ראויה להודעה, כי היא עלולה להסתיר תוכן שהמורה פתחה.
    const oldBackend = /פעולה לא מוכרת/.test(err?.message || '');
    if (!isDevMode() && !oldBackend) {
      toast('לא הצלחתי לבדוק מה פתוח — מציג את מה שהיה', 'err');
    }
  }
}

/**
 * ההתקדמות חייבת לשרוד שנה שלמה, ולכן יש כאן שלוש הגנות:
 *
 *  1. מה שנמצא בדפדפן ומה שנמצא בשרת *ממוזגים*, ולא דורסים זה את זה.
 *  2. אם הטעינה מהשרת נכשלה - לא שולחים לשרת כלום. בלי זה, תקלת רשת
 *     בהתחברות הייתה גורמת לתרגיל הראשון לדרוס שנה של עבודה.
 *  3. שמירה שנכשלה נשמרת בתור ונשלחת שוב בהזדמנות הבאה.
 */
const localKey = () => CONFIG.STATE_KEY + ':' + ctx.user.studentId;
const pendingKey = () => CONFIG.STATE_KEY + ':pending:' + ctx.user.studentId;

function readLocalState() {
  try {
    const raw = localStorage.getItem(localKey());
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}

async function loadProgress() {
  const local = readLocalState();
  if (local) ctx.state = local;
  if (ctx.user.role === 'admin') { ctx.synced = true; return; }

  try {
    const remote = await api.fetchMyProgress(ctx.user.studentId);
    // "אין רשומה" הוא מצב תקין של תלמיד/ה חדש/ה, ולא כישלון
    ctx.state = remote ? normalizeState(mergeStates(local, normalizeState(remote))) : (local || emptyState());
    ctx.synced = true;
    await flushPending();
  } catch {
    ctx.synced = isDevMode();
    if (!isDevMode()) {
      toast('אין חיבור לשרת. העבודה נשמרת במכשיר הזה בלבד', 'err');
    }
  }
}

/** שמירה שלא הגיעה לשרת ממתינה כאן עד שהחיבור חוזר. */
async function flushPending() {
  const raw = localStorage.getItem(pendingKey());
  if (!raw) return;
  try {
    const queued = JSON.parse(raw);
    // השרת ממזג, ולכן שליחה של מצב ישן אינה יכולה למחוק עבודה חדשה יותר
    await api.saveProgress(ctx.user.studentId, queued);
    localStorage.removeItem(pendingKey());
  } catch { /* עדיין אין חיבור - נשאר בתור */ }
}

let saveTimer = null;
function saveProgress() {
  if (!ctx.user) return;
  try { localStorage.setItem(localKey(), JSON.stringify(ctx.state)); } catch { /* אחסון מלא */ }
  if (!ctx.synced) {
    // טרם ידוע מה יש בשרת: שומרים בתור ולא שולחים, כדי לא לדרוס
    try { localStorage.setItem(pendingKey(), JSON.stringify(ctx.state)); } catch { /* אחסון מלא */ }
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const snapshot = JSON.stringify(ctx.state);
    try {
      await api.saveProgress(ctx.user.studentId, JSON.parse(snapshot));
      localStorage.removeItem(pendingKey());
    } catch {
      try { localStorage.setItem(pendingKey(), snapshot); } catch { /* אחסון מלא */ }
    }
  }, 1200);
}

// -------------------------------------------------------------- הפעלה
(async function start() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY));
    if (saved && saved.studentId) {
      ctx.user = saved;
      await loadReveals();
      await loadProgress();
      ctx.tutor = await tutorAvailable();
      if (ctx.tutor.available && saved.role !== 'admin') await loadQuota(saved.studentId);
      current = { name: saved.role === 'admin' ? 'dashboard' : 'home', params: {} };
    }
  } catch { /* אין סשן שמור */ }
  render();
})();
