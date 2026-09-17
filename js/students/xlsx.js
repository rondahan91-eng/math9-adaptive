// ==========================================================================
// xlsx.js - קריאת קובץ Excel בדפדפן, בלי ספרייה חיצונית
// ==========================================================================
// קובץ xlsx הוא ארכיון zip של קובצי XML. הדפדפן יודע לפרוס zip בעצמו
// (DecompressionStream) ולקרוא XML (DOMParser), ולכן אין צורך בספרייה.
// זה חשוב: הלומדה לא טוענת שום דבר משרת חיצוני, כי רשתות בתי ספר חוסמות
// לעיתים קרובות כתובות כאלה - ואז כפתור הייבוא פשוט לא היה עובד.
//
// מה שנתמך: xlsx (כל גרסאות Excel מ-2007), CSV (גם UTF-8 וגם הקידוד
// העברי הישן של Windows). מה שלא: xls בינארי ישן - מבקשים לשמור מחדש.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** קורא את כל הקבצים בארכיון zip. מחזיר Map משם קובץ ל-Uint8Array. */
async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // סוף הספרייה המרכזית: נמצא בסוף הקובץ, אחרי הערה אופציונלית
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('הקובץ אינו קובץ Excel תקין');

  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const files = new Map();
  const decoder = new TextDecoder();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== SIG_CENTRAL) throw new Error('מבנה הקובץ פגום');
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // הגודלים בכותרת המקומית עלולים להיות אפס - סומכים על הספרייה המרכזית
    if (view.getUint32(localOffset, true) !== SIG_LOCAL) throw new Error('מבנה הקובץ פגום');
    const start = localOffset + 30
      + view.getUint16(localOffset + 26, true)
      + view.getUint16(localOffset + 28, true);
    files.set(name, { method, data: bytes.subarray(start, start + compSize) });
  }

  return {
    async read(name) {
      const f = files.get(name);
      if (!f) return null;
      if (f.method === 0) return decoder.decode(f.data);
      if (f.method !== 8) throw new Error('שיטת דחיסה לא נתמכת בקובץ');
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('הדפדפן הזה ישן מדי לקריאת קובצי Excel. נסו Chrome או Edge מעודכנים, או שמרו את הקובץ כ-CSV.');
      }
      const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    },
    has: (name) => files.has(name),
  };
}

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const all = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];

/** "BC12" -> 54 (אינדקס עמודה מבוסס 0) */
function columnIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** נתיב יחסי בתוך הארכיון: "worksheets/sheet1.xml" מתוך "xl/" */
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * קורא את הגיליון הראשון בקובץ xlsx.
 * @returns {Promise<{rows: Array<Array<string|number>>, date1904: boolean}>}
 */
export async function readXlsx(buffer) {
  const zip = await unzip(buffer);

  const workbookXml = await zip.read('xl/workbook.xml');
  if (!workbookXml) throw new Error('הקובץ אינו קובץ Excel תקין');
  const workbook = parseXml(workbookXml);
  const date1904 = all(workbook, 'workbookPr').some(n => /^(1|true)$/.test(n.getAttribute('date1904') || ''));

  // הגיליון הראשון לפי הסדר בחוברת - לא בהכרח sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = all(workbook, 'sheet')[0];
  const relsXml = await zip.read('xl/_rels/workbook.xml.rels');
  if (first && relsXml) {
    const rid = first.getAttribute('r:id')
      || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = all(parseXml(relsXml), 'Relationship').find(r => r.getAttribute('Id') === rid);
    if (rel) sheetPath = resolvePath('xl', rel.getAttribute('Target'));
  }

  const shared = [];
  const sharedXml = await zip.read('xl/sharedStrings.xml');
  if (sharedXml) {
    for (const si of all(parseXml(sharedXml), 'si')) {
      // טקסט עשיר מפוצל לכמה <t>; מחברים את כולם. מתעלמים מהגיית פונטיקה.
      shared.push(all(si, 't').filter(t => t.parentNode.localName !== 'rPh')
        .map(t => t.textContent).join(''));
    }
  }

  const sheetXml = await zip.read(sheetPath);
  if (!sheetXml) throw new Error('לא נמצא גיליון בקובץ');

  const rows = [];
  for (const row of all(parseXml(sheetXml), 'row')) {
    const rowIndex = Number(row.getAttribute('r')) - 1;
    const cells = [];
    all(row, 'c').forEach((c, i) => {
      const col = c.getAttribute('r') ? columnIndex(c.getAttribute('r')) : i;
      const type = c.getAttribute('t');
      const v = all(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = all(c, 't').map(t => t.textContent).join('');
      else if (type === 'str' || type === 'e') value = v;
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v === '' ? '' : Number(v);
      cells[col] = value;
    });
    for (let k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = '';
    rows[Number.isFinite(rowIndex) && rowIndex >= 0 ? rowIndex : rows.length] = cells;
  }
  for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
  return { rows, date1904 };
}

/** פירוק CSV בסיסי עם מרכאות. המפריד מזוהה לפי השורה הראשונה. */
export function readCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const delim = ['\t', ';', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best, ',');

  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { rows, date1904: false };
}

/**
 * CSV שנשמר ב-Excel עברי יוצא לרוב בקידוד Windows-1255 ולא ב-UTF-8.
 * מנסים UTF-8 בקפדנות, ואם נכשל - עוברים לקידוד העברי.
 */
function decodeText(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1255').decode(buffer); }
}

/** נקודת הכניסה: קובץ מהמשתמש -> שורות. */
export async function readSpreadsheet(file) {
  const name = (file.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 8));

  // xlsx מתחיל ב-"PK"; xls ישן מתחיל בחתימת OLE
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buffer);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new Error('זה קובץ Excel בפורמט הישן (xls). פתחו אותו ב-Excel ושמרו בשם בפורמט xlsx, ואז נסו שוב.');
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    return readCsv(decodeText(buffer));
  }
  throw new Error('סוג קובץ לא נתמך. אפשר להעלות xlsx או csv.');
}
