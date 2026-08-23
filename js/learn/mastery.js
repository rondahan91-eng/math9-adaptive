// ==========================================================================
// mastery.js - מודל השליטה (BKT) והבחירה מה להגיש הלאה
// ==========================================================================
// Bayesian Knowledge Tracing: לכל מיומנות מוחזק ההסתברות שהתלמיד שולט בה.
// אחרי כל תשובה מעדכנים את ההסתברות לפי בייס, תוך התחשבות ב"החלקה" (ידע
// אבל טעה) וב"ניחוש" (לא יודע אבל צדק). כך תשובה נכונה אחת אחרי שלוש טעויות
// לא קופצת ל-100%, ותשובה שגויה אחת אחרי שליטה לא מאפסת הכל.

import { SKILLS, SKILL_BY_ID, topoOrder } from '../curriculum/skills.js';

export const BKT = {
  pInit: 0.20,   // הסתברות ראשונית לשליטה
  pLearn: 0.14,  // הסתברות ללמוד את המיומנות בכל הזדמנות
  pSlip: 0.10,   // שולט אבל טעה
  pGuess: 0.15,  // לא שולט אבל צדק
};

export const MASTERY_THRESHOLD = 0.90;   // הסתברות שליטה מינימלית
export const MASTERY_MIN_ATTEMPTS = 4;   // מינימום ניסיונות - שתי תשובות אינן ראיה
export const MASTERY_TOP_LEVEL = 3;      // חייבת תשובה נכונה אחת ברמה הגבוהה
export const PREREQ_THRESHOLD = 0.70;    // מעל זה - מותר להתקדם למיומנות הבאה
export const MISCONCEPTION_ACTIVE = 0.45;

// ספי הרמות. נמוכים מספיק כדי שרמה 3 תוגש *לפני* שהשליטה נסגרת:
// עם ספים גבוהים יותר ההסתברות קופצת מ-0.66 ל-0.93 ומדלגת על כל תחום
// רמה 3, כך שהתלמיד/ה מסומן/ת כשולט/ת בלי שפתר/ה אף תרגיל קשה.
export const LEVEL_2_AT = 0.30;
export const LEVEL_3_AT = 0.60;

const emptySkill = () => ({ p: BKT.pInit, attempts: 0, correct: 0, streak: 0, maxCorrectLevel: 0 });

export function emptyState() {
  const skills = {};
  for (const s of SKILLS) skills[s.id] = emptySkill();
  return { skills, misconceptions: {}, history: [] };
}

/**
 * מוודא שמצב ישן מהאחסון תואם למבנה הנוכחי. המיזוג הוא *לכל מיומנות בנפרד*
 * ולא ברמת האובייקט: מצב שנשמר לפני שהוסף שדה חדש חייב לקבל את ערך ברירת
 * המחדל שלו, אחרת הוא יהיה undefined והשוואות מספריות עליו ייכשלו בשקט.
 */
export function normalizeState(state) {
  const base = emptyState();
  if (!state || typeof state !== 'object') return base;
  const skills = {};
  for (const id of Object.keys(base.skills)) {
    skills[id] = { ...base.skills[id], ...(state.skills?.[id] || {}) };
  }
  return {
    skills,
    misconceptions: state.misconceptions || {},
    history: state.history || [],
  };
}

/** עדכון בייסיאני של הסתברות השליטה. level נדרש כדי לתעד ראיה ברמה גבוהה. */
export function updateSkill(skill, correct, level = 1) {
  const { pSlip, pGuess, pLearn } = BKT;
  const p = skill.p;
  const posterior = correct
    ? (p * (1 - pSlip)) / (p * (1 - pSlip) + (1 - p) * pGuess)
    : (p * pSlip) / (p * pSlip + (1 - p) * (1 - pGuess));
  const next = posterior + (1 - posterior) * pLearn;
  const prevTop = skill.maxCorrectLevel || 0;
  return {
    ...skill,
    p: Math.max(0.01, Math.min(0.99, next)),
    attempts: skill.attempts + 1,
    correct: skill.correct + (correct ? 1 : 0),
    streak: correct ? skill.streak + 1 : 0,
    maxCorrectLevel: correct ? Math.max(prevTop, level) : prevTop,
  };
}

/**
 * שליטה דורשת שלושה תנאים, לא אחד:
 *   1. הסתברות גבוהה
 *   2. מספיק ניסיונות - שתי תשובות נכונות אינן ראיה, גם אם בייס מסכים
 *   3. תשובה נכונה אחת לפחות ברמה הקשה - אחרת "נשלט" יכול להיקבע
 *      על סמך תרגילים קלים בלבד
 */
export function isMastered(state, skillId) {
  const s = state.skills[skillId];
  if (!s) return false;
  return s.p >= MASTERY_THRESHOLD
    && s.attempts >= MASTERY_MIN_ATTEMPTS
    && (s.maxCorrectLevel || 0) >= MASTERY_TOP_LEVEL;
}

