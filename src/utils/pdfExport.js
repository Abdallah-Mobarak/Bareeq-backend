const PDFDocument = require('pdfkit');

/**
 * Lightweight tabular PDF exporter — turns an array of records into a
 * single-page-or-more A4 PDF Buffer. Mirrors `excelExport.buildExcel`'s
 * API so callers can produce both formats from the same column config:
 *
 *   const buf = await buildPdf({
 *     title: 'Branches — May 2026',
 *     subtitle: 'Carrefour KSA',
 *     columns: [
 *       { header: 'Brand', key: 'brandName', width: 130 },
 *       { header: 'City',  key: 'city',      width: 80 },
 *       ...
 *     ],
 *     rows: branches,
 *   });
 *
 * Each `column` is { header, key, width?, format? }:
 *   - header: text shown on the table head row
 *   - key:    property name OR (record) => value
 *   - width:  optional column width in PDF points (default 80)
 *   - format: optional (value, record) => any formatter, applied after
 *             the key pull but before the cell is drawn
 *
 * Null/undefined render as '—' and booleans as 'Yes' / 'No' to match
 * the Excel exporter's behaviour exactly. The frontend can therefore
 * count on identical content in both files.
 */
const buildPdf = ({ title, subtitle, columns, rows }) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header / title block.
      doc.fontSize(16).text(title || 'Report', { align: 'center' });
      if (subtitle) doc.fontSize(10).text(subtitle, { align: 'center' });
      doc.fontSize(8).text(`Generated: ${new Date().toISOString()}`, { align: 'right' });
      doc.moveDown(0.5);

      const startX = doc.page.margins.left;
      const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Normalise widths so the row spans the page even if the caller
      // forgot to add explicit widths to every column.
      const widths = columns.map((c) => c.width || 80);
      const widthSum = widths.reduce((a, b) => a + b, 0);
      const scale = widthSum > 0 ? totalWidth / widthSum : 1;
      const colWidths = widths.map((w) => w * scale);

      const rowHeight = 18;
      let y = doc.y;

      const drawCell = (text, x, width, opts = {}) => {
        doc
          .fontSize(opts.bold ? 9 : 8)
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(text ?? '—'), x + 2, y + 4, {
            width: width - 4,
            ellipsis: true,
            lineBreak: false,
          });
      };

      const drawHeader = () => {
        let x = startX;
        // Header background — a thin filled rect that the cell text
        // paints over. Keeps the table readable on long reports.
        doc.save();
        doc.rect(startX, y, totalWidth, rowHeight).fillOpacity(0.08).fillAndStroke('#1f3a5f', '#1f3a5f');
        doc.restore();
        columns.forEach((c, i) => {
          drawCell(c.header, x, colWidths[i], { bold: true });
          x += colWidths[i];
        });
        y += rowHeight;
      };

      drawHeader();

      // Body rows. We paginate manually because pdfkit's `text` flow
      // doesn't know about our table layout.
      for (const r of rows) {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeader();
        }

        let x = startX;
        // Light horizontal separator under every row.
        doc.strokeColor('#dddddd').lineWidth(0.5);
        doc.moveTo(startX, y + rowHeight).lineTo(startX + totalWidth, y + rowHeight).stroke();

        for (let i = 0; i < columns.length; i++) {
          const c = columns[i];
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
          drawCell(display, x, colWidths[i]);
          x += colWidths[i];
        }
        y += rowHeight;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

const pdfResponse = (res, buffer, filename) => {
  res
    .status(200)
    .setHeader('Content-Type', 'application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(Buffer.from(buffer));
};

module.exports = { buildPdf, pdfResponse };
