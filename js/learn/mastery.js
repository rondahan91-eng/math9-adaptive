// ==========================================================================
// mastery.js - מודל השליטה (BKT) והבחירה מה להגיש הלאה
// ==========================================================================
// Bayesian Knowledge Tracing: לכל מיומנות מוחזק ההסתברות שהתלמיד שולט בה.
// אחרי כל תשובה מעדכנים את ההסתברות לפי בייס, תוך התחשבות ב"החלקה" (ידע
// אבל טעה) וב"ניחוש" (לא יודע אבל צדק). כך תשובה נכונה אחת אחרי שלוש טעויות
// לא קופצת ל-100%, ותשובה שגויה אחת אחרי שליטה לא מאפסת הכל.

import { SKILLS, SKILL_BY_ID, topoOrder } from '../curriculum/skills.js';
import { isStageRevealed } from './reveals.js';

export const BKT = {
  pInit: 0.20,   // הסתברות ראשונית לשליטה
  pLearn: 0.14,  // הסתברות ללמוד את המיומנות בכל הזדמנות
  pSlip: 0.10,   // שולט אבל טעה
  pGuess: 0.15,  // לא שולט אבל צדק
};

export const MASTERY_THRESHOLD = 0.90;   // הסתברות שליטה מינימלית
export const MASTERY_TOP_LEVEL = 5;      // חייבת תשובה נכונה אחת ברמה הגבוהה
export const MASTERY_MIN_ATTEMPTS = 6;   // סולם של 5 רמות + ראיה אחת נוספת
export const PREREQ_THRESHOLD = 0.70;    // מעל זה - מותר להתקדם למיומנות הבאה
export const MISCONCEPTION_ACTIVE = 0.45;

/**
 * ספי ההסתברות לרמות 2..5. הם נמוכים בכוונה: ההסתברות הבייסיאנית רוויה מהר
 * (0.20 → 0.66 → 0.93 → 0.99 אחרי שלוש תשובות נכונות), ולכן היא לבדה אינה
 * יכולה לשמש כשלב-מדרגה. מי שקובע את הקצב בפועל הוא הסולם ב-levelFor:
 * הרמה הבאה נפתחת רק אחרי תשובה נכונה ברמה הנוכחית. הספים כאן רק *מורידים*
 * את הרמה כשההסתברות צונחת אחרי טעויות.
 */
export const LEVEL_BANDS = [0.30, 0.60, 0.85, 0.95];

const emptySkill = () => ({ p: BKT.pInit, attempts: 0, correct: 0, streak: 0, maxCorrectLevel: 0 });

export function emptyState() {
  const skills = {};
  for (const s of SKILLS) skills[s.id] = emptySkill();
  return { skills, misconceptions: {}, history: [], tutorUsage: null };
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
    tutorUsage: state.tutorUsage || null,
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

/**
 * שני תנאים, ושניהם חייבים להתקיים:
 *   1. המורה חשפה את השלב שבו המיומנות נמצאת
 *   2. כל קדם-הדרישות נשלטות מספיק
 * התנאי השני חל גם על קדם-דרישות שנמצאות בשלב אחר - כולל שלב מוסתר. לכן
 * חשיפת שלב שהבסיס שלו מוסתר תשאיר אותו נעול, ומסך התוכן מזהיר על כך.
 */
export function isUnlocked(state, skillId) {
  const skill = SKILL_BY_ID[skillId];
  if (!skill) return false;
  if (!isStageRevealed(skill.stage)) return false;
  return skill.prereqs.every(p => (state.skills[p]?.p ?? 0) >= PREREQ_THRESHOLD);
}

/** כל המיומנויות שהמורה חשפה - בלי קשר לשאלה אם הן נעולות. */
export function visibleSkills() {
  return SKILLS.filter(s => isStageRevealed(s.stage)).map(s => s.id);
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
  if (unlocked.length === 0) {
    // אין מה להגיש: או שהשלב הראשון עדיין נעול, או שהמורה לא חשפה כלום
    const visible = visibleSkills();
    return { skillId: order.find(id => visible.includes(id)) || null, reason: 'start' };
  }

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
 * נציב את הספים. הסולם מבטיח שהתלמיד/ה עולה שלב-שלב: 1 → 2 → 3 → 4 → 5.
 * מי שנכשל/ת ברמה 2 יקבל/תקבל רמה 2 שוב, ולא יקודם/תקודם.
 */
export function levelFor(state, skillId) {
  const s = state.skills[skillId];
  const p = s?.p ?? BKT.pInit;
  let byProbability = 1;
  for (const band of LEVEL_BANDS) if (p >= band) byProbability++;
  const byLadder = (s?.maxCorrectLevel || 0) + 1;
  return Math.max(1, Math.min(byProbability, byLadder, MASTERY_TOP_LEVEL));
}

/**
 * אחוז התקדמות כללי - לתצוגה בלבד. שני כללים:
 *   1. מיומנות שאינה נשלטת לא תורמת יותר מ-0.9, כדי שהמחוון לא יראה 100%
 *      בזמן ששום מיומנות לא נסגרה באמת.
 *   2. מיומנות בלי אף ניסיון תורמת 0 - גם אם p שלה הוא pInit. ה-BKT מתחיל
 *      מהסתברות פריורית שהיא *אמונה* על תלמיד שטרם נצפה, לא ראיה שהוא עשה
 *      משהו. בלי הכלל הזה מי שרק נכנס למערכת רואה "התקדמות 22%", המחוון
 *      לעולם לא מתחיל מאפס, ובלוח המורה כל תלמיד רשום נראה כאילו התחיל.
 *   3. המכנה הוא רק מה שנחשף. אחרת תלמיד/ה שסיים/ה את כל מה שנפתח לו/ה
 *      היה רואה 30%, ו"סיימתי" היה נראה כמו כישלון.
 */
export function overallProgress(state) {
  const visible = visibleSkills();
  if (visible.length === 0) return 0;
  const values = visible.map(id => {
    if (isMastered(state, id)) return 1;
    const skill = state.skills[id];
    if (!skill?.attempts) return 0;
    return Math.min(0.9, skill.p / MASTERY_THRESHOLD);
  });
  return values.reduce((a, b) => a + b, 0) / visible.length;
}
