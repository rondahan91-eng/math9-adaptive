// ==========================================================================
// api.js - שכבת התקשורת מול השרת, עם מצב פיתוח מקומי
// ==========================================================================
// כל הקריאות הן POST יחיד עם {action, payload} - כדי להימנע מ-CORS preflight
// מול Google Apps Script.

import { CONFIG, isDevMode } from './config.js';
import { STAGES, STAGES_REVEALED_BY_DEFAULT } from './curriculum/skills.js';

async function call(action, payload = {}) {
  if (isDevMode()) return devCall(action, payload);
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error(`שגיאת רשת (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאה לא ידועה מהשרת');
  return data.result;
}

// -------------------------------------------------------------- מצב פיתוח
const LS = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const DEV_USERS_KEY = 'math9-dev-users';
const DEV_PROGRESS_KEY = 'math9-dev-progress';
const DEV_REVEALS_KEY = 'math9-dev-reveals';

function devUsers() {
  return LS.read(DEV_USERS_KEY, [
    { studentId: 'admin', username: 'admin', password: 'admin123', role: 'admin', displayName: 'מורה', grade: '' },
    { studentId: 'demo1', username: 'demo', password: 'demo1234', role: 'student', displayName: 'תלמיד/ה לדוגמה', grade: 'ט1' },
  ]);
}

async function devCall(action, payload) {
  await new Promise(r => setTimeout(r, 60)); // מדמה השהיית רשת קטנה
  switch (action) {
    case 'tutorStatus':
      return { available: false, reason: 'מצב פיתוח מקומי - לא מוגדר מפתח API' };

    case 'tutorQuota':
      // אין שרת במצב פיתוח, ולכן אין אכיפה - הלקוח סופר לבד
      return null;

    case 'tutorHint':
      return { available: false, text: '' };

    case 'authenticateUser': {
      const users = devUsers();
      const u = users.find(x =>
        x.username.toLowerCase() === String(payload.username).trim().toLowerCase());
      if (!u || u.password !== payload.password) throw new Error('שם משתמש או סיסמה שגויים');
      const { password, ...safe } = u;
      return safe;
    }

    case 'listStudents':
      return devUsers().filter(u => u.role === 'student')
        .map(({ password, role, ...safe }) => safe);

    case 'importStudents': {
      const users = devUsers();
      const taken = new Set(users.map(u => u.username.toLowerCase()));
      const added = [], skipped = [];
      for (const s of payload.students || []) {
        const username = String(s.username || '').trim();
        if (!username || !s.password) { skipped.push({ username, reason: 'חסר שם משתמש או סיסמה' }); continue; }
        if (taken.has(username.toLowerCase())) { skipped.push({ username, reason: 'כבר קיים במערכת' }); continue; }
        taken.add(username.toLowerCase());
        const student = {
          studentId: 's_' + Math.random().toString(36).slice(2, 10),
          username, password: String(s.password), role: 'student',
          displayName: s.displayName || username, grade: s.grade || '',
        };
        users.push(student);
        added.push({ studentId: student.studentId, username, displayName: student.displayName, grade: student.grade });
      }
      LS.write(DEV_USERS_KEY, users);
      return { added, skipped };
    }

    case 'resetPassword': {
      const users = devUsers();
      const u = users.find(x => x.studentId === payload.studentId && x.role === 'student');
      if (!u) throw new Error('התלמיד/ה לא נמצא/ה');
      if (String(payload.password || '').length < 4) throw new Error('הסיסמה קצרה מדי (לפחות 4 תווים)');
      u.password = String(payload.password);
      LS.write(DEV_USERS_KEY, users);
      return { ok: true };
    }

    case 'createNewStudent': {
      const users = devUsers();
      if (users.some(x => x.username.toLowerCase() === String(payload.username).trim().toLowerCase())) {
        throw new Error('שם המשתמש כבר קיים');
      }
      const student = {
        studentId: 's_' + Math.random().toString(36).slice(2, 10),
        username: String(payload.username).trim(),
        password: payload.password,
        role: 'student',
        displayName: payload.displayName || payload.username,
        grade: payload.grade || '',
      };
      users.push(student);
      LS.write(DEV_USERS_KEY, users);
      const { password, ...safe } = student;
      return safe;
    }

    case 'saveProgress': {
      const all = LS.read(DEV_PROGRESS_KEY, {});
      all[payload.studentId] = { state: payload.state, updatedAt: Date.now() };
      LS.write(DEV_PROGRESS_KEY, all);
      return { ok: true };
    }

    case 'fetchMyProgress': {
      const all = LS.read(DEV_PROGRESS_KEY, {});
      return all[payload.studentId]?.state || null;
    }

    case 'fetchReveals': {
      const saved = LS.read(DEV_REVEALS_KEY, null);
      return STAGES.map(stage => ({
        stage,
        revealed: saved ? saved[stage] === true : STAGES_REVEALED_BY_DEFAULT.includes(stage),
      }));
    }

    case 'setReveal': {
      const saved = LS.read(DEV_REVEALS_KEY, null) || Object.fromEntries(
        STAGES.map(s => [s, STAGES_REVEALED_BY_DEFAULT.includes(s)]));
      saved[payload.stage] = !!payload.revealed;
      LS.write(DEV_REVEALS_KEY, saved);
      return STAGES.map(stage => ({ stage, revealed: saved[stage] === true }));
    }

    case 'fetchClassProgress': {
      const all = LS.read(DEV_PROGRESS_KEY, {});
      return devUsers().filter(u => u.role === 'student').map(u => ({
        studentId: u.studentId,
        displayName: u.displayName,
        grade: u.grade,
        state: all[u.studentId]?.state || null,
        updatedAt: all[u.studentId]?.updatedAt || null,
      }));
    }

    default:
      throw new Error(`פעולה לא מוכרת: ${action}`);
  }
}

// -------------------------------------------------------------- ה-API הציבורי
export const api = {
  authenticateUser: (username, password) => call('authenticateUser', { username, password }),
  createNewStudent: (username, password, displayName, grade, token) =>
    call('createNewStudent', { username, password, displayName, grade, token }),
  importStudents: (students, token) => call('importStudents', { students, token }),
  listStudents: (token) => call('listStudents', { token }),
  resetPassword: (studentId, password, token) => call('resetPassword', { studentId, password, token }),
  saveProgress: (studentId, state) => call('saveProgress', { studentId, state }),
  fetchMyProgress: (studentId) => call('fetchMyProgress', { studentId }),
  fetchClassProgress: () => call('fetchClassProgress', {}),
  fetchReveals: () => call('fetchReveals', {}),
  setReveal: (stage, revealed, token) => call('setReveal', { stage, revealed, token }),
  tutorStatus: () => call('tutorStatus', {}),
  tutorQuota: (studentId) => call('tutorQuota', { studentId }),
  tutorHint: (context) => call('tutorHint', context),
};
