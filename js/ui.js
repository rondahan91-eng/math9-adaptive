// ==========================================================================
// ui.js - רכיבי ממשק משותפים
// ==========================================================================

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function progressBar(fraction, ok = false) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return `<div class="bar${ok ? ' ok' : ''}"><span style="width:${pct}%"></span></div>`;
}

let toastTimer = null;
export function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 3200);
}

/**
 * סרגל סמלים מתמטיים. מונע את מקור התסכול הנפוץ - להקליד תשובה נכונה
 * ולקבל שגיאת תחביר.
 *
 * label הוא מה שהתלמיד/ה רואה, insert הוא מה שנכנס לשדה. ההפרדה הזו מאפשרת
 * להציג "xⁿ" במקום את התו הגולמי ^ : הכפתור מראה מה הוא *עושה*, לא איזה תו
 * הוא מקליד.
 */
export const SYMBOL_KEYS = [
  { label: 'x', insert: 'x' },
  { label: 'x²', insert: '²' },
  { label: 'x³', insert: '³' },
  // לא מקליד תו: מפעיל "מצב חזקה", שבו הספרות הבאות נכתבות בכתב עילי
  { label: 'xⁿ', power: true, title: 'חזקה: לוחצים, ואז מקלידים את המספר' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '+', insert: '+' },
  { label: '−', insert: '-' },
  { label: '·', insert: '*' },
  { label: '/', insert: '/' },
];

// dir="ltr" על כל כפתור הוא חובה ולא קישוט: בהקשר RTL הדפדפן *משקף* סוגריים,
// כך שכפתור שהתווית שלו "(" מצויר על המסך כ-")". התו שנכנס לשדה היה נכון תמיד,
// אבל התלמיד ראה כפתור הפוך. הבידוד ל-LTR מצייר אותם כפי שהם.
export function symbolBar() {
  return `<div class="symbol-bar">${SYMBOL_KEYS
    .map(k => k.power
      ? `<button type="button" class="sym" dir="ltr" data-power aria-pressed="false"
           title="${escapeHtml(k.title)}">${escapeHtml(k.label)}</button>`
      : `<button type="button" class="sym" dir="ltr" data-insert="${escapeHtml(k.insert)}">${escapeHtml(k.label)}</button>`)
    .join('')}</div>`;
}

const SUPER_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const toSuper = (digits) => [...digits].map(d => SUPER_DIGITS[+d]).join('');
const isSuper = (ch) => !!ch && SUPER_DIGITS.includes(ch);

/**
 * מחבר את סרגל הסמלים לשדה קלט.
 *
 * חזקות נכתבות תמיד בכתב עילי, והסימן ^ לעולם לא נשאר בשדה. יש "מצב חזקה":
 * נכנסים אליו בכפתור xⁿ או בהקלדת ^, ובזמן שהוא פעיל כל ספרה שמוקלדת הופכת
 * לספרה עילית (x⁴, x¹²). כל תו אחר מסיים אותו. הלוגיקה יושבת באירוע input
 * ולא ב-beforeinput, כי במקלדות מגע רבות אי אפשר לבטל את beforeinput.
 */
export function wireSymbolBar(root, input) {
  let power = false;
  const powerBtn = root.querySelector('button.sym[data-power]');
  const setPower = (on) => {
    power = on;
    if (!powerBtn) return;
    powerBtn.classList.toggle('on', on);
    powerBtn.setAttribute('aria-pressed', String(on));
  };

  const insertAtCaret = (text) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
  };

  let lastValue = input.value;

  // הערך הקודם נדרש כדי לדעת מה בדיוק נמחק. הוא נשמר סינכרונית בסוף כל
  // טיפול: queueMicrotask לא מתאים כאן, כי כמה אירועי קלט עשויים להישלח
  // בתוך אותה משימה, והעדכון היה מגיע מאוחר מדי.
  input.addEventListener('input', (e) => {
    const previous = lastValue;
    try { handleInput(e, previous); } finally { lastValue = input.value; }
  });

  function handleInput(e, previous) {
    const caret = input.selectionStart ?? input.value.length;
    const value = input.value;

    if (e.inputType === 'insertText' && e.data) {
      // מעבדים רק את מה שהוקלד עכשיו - מיד לפני הסמן
      const from = caret - e.data.length;
      let out = '';
      for (const ch of e.data) {
        if (ch === '^') { setPower(true); continue; }
        if (power && /\d/.test(ch)) { out += toSuper(ch); continue; }
        setPower(false);
        out += ch;
      }
      if (out !== e.data) {
        input.value = value.slice(0, from) + out + value.slice(caret);
        const pos = from + out.length;
        input.setSelectionRange(pos, pos);
      }
      return;
    }

    // הדבקה, מחיקה, השלמה אוטומטית: מנרמלים כל ^ שנשאר בשדה
    const before = value.slice(0, caret).replace(/\^(\d+)/g, (_, d) => toSuper(d));
    const after = value.slice(caret).replace(/\^(\d+)/g, (_, d) => toSuper(d));
    if (before + after !== value) {
      input.value = before + after;
      input.setSelectionRange(before.length, before.length);
    }
    // מחיקה של ספרה עילית משאירה את מצב החזקה פעיל: מי שמחק/ה את ⁴ רוצה
    // כנראה להקליד חזקה אחרת במקומה. מחיקה של כל דבר אחר מסיימת אותו.
    if (e.inputType === 'deleteContentBackward') {
      const deleted = previous.slice(before.length, before.length + (previous.length - input.value.length));
      setPower(!!deleted && [...deleted].every(isSuper));
    } else if (power && !isSuper(input.value[before.length - 1])) {
      setPower(false);
    }
  }

  // תזוזת סמן בעכבר או בחיצים מסיימת את מצב החזקה
  input.addEventListener('mousedown', () => setPower(false));
  input.addEventListener('keydown', (e) => {
    if (/^(Arrow|Home|End)/.test(e.key)) setPower(false);
  });

  root.querySelectorAll('button.sym').forEach(btn => {
    btn.addEventListener('click', () => {
      input.focus();
      if (btn.dataset.power !== undefined) {
        setPower(!power);
        return;
      }
      setPower(false);
      insertAtCaret(btn.dataset.insert);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

export function fmtPercent(x) {
  return `${Math.round(x * 100)}%`;
}

export function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}
