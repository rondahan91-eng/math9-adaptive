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

export const MASTERY_THRESHOLD = 0.90; // מעל זה - המיומנות נחשבת נשלטת
export const PREREQ_THRESHOLD = 0.70;  // מעל זה - מותר להתקדם למיומנות הבאה
export const MISCONCEPTION_ACTIVE = 0.45;

export function emptyState() {
  const skills = {};
  for (const s of SKILLS) {
    skills[s.id] = { p: BKT.pInit, attempts: 0, correct: 0, streak: 0 };
  }
  return { skills, misconceptions: {}, history: [] };
}

/** מוודא שמצב ישן מהאחסון מכיל את כל המיומנויות (למשל אחרי הוספת נושא). */
export function normalizeState(state) {
  const base = emptyState();
  if (!state || typeof state !== 'object') return base;
  const out = {
    skills: { ...base.skills, ...(state.skills || {}) },
    misconceptions: state.misconceptions || {},
    history: state.history || [],
  };
  for (const id of Object.keys(out.skills)) {
    if (!SKILL_BY_ID[id]) delete out.skills[id];
  }
  return out;
}

/** עדכון בייסיאני של הסתברות השליטה. */
export function updateSkill(skill, correct) {
  const { pSlip, pGuess, pLearn } = BKT;
  const p = skill.p;
  const posterior = correct
    ? (p * (1 - pSlip)) / (p * (1 - pSlip) + (1 - p) * pGuess)
    : (p * pSlip) / (p * pSlip + (1 - p) * (1 - pGuess));
  const next = posterior + (1 - posterior) * pLearn;
  return {
    ...skill,
    p: Math.max(0.01, Math.min(0.99, next)),
    attempts: skill.attempts + 1,
    correct: skill.correct + (correct ? 1 : 0),
    streak: correct ? skill.streak + 1 : 0,
  };
}

export function isMastered(state, skillId) {
  const s = state.skills[skillId];
  return !!s && s.p >= MASTERY_THRESHOLD;
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

/** רמת הקושי בתוך המיומנות נגזרת מרמת השליטה הנוכחית. */
export function levelFor(state, skillId) {
  const p = state.skills[skillId]?.p ?? BKT.pInit;
  if (p < 0.45) return 1;
  if (p < 0.75) return 2;
  return 3;
}

/** אחוז התקדמות כללי ביחידה - לתצוגה בלבד. */
export function overallProgress(state) {
  const values = SKILLS.map(s => Math.min(1, (state.skills[s.id]?.p ?? 0) / MASTERY_THRESHOLD));
  return values.reduce((a, b) => a + b, 0) / SKILLS.length;
}
