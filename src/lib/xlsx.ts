import JSZip from 'jszip';

/**
 * كاتب XLSX صغير وخفيف (بدون مكتبات ثقيلة):
 * - نص عربي UTF-8 كنص مضمّن inlineStr
 * - اتجاه الورقة من اليمين لليسار (rightToLeft)
 * - صف عناوين ملوّن، حدود، عرض أعمدة، تثبيت صف العناوين
 */

export type Cell = string | number | null | undefined;

export interface SheetSpec {
  name: string;
  /** سطر عنوان اختياري أعلى الجدول */
  title?: string;
  /** أسطر وصفية اختيارية تحت العنوان */
  subtitle?: string[];
  columns: { header: string; width: number }[];
  rows: Cell[][];
}

const STYLE = { normal: 0, header: 1, title: 2, cell: 3, subtitle: 4 } as const;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // إزالة محارف التحكم غير المسموح بها في XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function colName(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${i++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(ref: string, value: Cell, style: number): string {
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}" s="${style}"/>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const rows: string[] = [];
  let r = 1;
  const lastCol = colName(Math.max(sheet.columns.length - 1, 0));
  const merges: string[] = [];

  if (sheet.title) {
    rows.push(`<row r="${r}" ht="26" customHeight="1">${cellXml(`A${r}`, sheet.title, STYLE.title)}</row>`);
    if (sheet.columns.length > 1) merges.push(`A${r}:${lastCol}${r}`);
    r++;
  }
  for (const line of sheet.subtitle ?? []) {
    rows.push(`<row r="${r}">${cellXml(`A${r}`, line, STYLE.subtitle)}</row>`);
    if (sheet.columns.length > 1) merges.push(`A${r}:${lastCol}${r}`);
    r++;
  }
  if (sheet.title || sheet.subtitle?.length) r++; // سطر فارغ

  const headerRow = r;
  rows.push(
    `<row r="${r}" ht="22" customHeight="1">${sheet.columns
      .map((c, i) => cellXml(`${colName(i)}${r}`, c.header, STYLE.header))
      .join('')}</row>`,
  );
  r++;
  for (const row of sheet.rows) {
    rows.push(
      `<row r="${r}">${sheet.columns.map((_, i) => cellXml(`${colName(i)}${r}`, row[i], STYLE.cell)).join('')}</row>`,
    );
    r++;
  }

  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join('');
  const pane = `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView rightToLeft="1" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="4">` +
  `<font><sz val="11"/><name val="Arial"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>` +
  `<font><b/><sz val="15"/><color rgb="FF14532D"/><name val="Arial"/></font>` +
  `<font><sz val="10"/><color rgb="FF4B5563"/><name val="Arial"/></font>` +
  `</fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF166534"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right>` +
  `<top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1" readingOrder="2"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

export async function buildXlsx(sheets: SheetSpec[]): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('at least one sheet is required');
  const zip = new JSZip();
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      `</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView/></bookViews>` +
      `<sheets>${names
        .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  zip.file('xl/styles.xml', STYLES_XML);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** تنزيل ملف في المتصفح. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
