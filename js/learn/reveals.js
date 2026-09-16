// ==========================================================================
// reveals.js - מה המורה פתחה לתלמידים
// ==========================================================================
// זו שכבת השליטה הראשונה מבין שתיים, והן נפרדות בכוונה:
//
//   חשיפה     - החלטה של המורה, ברמת שלב. מה בכלל קיים בעולם של התלמיד/ה.
//   קדם-דרישות - אוטומטי, לפי שליטה. באיזה סדר ללמוד בתוך מה שנחשף.
//
// השנייה אינה ניתנת לעקיפה גם ע"י המורה: היא מגינה על סדר הלמידה. הראשונה
// היא לגמרי בידיה.
//
// הסתרה לעולם אינה מוחקת התקדמות. היא מעלימה שלב מהמפה, וחשיפה מחדש
// מחזירה את המצב במלואו.

import { STAGES, STAGES_REVEALED_BY_DEFAULT, SKILL_BY_ID } from '../curriculum/skills.js';

const CACHE_KEY = 'math9-reveals';

/** null = טרם נטען. אז נופלים לקאש, ורק אם גם הוא ריק - לברירת המחדל. */
let current = null;

function fallback() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (Array.isArray(raw) && raw.length) return new Set(raw);
  } catch { /* קאש פגום - מתעלמים */ }
  return new Set(STAGES_REVEALED_BY_DEFAULT);
}

/**
 * קובע את מצב החשיפה מתשובת השרת.
 * @param {Array<{stage: string, revealed: boolean}>|null} rows
 */
export function setReveals(rows) {
  if (!Array.isArray(rows)) return;
  const open = rows.filter(r => r && r.revealed).map(r => r.stage);
  current = new Set(open);
  // שומרים כדי שתקלת רשת בהתחברות הבאה לא תשנה פתאום מה התלמיד/ה רואה
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(open)); } catch { /* מצב פרטי */ }
}

/** לבדיקות ולניתוק סשן. */
export function resetReveals() {
  current = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* מצב פרטי */ }
}

export function revealedStages() {
  const set = current || fallback();
  // שומרים על סדר הלימוד, לא על סדר התשובה מהשרת
  return STAGES.filter(s => set.has(s));
}

export const isStageRevealed = (stage) => revealedStages().includes(stage);

export const isSkillRevealed = (skillId) => {
  const skill = SKILL_BY_ID[skillId];
  return !!skill && isStageRevealed(skill.stage);
};

/** האם מצב החשיפה הגיע מהשרת, או שאנחנו על ברירת מחדל. */
export const revealsLoaded = () => current !== null;
