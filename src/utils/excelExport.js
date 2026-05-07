const ExcelJS = require('exceljs');

/**
 * Generic Excel exporter — turns an array of records into a one-sheet
 * .xlsx Buffer.
 *
 * Each `column` is { header, key, width?, format? }:
 *   - header: text shown on row 1 (string)
 *   - key:    property name on the record OR a (record) => value function
 *   - width:  optional column width (Excel units)
 *   - format: optional (value) => any formatter; runs after the key
 *             pull, before writing the cell
 *
 * Bool values render as "Yes" / "No"; null / undefined as "—" — keeps
 * the output readable when opened in Excel directly.
 */
const buildExcel = async ({ sheetName, columns, rows }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bareeq';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName || 'Sheet1');

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: typeof c.key === 'string' ? c.key : c.header,
    width: c.width || 20,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    const row = {};
    for (const c of columns) {
      const raw = typeof c.key === 'function' ? c.key(r) : r[c.key];
      const formatted = c.format ? c.format(raw, r) : raw;
      const display =
        formatted === null || formatted === undefined
          ? '—'
          : typeof formatted === 'boolean'
            ? formatted
              ? 'Yes'
              : 'No'
            : formatted;
      row[typeof c.key === 'string' ? c.key : c.header] = display;
    }
    sheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
};

/**
 * Bake a controller handler that streams an .xlsx response. The
 * caller passes `(req) => fetchRows(req)` and a column config; the
 * helper handles content-type / filename / buffering.
 */
const xlsxResponse = (res, buffer, filename) => {
  res
    .status(200)
    .setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(Buffer.from(buffer));
};

const todayStamp = () => new Date().toISOString().slice(0, 10);

module.exports = { buildExcel, xlsxResponse, todayStamp };
