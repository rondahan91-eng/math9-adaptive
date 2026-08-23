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
 * סרגל סמלים מתמטיים. חוסך לתלמידים את החיפוש אחרי ^ במקלדת, ובעיקר מונע
 * את מקור התסכול הנפוץ - להקליד תשובה נכונה ולקבל שגיאת תחביר.
 */
export const SYMBOL_KEYS = ['x', '²', '³', '^', '(', ')', '+', '−', '·', '/'];

// dir="ltr" על כל כפתור הוא חובה ולא קישוט: בהקשר RTL הדפדפן *משקף* סוגריים,
// כך שכפתור שהתווית שלו "(" מצויר על המסך כ-")". התו שנכנס לשדה היה נכון תמיד,
// אבל התלמיד ראה כפתור הפוך. הבידוד ל-LTR מצייר אותם כפי שהם.
export function symbolBar() {
  return `<div class="symbol-bar">${SYMBOL_KEYS
    .map(k => `<button type="button" class="sym" dir="ltr" data-sym="${escapeHtml(k)}">${escapeHtml(k)}</button>`)
    .join('')}</div>`;
}

/** מחבר את סרגל הסמלים לשדה קלט: הכנסה במיקום הסמן ושמירת הפוקוס. */
export function wireSymbolBar(root, input) {
  root.querySelectorAll('button.sym').forEach(btn => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.sym === '−' ? '-' : btn.dataset.sym === '·' ? '*' : btn.dataset.sym;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + sym + input.value.slice(end);
      const caret = start + sym.length;
      input.focus();
      input.setSelectionRange(caret, caret);
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
