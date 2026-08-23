// ==========================================================================
// tutor.js - המורה הפרטי (Claude) בצד הלקוח
// ==========================================================================
// חלוקת התפקידים לא משתנה גם בשיחה: המנוע המתמטי כבר קבע בוודאות אם התשובה
// נכונה ואיזו תפיסה מוטעית זוהתה. ה-AI רק מנסח.
//
// ההבדל בשיחה: כאן המודל *כן* יכול לכתוב ביטוי שלא חישבנו מראש. לכן כל שוויון
// שהוא כותב עובר דרך verify.js לפני שהוא מוצג, ואם הוא נכשל - בקשה חוזרת אחת
// עם התיקון מהמנוע. שוויון שגוי לא מגיע למסך.

import { api } from './api.js';
import { misconception } from './curriculum/misconceptions.js';
import { SKILL_BY_ID } from './curriculum/skills.js';
import { renderVerified, failureNote } from './math/verify.js';

let status = null; // {available, reason}

export async function tutorAvailable() {
  if (status === null) {
    try { status = await api.tutorStatus(); }
    catch (err) { status = { available: false, reason: err.message }; }
  }
  return status;
}

export function resetTutorStatus() { status = null; }

/** בונה את שדות ההקשר שנשלחים לשרת. */
function buildContext({ exercise, skillId, studentAnswer, misconceptionId, attempts, studentName, settled }) {
  const skill = SKILL_BY_ID[skillId || exercise?.skillId];
  const mis = misconceptionId ? misconception(misconceptionId) : null;
  return {
    studentName: studentName || 'התלמיד/ה',
    skillTitle: skill?.title || '',
    rule: exercise?.rule || '',
    prompt: exercise?.prompt || '',
    exercise: exercise?.exprText || '',
    correctAnswer: exercise?.answerText || '',
    studentAnswer: String(studentAnswer || '').slice(0, 200),
    misconception: mis ? mis.aiContext : '',
    misconceptionLabel: mis ? mis.label : '',
    attempts: attempts || 0,
    solutionRevealed: !!settled,
  };
}

/**
 * קריאה אחת לשרת, כולל אימות ובקשה חוזרת אחת אם נדרש.
 * @returns {{available: boolean, html?: string, text?: string, reason?: string}}
 */
async function callTutor(payload) {
  const s = await tutorAvailable();
  if (!s.available) return { available: false, reason: s.reason };

  let res;
  try { res = await api.tutorHint(payload); }
  catch (err) { return { available: false, reason: err.message }; }
  if (!res || res.available === false) return { available: false, reason: res?.reason };

  let text = String(res.text || '').trim();
  let checked = renderVerified(text);

  if (checked.failures.length) {
    // בקשה חוזרת אחת בלבד, עם מה שהמנוע מצא
    const retryTurns = [
      ...(payload.turns || []),
      { role: 'assistant', content: text },
      { role: 'user', content: failureNote(checked.failures) },
    ];
    try {
      const retry = await api.tutorHint({ ...payload, turns: retryTurns });
      if (retry && retry.available !== false) {
        text = String(retry.text || '').trim();
        checked = renderVerified(text);
      }
    } catch { /* נשארים עם הכישלון הראשון */ }
  }

  if (checked.failures.length) {
    return {
      available: false,
      reason: 'המורה הפרטי לא הצליח לענות על השאלה הזו במדויק. נסו שאלה אחרת או קראו את ההסבר בשיעור.',
    };
  }

  return { available: true, html: checked.html, text };
}

/**
 * רמז חד-פעמי (הכפתור הישן). stage הוא 'hint' / 'why' / 'explain'.
 */
export async function requestTutor({ exercise, studentAnswer, misconceptionId, stage, attempts, studentName }) {
  return callTutor({
    stage: stage || 'hint',
    ...buildContext({ exercise, studentAnswer, misconceptionId, attempts, studentName }),
  });
}

/**
 * סבב שיחה. thread.turns כבר מכיל את השאלה החדשה.
 */
export async function askTutor({ exercise, thread, studentAnswer, misconceptionId, attempts, studentName, settled, contextKind }) {
  return callTutor({
    stage: 'chat',
    contextKind: contextKind || 'practice',
    ...buildContext({ exercise, studentAnswer, misconceptionId, attempts, studentName, settled }),
    turns: thread.turns,
  });
}

/** שיחה בעמוד השיעור - אין תרגיל, יש מיומנות. */
export async function askAboutLesson({ skillId, rule, thread, studentName }) {
  return callTutor({
    stage: 'chat',
    contextKind: 'lesson',
    ...buildContext({ exercise: { rule }, skillId, studentName }),
    turns: thread.turns,
  });
}
