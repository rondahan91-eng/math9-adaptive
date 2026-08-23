// ==========================================================================
// conversation.js - השיחה עם המורה הפרטי
// ==========================================================================
// שלב א' של התכונה: **כפתורים בלבד**, בלי שדה שאלה חופשי. רוב תלמידי ט׳ לא
// יודעים לנסח שאלה מתמטית, והכפתורים הם ממילא הדרך העיקרית. שדה חופשי אפשר
// להוסיף אחר כך בלי לשנות כלום כאן - הוא רק עוד מקור ל-question.text.

import { misconception } from '../curriculum/misconceptions.js';

export const DAILY_LIMIT = 15;   // לתלמיד/ה ליום
export const TURNS_PER_EXERCISE = 6;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * המכסה **אינה נצברת**: יום חדש מאפס ל-15, ומה שלא נוצל אתמול לא עובר.
 * זו החלטה מכוונת - מכסה נצברת מייצרת "חיסכון" ואז מפולת שימוש ביום אחד.
 */
export function tutorUsage(state) {
  const usage = state.tutorUsage;
  if (!usage || usage.date !== today()) return { date: today(), count: 0 };
  return usage;
}

export function questionsLeft(state) {
  return Math.max(0, DAILY_LIMIT - tutorUsage(state).count);
}

export function recordQuestion(state) {
  const usage = tutorUsage(state);
  state.tutorUsage = { date: usage.date, count: usage.count + 1 };
}

// -------------------------------------------------------------- שאלות מוכנות
/**
 * הכפתורים נגזרים מהמצב ולא מרשימה קבועה. תלמיד/ה שקיבל/ה אבחון מקבל/ת
 * שאלות על הטעות שלו/ה; מי שטעה/תה בלי אבחון מקבל/ת שאלות פתיחה.
 */
export function preparedQuestions({ context, misconceptionId, attempts, settled }) {
  if (context === 'lesson') {
    return [
      { id: 'example', label: 'תנו לי דוגמה נוספת', text: 'אפשר דוגמה נוספת לכלל הזה, עם מספרים אחרים?' },
      { id: 'when', label: 'מתי משתמשים בזה?', text: 'מתי בעצם משתמשים בכלל הזה? איך אני מזהה שזה המקרה?' },
      { id: 'why', label: 'למה זה עובד?', text: 'למה הכלל הזה נכון? מאיפה הוא מגיע?' },
    ];
  }

  if (settled) {
    return [
      { id: 'recap', label: 'תסבירו לי את הפתרון', text: 'אפשר להסביר לי את הפתרון בקצרה, כדי שבפעם הבאה אצליח לבד?' },
      { id: 'avoid', label: 'איך לא אטעה שוב?', text: 'מה הסימן שהייתי צריך לשים לב אליו כדי לא לטעות כאן?' },
    ];
  }

  if (misconceptionId) {
    const info = misconception(misconceptionId);
    const label = info ? info.label : 'הטעות שלי';
    return [
      { id: 'why-wrong', label: 'למה זה לא נכון?', text: `למה התשובה שלי לא נכונה? נאמר לי ש"${label}".` },
      { id: 'hint', label: 'תנו לי רמז', text: 'אני לא רוצה את התשובה, רק רמז אחד שיכוון אותי לצעד הנכון.' },
      { id: 'rule', label: 'תסבירו לי את הכלל', text: 'אפשר להסביר לי שוב את הכלל ששייך לתרגיל הזה?' },
    ];
  }

  if (attempts > 0) {
    return [
      { id: 'start', label: 'מאיפה מתחילים?', text: 'מאיפה מתחילים בתרגיל הזה? מה הצעד הראשון?' },
      { id: 'which-rule', label: 'איזה כלל שייך כאן?', text: 'איזה כלל או נוסחה שייכים לתרגיל הזה, ואיך אני מזהה את זה?' },
      { id: 'check', label: 'איך אני בודק את עצמי?', text: 'איך אני יכול לבדוק בעצמי אם התשובה שלי נכונה?' },
    ];
  }

  return [];
}

// -------------------------------------------------------------- מצב השיחה
/**
 * turns - מה שנשלח ל-API (טקסט בלבד).
 * view  - מה שמוצג על המסך (HTML מאומת). מופרדים בכוונה: אסור שה-HTML
 *         שרונדר אצלנו יחזור למודל, ואסור שהמודל יראה סימוני עיצוב.
 */
export function newThread() {
  return { turns: [], view: [], asked: 0 };
}

export const threadFull = (thread) => thread.asked >= TURNS_PER_EXERCISE;

export function pushQuestion(thread, text, label) {
  thread.turns.push({ role: 'user', content: text });
  thread.view.push({ role: 'user', label: label || text });
  thread.asked++;
}

export function pushAnswer(thread, text, html) {
  thread.turns.push({ role: 'assistant', content: text });
  thread.view.push({ role: 'assistant', html });
}

/** אחרי סבב שנכשל - מסירים אותו כדי שלא יזהם את ההמשך. */
export function dropLastQuestion(thread) {
  if (thread.turns.length) thread.turns.pop();
  if (thread.view.length) thread.view.pop();
  thread.asked = Math.max(0, thread.asked - 1);
}
