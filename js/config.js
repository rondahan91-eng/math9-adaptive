// ==========================================================================
// config.js - הגדרות גלובליות
// ==========================================================================
// כל עוד API_URL ריק, האפליקציה רצה במצב פיתוח מקומי: הנתונים נשמרים
// ב-localStorage והמורה הפרטי (ה-AI) מושבת. אין כאן מפתח API - הוא יושב
// בצד השרת (Script Properties ב-Google Apps Script) ולעולם לא מגיע לדפדפן.

export const CONFIG = {
  API_URL: '', // לדוגמה: 'https://script.google.com/macros/s/AKfycb.../exec'
  APP_NAME: 'מתמטיקה לכיתה ט׳',
  APP_TAGLINE: 'לומדה אדפטיבית לתרגול עצמי',
  UNIT_TITLE: 'כפל מקוצר ופירוק לגורמים',
  SESSION_KEY: 'math9-session',
  STATE_KEY: 'math9-state',
  EXERCISES_PER_ROUND: 6,
};

export const isDevMode = () => !CONFIG.API_URL;
