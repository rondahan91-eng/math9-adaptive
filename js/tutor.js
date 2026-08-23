// ==========================================================================
// tutor.js - המורה הפרטי (Claude) בצד הלקוח
// ==========================================================================
// חשוב להבין את חלוקת התפקידים: המנוע המתמטי כבר קבע בוודאות אם התשובה
// נכונה ואיזו תפיסה מוטעית זוהתה. ה-AI לא מחליט כלום מזה - הוא רק מנסח
// הסבר או רמז סוקרטי בעברית, מותאם לתלמיד. לכן גם אם המודל "מדמיין" משהו,
// הוא לא יכול לקבוע שתשובה שגויה היא נכונה.

import { api } from './api.js';
import { misconception } from './curriculum/misconceptions.js';
import { SKILL_BY_ID } from './curriculum/skills.js';

let status = null; // {available, reason}

export async function tutorAvailable() {
  if (status === null) {
    try { status = await api.tutorStatus(); }
    catch (err) { status = { available: false, reason: err.message }; }
  }
  return status;
}

export function resetTutorStatus() { status = null; }

/**
 * מבקש רמז. stage הוא 'hint' (רמז ראשון, בלי לגלות את הפתרון),
 * 'explain' (הסבר מלא אחרי שהתלמיד ויתר או סיים) או 'why' (למה הטעות הזו).
 */
export async function requestTutor({ exercise, studentAnswer, misconceptionId, stage, attempts, studentName }) {
  const s = await tutorAvailable();
  if (!s.available) return { available: false, reason: s.reason };

  const skill = SKILL_BY_ID[exercise.skillId];
  const mis = misconceptionId ? misconception(misconceptionId) : null;

  try {
    const res = await api.tutorHint({
      stage,
      studentName: studentName || 'התלמיד/ה',
      skillTitle: skill?.title || exercise.skillId,
      rule: exercise.rule || '',
      prompt: exercise.prompt,
      exercise: exercise.exprText,
      correctAnswer: exercise.answerText,
      studentAnswer: String(studentAnswer || '').slice(0, 200),
      misconception: mis ? mis.aiContext : '',
      misconceptionLabel: mis ? mis.label : '',
      attempts: attempts || 1,
    });
    if (!res || res.available === false) return { available: false, reason: res?.reason };
    return { available: true, text: String(res.text || '').trim() };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}
