import { fetchAllTransactions } from '../services/transactionService';
import { formatDate, formatDateTime, monthDateRange } from './format';
import { intervalDateRange } from './intervals';

let pdfModulePromise = null;
let excelModulePromise = null;

async function loadPdfModules() {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([import('jspdf'), import('jspdf-autotable')]).then(
      ([jspdfModule, autoTableModule]) => ({
        jsPDF: jspdfModule.jsPDF,
        autoTable: autoTableModule.default || autoTableModule
      })
    );
  }
  return pdfModulePromise;
}

async function loadExcelModule() {
  if (!excelModulePromise) {
    excelModulePromise = import('xlsx-js-style').then((module) => module.default || module);
  }
  return excelModulePromise;
}

const REPORT_THEME = {
  primaryHex: '7C3AED',
  primaryRgb: [124, 58, 237],
  successHex: '16A34A',
  successRgb: [22, 163, 74],
  dangerHex: 'DC2626',
  dangerRgb: [220, 38, 38],
  warningHex: 'F59E0B',
  warningRgb: [245, 158, 11],
  slateHex: '0F172A',
  slateRgb: [15, 23, 42],
  mutedHex: '64748B',
  mutedRgb: [100, 116, 139],
  borderHex: 'E2E8F0',
  borderRgb: [226, 232, 240],
  whiteHex: 'FFFFFF',
  whiteRgb: [255, 255, 255],
  surfaceHex: 'FFFFFF',
  surfaceRgb: [255, 255, 255],
  neutralTintHex: 'F8FAFC',
  neutralTintRgb: [248, 250, 252]
};

const REPORT_TONES = {
  income: {
    fillHex: 'ECFDF5',
    fillRgb: [236, 253, 245],
    accentHex: REPORT_THEME.successHex,
    accentRgb: REPORT_THEME.successRgb
  },
  expense: {
    fillHex: 'FEF2F2',
    fillRgb: [254, 242, 242],
    accentHex: REPORT_THEME.dangerHex,
    accentRgb: REPORT_THEME.dangerRgb
  },
  transfer: {
    fillHex: 'F3E8FF',
    fillRgb: [243, 232, 255],
    accentHex: REPORT_THEME.primaryHex,
    accentRgb: REPORT_THEME.primaryRgb
  },
  asset: {
    fillHex: 'FFFBEB',
    fillRgb: [255, 251, 235],
    accentHex: REPORT_THEME.warningHex,
    accentRgb: REPORT_THEME.warningRgb
  },
  neutral: {
    fillHex: REPORT_THEME.neutralTintHex,
    fillRgb: REPORT_THEME.neutralTintRgb,
    accentHex: REPORT_THEME.slateHex,
    accentRgb: REPORT_THEME.slateRgb
  }
};

const EXCEL_BORDER = {
  top: { style: 'thin', color: { rgb: REPORT_THEME.borderHex } },
  right: { style: 'thin', color: { rgb: REPORT_THEME.borderHex } },
  bottom: { style: 'thin', color: { rgb: REPORT_THEME.borderHex } },
  left: { style: 'thin', color: { rgb: REPORT_THEME.borderHex } }
};

function textValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeKeyword(value) {
  return textValue(value)
    .trim()
    .toLowerCase()
    .replace(/[%]/g, ' percent ')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumericLike(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = textValue(value).trim();
  if (!raw) return null;
  if (/%$/.test(raw)) return null;

  const normalized = raw.replace(/[^\d.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportCurrencyPrefix(currency = 'INR') {
  const code = textValue(currency).trim().toUpperCase();
  if (!code || code === 'INR') return 'Rs';
  if (code === 'USD') return '$';
  if (code === 'GBP') return 'GBP';
  if (code === 'EUR') return 'EUR';
  if (code === 'AED') return 'AED';
  return code;
}

function formatReportCurrency(value, currency = 'INR') {
  const amount = Number(value || 0);
  const absoluteAmount = Math.abs(amount);
  const formattedNumber = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(absoluteAmount);
  const prefix = reportCurrencyPrefix(currency);
  const sign = amount < 0 ? '-' : '';
  const spacer = prefix === '$' ? '' : ' ';
  return `${sign}${prefix}${spacer}${formattedNumber}`;
}

function isPercentageDescriptor(value) {
  return /(percent|percentage|share|allocation|utilization)/.test(normalizeKeyword(value));
}

function isAmountDescriptor(value) {
  const normalized = normalizeKeyword(value);
  if (!normalized || isPercentageDescriptor(normalized)) return false;
  return /(amount|income|expense|inflow|outflow|budget|spent|remaining|invested|redeemed|gain|loss|cashflow|receivable|payable|settled|current|value|net|balance|total_spent)/.test(normalized);
}

function isAmountColumn(column) {
  return isAmountDescriptor(`${column?.key || ''}_${column?.label || ''}`);
}

function isTypeColumn(column) {
  return /(type|direction)/.test(normalizeKeyword(`${column?.key || ''}_${column?.label || ''}`));
}

function longestLineLength(value) {
  return textValue(value)
    .split('\n')
    .reduce((max, line) => Math.max(max, line.length), 0);
}

function resolveSummaryTone(label) {
  const normalized = normalizeKeyword(label);
  if (/(income|receivable|credit|inflow|settled_in)/.test(normalized)) return 'income';
  if (/(expense|payable|debit|outflow|settled_out)/.test(normalized)) return 'expense';
  if (/(transfer|net)/.test(normalized)) return 'transfer';
  if (/(asset|invested|value|gain|loss|budget|spent|remaining|current)/.test(normalized)) return 'asset';
  return 'neutral';
}

function resolveRowTone(table, row) {
  const explicitTone = normalizeKeyword(row?.__rowTone);
  if (explicitTone && REPORT_TONES[explicitTone]) {
    return explicitTone;
  }

  const typeValue = normalizeKeyword(row?.type || row?.transaction_type);
  if (typeValue === 'income') return 'income';
  if (typeValue === 'expense') return 'expense';
  if (typeValue === 'transfer' || typeValue === 'opening_adjustment') return 'transfer';
  if (typeValue === 'asset') return 'asset';

  const directionValue = normalizeKeyword(row?.direction);
  if (directionValue === 'receivable' || directionValue === 'credit') return 'income';
  if (directionValue === 'payable' || directionValue === 'debit') return 'expense';

  const tableName = normalizeKeyword(table?.name);
  if (tableName.includes('credit')) return 'income';
  if (tableName.includes('debit')) return 'expense';
  return 'neutral';
}

function normalizeLabeledValue(label, value) {
  if (isAmountDescriptor(label)) {
    const parsed = parseNumericLike(value);
    if (parsed !== null) {
      return formatReportCurrency(parsed);
    }
  }
  return textValue(value);
}

function prepareReportDefinition(definition) {
  return {
    ...definition,
    title: textValue(definition.title || 'Report'),
    subtitle: textValue(definition.subtitle || ''),
    dateRangeLabel: textValue(definition.dateRangeLabel || 'All Dates'),
    meta: (definition.meta || []).map((item) => ({
      ...item,
      label: textValue(item.label),
      value: normalizeLabeledValue(item.label, item.value)
    })),
    summary: (definition.summary || []).map((item) => ({
      ...item,
      label: textValue(item.label),
      value: normalizeLabeledValue(item.label, item.value)
    })),
    tables: (definition.tables || []).map((table) => {
      const columns = (table.columns || []).map((column) => ({
        ...column,
        key: textValue(column.key),
        label: textValue(column.label)
      }));
      const rows = (table.rows || []).map((row) => {
        const preparedRow = {
          ...row,
          __rowTone: resolveRowTone(table, row)
        };

        columns.forEach((column) => {
          preparedRow[column.key] = isAmountColumn(column)
            ? normalizeLabeledValue(column.label || column.key, row[column.key])
            : textValue(row[column.key]);
        });

        return preparedRow;
      });

      return {
        ...table,
        name: textValue(table.name || 'Report'),
        columns,
        rows
      };
    })
  };
}

function safeFilePart(value) {
  const normalized = textValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'report';
}

function safeSheetName(value, fallback = 'Sheet') {
  const raw = textValue(value).trim().replace(/[\\/?*:[\]]/g, ' ');
  const compact = raw.replace(/\s+/g, ' ').trim();
  return (compact || fallback).slice(0, 31);
}

function safeCell(value) {
  const text = textValue(value);
  if (text !== '' && ['=', '+', '-', '@'].includes(text[0])) {
    return `'${text}`;
  }
  return text;
}

function csvFromTable(table) {
  const header = table.columns.map((column) => safeCell(column.label));
  const rows = table.rows.map((row) =>
    table.columns.map((column) => safeCell(row[column.key]))
  );

  return [header, ...rows]
    .map((line) => line.map((cell) => `"${textValue(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function overviewSheetRows(definition) {
  const rows = [[definition.title || 'Report']];
  if (definition.subtitle) {
    rows.push([definition.subtitle]);
  }
  rows.push([]);
  rows.push(['Generated At', formatDateTime(new Date())]);
  rows.push(['Date Range', definition.dateRangeLabel || 'All Dates']);

  for (const item of definition.meta || []) {
    rows.push([item.label, item.value]);
  }

  if ((definition.summary || []).length) {
    rows.push([]);
    rows.push(['Summary']);
    for (const item of definition.summary) {
      rows.push([item.label, item.value]);
    }
  }

  return rows;
}

function shouldIncludeOverview(definition) {
  return Boolean(definition.subtitle)
    || Boolean(definition.dateRangeLabel)
    || Boolean((definition.meta || []).length)
    || Boolean((definition.summary || []).length);
}

function getAmountColumnIndexes(table) {
  return (table.columns || [])
    .map((column, index) => (isAmountColumn(column) ? index : -1))
    .filter((index) => index >= 0);
}

function getTypeColumnIndexes(table) {
  return (table.columns || [])
    .map((column, index) => (isTypeColumn(column) ? index : -1))
    .filter((index) => index >= 0);
}

function createExcelCellStyle({
  fillHex = REPORT_THEME.surfaceHex,
  fontHex = REPORT_THEME.slateHex,
  bold = false,
  align = 'left',
  wrap = true,
  size = 11
} = {}) {
  return {
    font: {
      name: 'Calibri',
      sz: size,
      bold,
      color: { rgb: fontHex }
    },
    fill: {
      patternType: 'solid',
      fgColor: { rgb: fillHex }
    },
    border: EXCEL_BORDER,
    alignment: {
      vertical: 'top',
      horizontal: align,
      wrapText: wrap
    }
  };
}

function styleExcelOverviewSheet(XLSX, sheet, definition) {
  sheet['!cols'] = [{ wch: 24 }, { wch: 36 }];
  if (!sheet['!ref']) return;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const labelRef = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
    const valueRef = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });
    const labelCell = sheet[labelRef];
    const valueCell = sheet[valueRef];
    const labelValue = textValue(labelCell?.v);

    if (labelCell) {
      if (rowIndex === 0) {
        labelCell.s = createExcelCellStyle({
          fillHex: REPORT_THEME.primaryHex,
          fontHex: REPORT_THEME.whiteHex,
          bold: true,
          size: 14
        });
      } else if (rowIndex === 1 && definition.subtitle) {
        labelCell.s = createExcelCellStyle({
          fillHex: REPORT_TONES.transfer.fillHex,
          fontHex: REPORT_THEME.primaryHex,
          size: 11
        });
      } else if (labelValue === 'Summary') {
        labelCell.s = createExcelCellStyle({
          fillHex: REPORT_THEME.primaryHex,
          fontHex: REPORT_THEME.whiteHex,
          bold: true
        });
      } else if (labelValue) {
        const tone = resolveSummaryTone(labelValue);
        labelCell.s = createExcelCellStyle({
          fillHex: REPORT_THEME.neutralTintHex,
          fontHex: tone === 'neutral' ? REPORT_THEME.slateHex : REPORT_TONES[tone].accentHex,
          bold: true
        });
      }
    }

    if (valueCell) {
      const tone = resolveSummaryTone(labelValue);
      valueCell.s = createExcelCellStyle({
        fillHex: REPORT_THEME.surfaceHex,
        fontHex: tone === 'neutral' ? REPORT_THEME.slateHex : REPORT_TONES[tone].accentHex,
        align: isAmountDescriptor(labelValue) ? 'right' : 'left'
      });
    }
  }
}

function styleExcelTableSheet(XLSX, sheet, table) {
  const amountColumnIndexes = getAmountColumnIndexes(table);
  const typeColumnIndexes = getTypeColumnIndexes(table);

  sheet['!cols'] = (table.columns || []).map((column, index) => {
    const maxLength = Math.max(
      longestLineLength(column.label),
      ...(table.rows || []).map((row) => longestLineLength(row[column.key]))
    );

    if (amountColumnIndexes.includes(index)) {
      return { wch: Math.min(Math.max(maxLength + 3, 16), 22) };
    }

    const normalized = normalizeKeyword(`${column.key}_${column.label}`);
    if (/(note|receipt|location)/.test(normalized)) {
      return { wch: Math.min(Math.max(maxLength + 3, 18), 36) };
    }
    if (normalized.includes('date')) {
      return { wch: Math.min(Math.max(maxLength + 2, 18), 24) };
    }
    return { wch: Math.min(Math.max(maxLength + 2, 12), 26) };
  });

  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
    const headerRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
    if (sheet[headerRef]) {
      sheet[headerRef].s = createExcelCellStyle({
        fillHex: REPORT_THEME.primaryHex,
        fontHex: REPORT_THEME.whiteHex,
        bold: true,
        align: amountColumnIndexes.includes(colIndex) ? 'right' : 'left'
      });
    }
  }

  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
    const row = table.rows[rowIndex - 1] || {};
    const tone = REPORT_TONES[resolveRowTone(table, row)] || REPORT_TONES.neutral;
    const rowFillHex = tone === REPORT_TONES.neutral && rowIndex % 2 === 0
      ? REPORT_THEME.neutralTintHex
      : tone.fillHex;

    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const ref = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[ref];
      if (!cell) continue;

      const isAmount = amountColumnIndexes.includes(colIndex);
      const isType = typeColumnIndexes.includes(colIndex);
      const valueText = textValue(cell.v);

      cell.s = createExcelCellStyle({
        fillHex: rowFillHex,
        fontHex: isAmount || isType ? tone.accentHex : REPORT_THEME.slateHex,
        align: isAmount ? 'right' : 'left',
        size: isAmount && valueText.length > 14 ? 10 : 11
      });
    }
  }
}

async function exportExcelReport(definition) {
  const XLSX = await loadExcelModule();
  const workbook = XLSX.utils.book_new();

  if (shouldIncludeOverview(definition)) {
    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewSheetRows(definition));
    styleExcelOverviewSheet(XLSX, overviewSheet, definition);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, safeSheetName('Overview'));
  }

  for (const table of definition.tables) {
    const aoa = [
      table.columns.map((column) => column.label),
      ...table.rows.map((row) => table.columns.map((column) => row[column.key]))
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    styleExcelTableSheet(XLSX, sheet, table);
    XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(table.name, 'Report'));
  }

  XLSX.writeFile(workbook, `${safeFilePart(definition.fileName || definition.title)}.xlsx`);
}

function fittedFontSize(doc, text, maxWidth, maxSize = 11, minSize = 8) {
  let size = maxSize;
  while (size > minSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(textValue(text)) <= maxWidth) {
      break;
    }
    size -= 0.25;
  }
  return size;
}

function resolvePdfColumnSpec(column, wideTable) {
  const normalized = normalizeKeyword(`${column?.key || ''}_${column?.label || ''}`);
  const compact = wideTable;

  if (/^(id|sr|no|number)$/.test(normalized) || /(^|_)(id|sr_no|serial)(_|\b)/.test(normalized)) {
    return { width: compact ? 9 : 11, minWidth: 8, grow: 0, align: 'left' };
  }
  if (normalized.includes('date')) {
    return { width: compact ? 22 : 25, minWidth: compact ? 19 : 22, grow: 1, align: 'left' };
  }
  if (/(amount|income|expense|inflow|outflow|receivable|payable|balance|value|gain|loss|budget|spent|remaining|cashflow|net)/.test(normalized)) {
    return { width: compact ? 18 : 22, minWidth: compact ? 16 : 18, grow: 0.4, align: 'right' };
  }
  if (/(note|description|remarks|comment|narration)/.test(normalized)) {
    return { width: compact ? 38 : 42, minWidth: compact ? 28 : 32, grow: 2.2, align: 'left' };
  }
  if (/(category|business|contact|customer|supplier|party|name)/.test(normalized)) {
    return { width: compact ? 18 : 22, minWidth: compact ? 14 : 17, grow: 1.2, align: 'left' };
  }
  if (/(from_account|to_account|account)/.test(normalized)) {
    return { width: compact ? 18 : 22, minWidth: compact ? 14 : 17, grow: 1.1, align: 'left' };
  }
  if (/(from_asset|to_asset|asset)/.test(normalized)) {
    return { width: compact ? 14 : 18, minWidth: compact ? 11 : 14, grow: 0.7, align: 'left' };
  }
  if (/(receipt|attachment|file|location)/.test(normalized)) {
    return { width: compact ? 18 : 22, minWidth: compact ? 14 : 17, grow: 1, align: 'left' };
  }
  if (/(type|direction|status)/.test(normalized)) {
    return { width: compact ? 14 : 16, minWidth: compact ? 12 : 14, grow: 0.6, align: 'left' };
  }

  return { width: compact ? 16 : 18, minWidth: compact ? 13 : 15, grow: 0.9, align: 'left' };
}

function buildPdfColumnStyles(table, pageWidth, margin, wideTable) {
  const availableWidth = pageWidth - margin * 2;
  const specs = (table.columns || []).map((column, index) => ({
    index,
    ...resolvePdfColumnSpec(column, wideTable)
  }));

  let totalWidth = specs.reduce((sum, spec) => sum + spec.width, 0);
  if (totalWidth > availableWidth) {
    let overflow = totalWidth - availableWidth;
    const shrinkable = () => specs.reduce((sum, spec) => sum + Math.max(0, spec.width - spec.minWidth), 0);

    while (overflow > 0.01 && shrinkable() > 0.01) {
      const totalShrinkable = shrinkable();
      specs.forEach((spec) => {
        const room = Math.max(0, spec.width - spec.minWidth);
        if (!room) return;
        const cut = Math.min(room, overflow * (room / totalShrinkable));
        spec.width -= cut;
      });
      totalWidth = specs.reduce((sum, spec) => sum + spec.width, 0);
      overflow = totalWidth - availableWidth;
    }
  } else if (totalWidth < availableWidth) {
    const extra = availableWidth - totalWidth;
    const totalGrow = specs.reduce((sum, spec) => sum + spec.grow, 0);
    if (totalGrow > 0) {
      specs.forEach((spec) => {
        spec.width += extra * (spec.grow / totalGrow);
      });
    }
  }

  return specs.reduce((styles, spec) => {
    styles[spec.index] = {
      cellWidth: Number(spec.width.toFixed(2)),
      halign: spec.align,
      fontStyle: 'normal'
    };
    return styles;
  }, {});
}

function drawMetaRows(doc, rows, startY, margin) {
  if (!rows.length) return startY;

  const pageWidth = doc.internal.pageSize.getWidth();
  const labelGap = 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const labelWidth = rows.reduce(
    (max, item) => Math.max(max, doc.getTextWidth(`${textValue(item.label)}:`)),
    0
  );

  let y = startY;
  rows.forEach((item) => {
    const label = `${textValue(item.label)}:`;
    const value = textValue(item.value);
    const valueX = margin + labelWidth + labelGap;
    const wrappedValue = doc.splitTextToSize(value, pageWidth - valueX - margin);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...REPORT_THEME.mutedRgb);
    doc.text(label, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...REPORT_THEME.slateRgb);
    doc.text(wrappedValue, valueX, y);

    y += Math.max(5, wrappedValue.length * 4.5);
  });

  return y + 1;
}

function drawSummary(doc, summary, startY) {
  if (!summary.length) return startY;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 4;
  const cardWidth = (pageWidth - margin * 2 - gap) / 2;
  const cardHeight = 18;
  let x = margin;
  let y = startY;

  summary.forEach((item, index) => {
    const tone = REPORT_TONES[resolveSummaryTone(item.label)] || REPORT_TONES.neutral;
    doc.setDrawColor(...REPORT_THEME.borderRgb);
    doc.setFillColor(...tone.fillRgb);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
    doc.setFillColor(...tone.accentRgb);
    doc.roundedRect(x + 1, y + 1, 1.2, cardHeight - 2, 1, 1, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_THEME.mutedRgb);
    doc.text(textValue(item.label), x + 4.4, y + 5.5);
    doc.setTextColor(...tone.accentRgb);
    doc.setFontSize(fittedFontSize(doc, item.value, cardWidth - 8.5, 10.5, 7));
    doc.text(textValue(item.value), x + 4.4, y + 12.2);

    if (index % 2 === 0) {
      x = margin + cardWidth + gap;
    } else {
      x = margin;
      y += cardHeight + gap;
    }
  });

  if (summary.length % 2 === 1) {
    y += cardHeight + gap;
  }

  return y + 2;
}

async function exportPdfReport(definition) {
  const { jsPDF, autoTable } = await loadPdfModules();
  const wideTable = definition.tables.some((table) => table.columns.length > 7);
  const doc = new jsPDF({
    orientation: wideTable ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const margin = 14;
  let y = 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(...REPORT_THEME.slateRgb);
  doc.text(textValue(definition.title || 'Report'), margin, y);
  y += 7;

  if (definition.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(...REPORT_THEME.mutedRgb);
    doc.text(textValue(definition.subtitle), margin, y);
    y += 6;
  }

  y = drawMetaRows(
    doc,
    [
      { label: 'Generated', value: formatDateTime(new Date()) },
      { label: 'Date Range', value: definition.dateRangeLabel || 'All Dates' },
      ...(definition.meta || [])
    ],
    y,
    margin
  );

  y = drawSummary(doc, definition.summary || [], y);

  definition.tables.forEach((table, index) => {
    const amountColumnIndexes = getAmountColumnIndexes(table);
    const typeColumnIndexes = getTypeColumnIndexes(table);

    if (index > 0) {
      doc.addPage();
      y = 16;
    }

    const columnStyles = buildPdfColumnStyles(
      table,
      doc.internal.pageSize.getWidth(),
      margin,
      wideTable
    );

    doc.setFontSize(12);
    doc.setTextColor(...REPORT_THEME.slateRgb);
    doc.text(textValue(table.name), margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [table.columns.map((column) => column.label)],
      body: table.rows.map((row) => table.columns.map((column) => textValue(row[column.key]))),
      margin: { left: margin, right: margin },
      styles: {
        fontSize: wideTable ? 7 : 8,
        cellPadding: wideTable ? 1.8 : 2.2,
        textColor: [30, 41, 59],
        lineColor: REPORT_THEME.borderRgb,
        lineWidth: 0.15,
        overflow: 'linebreak',
        fontStyle: 'normal',
        valign: 'middle',
        lineHeight: 1.18
      },
      headStyles: {
        fillColor: REPORT_THEME.primaryRgb,
        textColor: REPORT_THEME.whiteRgb,
        fontStyle: 'bold',
        valign: 'middle',
        halign: 'left'
      },
      alternateRowStyles: {
        fillColor: REPORT_THEME.neutralTintRgb
      },
      columnStyles,
      didParseCell: (data) => {
        if (data.section !== 'body') return;

        const row = table.rows[data.row.index] || {};
        const tone = REPORT_TONES[resolveRowTone(table, row)] || REPORT_TONES.neutral;
        if (tone !== REPORT_TONES.neutral) {
          data.cell.styles.fillColor = tone.fillRgb;
        }

        if (amountColumnIndexes.includes(data.column.index)) {
          data.cell.styles.halign = 'right';
          data.cell.styles.textColor = tone.accentRgb;
          data.cell.styles.fontStyle = 'normal';
          const amountTextLength = textValue(row[table.columns[data.column.index].key]).length;
          if (amountTextLength > 16) {
            data.cell.styles.fontSize = 6.8;
          } else if (amountTextLength > 13) {
            data.cell.styles.fontSize = 7.2;
          }
        }

        if (typeColumnIndexes.includes(data.column.index)) {
          data.cell.styles.textColor = tone.accentRgb;
        }
      },
      theme: 'grid'
    });
  });

  doc.save(`${safeFilePart(definition.fileName || definition.title)}.pdf`);
}

function exportCsvReport(definition) {
  const table = definition.tables[0];
  const csv = csvFromTable(table);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${safeFilePart(definition.fileName || definition.title)}.csv`);
}

export function reportDateRangeFromInterval(interval, fallbackRange = null) {
  const range = interval ? intervalDateRange(interval) : null;
  return {
    fromDate: textValue(fallbackRange?.fromDate || fallbackRange?.date_from || range?.date_from || ''),
    toDate: textValue(fallbackRange?.toDate || fallbackRange?.date_to || range?.date_to || '')
  };
}

export function reportDateRangeFromMonth(month, fallbackRange = null) {
  const range = monthDateRange(month);
  return {
    fromDate: textValue(fallbackRange?.fromDate || fallbackRange?.date_from || range?.date_from || ''),
    toDate: textValue(fallbackRange?.toDate || fallbackRange?.date_to || range?.date_to || '')
  };
}

export function validateReportDateRange(range) {
  const fromDate = textValue(range?.fromDate || '').trim();
  const toDate = textValue(range?.toDate || '').trim();

  if (!fromDate || !toDate) {
    throw new Error('Choose both from and to dates.');
  }
  if (fromDate > toDate) {
    throw new Error('From date must be before or equal to to date.');
  }

  return { fromDate, toDate };
}

export function formatReportDateRange(fromDate, toDate) {
  if (fromDate && toDate) {
    return `${formatDate(fromDate)} to ${formatDate(toDate)}`;
  }
  if (fromDate) {
    return `From ${formatDate(fromDate)}`;
  }
  if (toDate) {
    return `Up to ${formatDate(toDate)}`;
  }
  return 'All Dates';
}

export function summarizeTransactions(transactions) {
  const rows = transactions || [];
  const incomeTotal = rows
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = rows
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const transferTotal = rows
    .filter((item) => item.type === 'transfer')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const assetTotal = rows
    .filter((item) => item.type === 'asset')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    count: rows.length,
    incomeTotal,
    expenseTotal,
    transferTotal,
    assetTotal,
    netCashflow: incomeTotal - expenseTotal
  };
}

export function filterTransactionsBySearch(transactions, searchQuery) {
  const query = textValue(searchQuery).trim().toLowerCase();
  if (!query) return transactions || [];

  return (transactions || []).filter((txn) => {
    const values = [
      txn.id,
      txn.transaction_date,
      txn.type,
      txn.amount,
      txn.from_account_name,
      txn.to_account_name,
      txn.from_asset_type_name,
      txn.to_asset_type_name,
      txn.category_name,
      txn.business_name,
      txn.created_by_name,
      txn.note,
      txn.location,
      formatDate(txn.transaction_date),
      formatDateTime(txn.transaction_date)
    ];

    return values.some((value) => textValue(value).toLowerCase().includes(query));
  });
}

export function buildTransactionReportDefinition({
  title,
  subtitle,
  fileName,
  dateRangeLabel,
  transactions,
  includeBusiness = true,
  includeCreatedBy = false,
  meta = [],
  summary = null,
  sheetName = 'Transactions'
}) {
  const rows = (transactions || []).map((txn) => ({
    id: textValue(txn.id),
    transaction_date: formatDateTime(txn.transaction_date),
    type: textValue(txn.type || '').replace(/_/g, ' '),
    amount: formatReportCurrency(txn.amount || 0),
    from_account_name: textValue(txn.from_account_name || '-'),
    to_account_name: textValue(txn.to_account_name || '-'),
    from_asset_type_name: textValue(txn.from_asset_type_name || '-'),
    to_asset_type_name: textValue(txn.to_asset_type_name || '-'),
    category_name: textValue(txn.category_name || '-'),
    business_name: textValue(txn.business_name || '-'),
    created_by_name: textValue(txn.created_by_name || '-'),
    note: textValue(txn.note || ''),
    location: textValue(txn.location || ''),
    receipt_path: textValue(txn.receipt_path || ''),
    __rowTone: textValue(txn.type || '')
  }));

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'transaction_date', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'from_account_name', label: 'From Account' },
    { key: 'to_account_name', label: 'To Account' },
    { key: 'from_asset_type_name', label: 'From Asset' },
    { key: 'to_asset_type_name', label: 'To Asset' },
    { key: 'category_name', label: 'Category' }
  ];

  if (includeBusiness) {
    columns.push({ key: 'business_name', label: 'Business' });
  }

  if (includeCreatedBy) {
    columns.push({ key: 'created_by_name', label: 'Entered By' });
  }

  columns.push(
    { key: 'note', label: 'Note' },
    { key: 'location', label: 'Location' },
    { key: 'receipt_path', label: 'Receipt' }
  );

  const totals = summarizeTransactions(transactions || []);
  const resolvedSummary = summary || [
    { label: 'Transactions', value: String(totals.count) },
    { label: 'Income', value: formatReportCurrency(totals.incomeTotal) },
    { label: 'Expense', value: formatReportCurrency(totals.expenseTotal) },
    { label: 'Net Cashflow', value: formatReportCurrency(totals.netCashflow) }
  ];

  return {
    title,
    subtitle,
    fileName: fileName || title,
    dateRangeLabel,
    meta,
    summary: resolvedSummary,
    tables: [
      {
        name: sheetName,
        columns,
        rows
      }
    ]
  };
}

export function buildReportDefinition({
  title,
  subtitle = '',
  fileName,
  dateRangeLabel = 'All Dates',
  meta = [],
  summary = [],
  tables = []
}) {
  return {
    title,
    subtitle,
    fileName: fileName || title,
    dateRangeLabel,
    meta,
    summary,
    tables
  };
}

export async function fetchTransactionsForExport(params = {}, range = {}, searchQuery = '') {
  const response = await fetchAllTransactions({
    ...(params || {}),
    date_from: range?.fromDate || '',
    date_to: range?.toDate || ''
  });

  return filterTransactionsBySearch(response.transactions || [], searchQuery);
}

export async function exportReportDefinition(format, definition) {
  if (!definition || !Array.isArray(definition.tables) || !definition.tables.length) {
    throw new Error('No report data available.');
  }

  const preparedDefinition = prepareReportDefinition(definition);

  if (format === 'pdf') {
    await exportPdfReport(preparedDefinition);
    return;
  }

  if (format === 'excel') {
    await exportExcelReport(preparedDefinition);
    return;
  }

  exportCsvReport(preparedDefinition);
}
