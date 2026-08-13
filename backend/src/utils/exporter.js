import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Escape a value for CSV.
function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// columns: [{ header, key, width? }]  rows: array of plain objects
function sendCsv(res, { filename, columns, rows }) {
  const header = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(`${header}\n${body}\n`);
}

async function sendXlsx(res, { filename, title, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title || 'Report');
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function sendPdf(res, { filename, title, columns, rows }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text(title || 'Report', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#666').text(`Generated ${new Date().toLocaleString()} · ${rows.length} rows`);
  doc.moveDown(0.6);
  doc.fillColor('#000');

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / columns.length;
  const startX = doc.page.margins.left;
  let y = doc.y;

  const drawRow = (values, opts = {}) => {
    const { bold = false, fontSize = 8 } = opts;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const rowHeight = 16;
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    values.forEach((val, i) => {
      doc.text(String(val ?? ''), startX + i * colWidth + 2, y + 3, {
        width: colWidth - 4,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false,
      });
    });
    doc.moveTo(startX, y + rowHeight).lineTo(startX + pageWidth, y + rowHeight).strokeColor('#e6e8f0').stroke();
    y += rowHeight;
  };

  drawRow(columns.map((c) => c.header), { bold: true });
  rows.forEach((r) => drawRow(columns.map((c) => r[c.key])));

  doc.end();
}

// Dispatch by ?format=. Defaults to csv.
export async function sendExport(res, format, payload) {
  switch ((format || 'csv').toLowerCase()) {
    case 'xlsx':
    case 'excel':
      return sendXlsx(res, payload);
    case 'pdf':
      return sendPdf(res, payload);
    default:
      return sendCsv(res, payload);
  }
}
