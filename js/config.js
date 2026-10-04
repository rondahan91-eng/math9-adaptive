// ==========================================================================
// config.js - הגדרות גלובליות
// ==========================================================================
// כל עוד API_URL ריק, האפליקציה רצה במצב פיתוח מקומי: הנתונים נשמרים
// ב-localStorage והמורה הפרטי (ה-AI) מושבת. אין כאן מפתח API - הוא יושב
// בצד השרת (Script Properties ב-Google Apps Script) ולעולם לא מגיע לדפדפן.

export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyDXdOYnDvpKZmxk6M2My07-uLUEFXRVliCFrBAMP2Yk7aKpdWvrFlyzYJk1mZQ2Qh6Kw/exec',

  // המורה הפרטי מכובה. יש לו *שני* מתגים בלתי תלויים, ושניהם חייבים להיות
  // דלוקים כדי שהוא יפעל:
  //   1. הדגל הזה - צד הלקוח. false מסתיר את התכונה לגמרי ולא פונה לשרת.
  //   2. Script Property בשם CLAUDE_API_KEY בצד השרת.
  // כך הפעלה בטעות דורשת שני צעדים נפרדים, ולא אחד.
  TUTOR_ENABLED: false,

  // הגרסה של backend/Code.gs שהקוד הזה מצפה לה. אם השרת ישן יותר, מסך
  // המורה מתריע - אחרת פיצ'ר שלם (למשל מיזוג ההתקדמות) שותק בלי שאיש ידע.
  REQUIRED_BACKEND: '4',

  APP_NAME: 'מתמטיקה לכיתה ט׳',
  APP_TAGLINE: 'לומדה אדפטיבית לתרגול עצמי',
  UNIT_TITLE: 'כפל מקוצר ופירוק לגורמים',
  SESSION_KEY: 'math9-session',
  STATE_KEY: 'math9-state',
  EXERCISES_PER_ROUND: 6,
};

export const isDevMode = () => !CONFIG.API_URL;