export function isUnlocked(state, skillId) {
  const skill = SKILL_BY_ID[skillId];
  if (!skill) return false;
  return skill.prereqs.every(p => (state.skills[p]?.p ?? 0) >= PREREQ_THRESHOLD);
}

export function unlockedSkills(state) {
  return SKILLS.filter(s => isUnlocked(state, s.id)).map(s => s.id);
}

/** התפיסות המוטעות הפעילות כרגע, מהחזקה לחלשה. */
export function activeMisconceptions(state) {
  return Object.entries(state.misconceptions)
    .filter(([, m]) => m.strength >= MISCONCEPTION_ACTIVE)
    .sort((a, b) => b[1].strength - a[1].strength)
    .map(([id, m]) => ({ id, ...m }));
}

export function recordMisconception(state, id, skillId) {
  const prev = state.misconceptions[id] || { strength: 0, seen: 0, skillId };
  state.misconceptions[id] = {
    ...prev,
    skillId,
    strength: Math.min(1, prev.strength + 0.55),
    seen: prev.seen + 1,
    lastAt: Date.now(),
  };
}

/** תשובה נכונה מחלישה את התפיסות המוטעות שקשורות לאותה מיומנות. */
export function decayMisconceptions(state, skillId) {
  for (const [id, m] of Object.entries(state.misconceptions)) {
    if (m.skillId !== skillId) continue;
    const strength = m.strength * 0.5;
    if (strength < 0.08) delete state.misconceptions[id];
    else state.misconceptions[id] = { ...m, strength };
  }
}

const order = topoOrder();

/**
 * בוחר את המיומנות הבאה. הסדר:
 *   1. תיקון תפיסה מוטעית פעילה (אם המיומנות שלה פתוחה)
 *   2. המיומנות הפתוחה שהכי קרובה לשליטה מלאה - זה אזור ההתפתחות הקרובה
 *   3. אם הכל נשלט - חזרה על החלשה ביותר
 */
export function selectNextSkill(state) {
  const unlocked = unlockedSkills(state);
  if (unlocked.length === 0) return { skillId: order[0], reason: 'start' };

  const active = activeMisconceptions(state);
  for (const m of active) {
    if (m.skillId && unlocked.includes(m.skillId)) {
      return { skillId: m.skillId, reason: 'remediation', misconceptionId: m.id };
    }
  }

  const pending = unlocked.filter(id => !isMastered(state, id));
  if (pending.length > 0) {
    pending.sort((a, b) => {
      const diff = state.skills[b].p - state.skills[a].p;
      if (Math.abs(diff) > 1e-9) return diff;
      return order.indexOf(a) - order.indexOf(b);
    });
    return { skillId: pending[0], reason: 'progress' };
  }

  const all = [...unlocked].sort((a, b) => state.skills[a].p - state.skills[b].p);
  return { skillId: all[0], reason: 'review' };
}

/**
 * רמת הקושי בתוך המיומנות - שני אילוצים יחד:
 *
 *   1. תקרה לפי ההסתברות (p)
 *   2. **סולם**: לא מציעים יותר מרמה אחת מעל מה שכבר נפתר נכון
 *
 * האילוץ השני הוא ההכרחי. קפיצת ה-BKT אחרי תשובה נכונה אחת היא מ-0.20
 * ל-0.66, ולכן גזירה מ-p בלבד *תמיד* מדלגת על רמה שלמה - לא משנה איפה
 * נציב את הספים. הסולם מבטיח שהתלמיד/ה עולה שלב-שלב: 1 → 2 → 3.
 * מי שנכשל/ת ברמה 2 יקבל/תקבל רמה 2 שוב, ולא יקודם/תקודם.
 */
export function levelFor(state, skillId) {
  const s = state.skills[skillId];
  const p = s?.p ?? BKT.pInit;
  const byProbability = p < LEVEL_2_AT ? 1 : p < LEVEL_3_AT ? 2 : 3;
  const byLadder = (s?.maxCorrectLevel || 0) + 1;
  return Math.max(1, Math.min(byProbability, byLadder, MASTERY_TOP_LEVEL));
}

/**
 * אחוז התקדמות כללי - לתצוגה בלבד. מיומנות שאינה נשלטת לא תורמת יותר מ-0.9,
 * כדי שהמחוון לא יראה 100% בזמן ששום מיומנות לא נסגרה באמת.
 */
export function overallProgress(state) {
  const values = SKILLS.map(s => (
    isMastered(state, s.id)
      ? 1
      : Math.min(0.9, (state.skills[s.id]?.p ?? 0) / MASTERY_THRESHOLD)
  ));
  return values.reduce((a, b) => a + b, 0) / SKILLS.length;
}
