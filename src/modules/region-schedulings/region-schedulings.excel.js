const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ApiError } = require('../../utils/ApiError');

/**
 * Excel column layout for Region Scheduling import/export.
 *
 * Required tasks are encoded as separate columns per visit type:
 *   tasks_v1, tasks_v2, tasks_v3, tasks_v4
 * Each cell holds a "|" or newline-separated list of task titles.
 * For bilingual cells we accept "AR :: EN" inside each task entry.
 *
 * The header row supports either Arabic or English labels — see
 * HEADER_ALIASES below. Case-insensitive matching after trim.
 */

const HEADER_ALIASES = {
  regionTitle: ['region title', 'region_title', 'عنوان المنطقة', 'عنوان_المنطقة'],
  companyName: ['company name', 'company_name', 'اسم الشركة', 'الشركة'],
  branchName: ['branch name', 'branch_name', 'اسم الفرع', 'الفرع'],
  categoryName: ['category name', 'category_name', 'الفئة', 'القسم'],
  branchNumber: ['branch number', 'branch_number', 'رقم الفرع'],
  city: ['city', 'المدينة'],
  region: ['region', 'المنطقة'],
  address: ['address', 'العنوان'],
  latitude: ['latitude', 'lat', 'خط العرض'],
  longitude: ['longitude', 'lng', 'lon', 'خط الطول'],
  numberOfVisits: ['number of visits', 'visits', 'عدد الزيارات'],
  code: ['code', 'الكود'],
  tasksV1: ['tasks_v1', 'tasks v1', 'مهام v1', 'مهام الزيارة الأولى'],
  tasksV2: ['tasks_v2', 'tasks v2', 'مهام v2', 'مهام الزيارة الثانية'],
  tasksV3: ['tasks_v3', 'tasks v3', 'مهام v3', 'مهام الزيارة الثالثة'],
  tasksV4: ['tasks_v4', 'tasks v4', 'مهام v4', 'مهام الزيارة الرابعة'],
};

const TASK_COLUMNS = ['tasksV1', 'tasksV2', 'tasksV3', 'tasksV4'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

const buildHeaderMap = (headerRow) => {
  const map = {}; // canonical -> column index
  headerRow.eachCell((cell, colIndex) => {
    const value = norm(cell.value);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm(a) === value)) {
        map[canonical] = colIndex;
        break;
      }
    }
  });
  return map;
};

/**
 * Parse a tasks-cell into [{ titleAr, titleEn }, ...].
 * Tasks are separated by "|" or newline. Each task may contain " :: "
 * to split Arabic and English titles. If only one side is given, we
 * default both to that string.
 */
const parseTaskCell = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(/\r?\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes('::')) {
        const [ar, en] = entry.split('::').map((s) => s.trim());
        return { titleAr: ar || en, titleEn: en || null };
      }
      return { titleAr: entry, titleEn: null };
    });
};

const cellValue = (row, colIndex) => {
  if (!colIndex) return null;
  const v = row.getCell(colIndex).value;
  if (v === null || v === undefined || v === '') return null;
  // ExcelJS sometimes returns rich-text or hyperlink objects for non-plain cells
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result !== undefined) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  }
  return v;
};

/**
 * Parse the uploaded Excel buffer into validated row payloads.
 * Returns { rows, errors }. The caller decides whether to commit or
 * surface errors to the admin.
 */
const parseExcelBuffer = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw ApiError.badRequest('The uploaded file has no sheets');
  }

  const headerRow = sheet.getRow(1);
  const headerMap = buildHeaderMap(headerRow);

  const required = ['regionTitle', 'companyName', 'branchName', 'city', 'region', 'numberOfVisits'];
  const missing = required.filter((k) => !headerMap[k]);
  if (missing.length > 0) {
    throw ApiError.badRequest('Missing required columns', { missing });
  }

  const rows = [];
  const errors = [];

  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const row = sheet.getRow(i);
    if (!row.hasValues) continue;

    const get = (k) => cellValue(row, headerMap[k]);
    const numberOfVisits = Number(get('numberOfVisits'));

    if (!get('regionTitle') || !get('companyName') || !get('branchName')) {
      // Skip blank-ish rows silently — don't error on them
      const looksBlank = !get('regionTitle') && !get('companyName') && !get('branchName');
      if (looksBlank) continue;
    }

    const rowErrors = [];
    if (!get('regionTitle')) rowErrors.push('regionTitle is required');
    if (!get('companyName')) rowErrors.push('companyName is required');
    if (!get('branchName')) rowErrors.push('branchName is required');
    if (!get('city')) rowErrors.push('city is required');
    if (!get('region')) rowErrors.push('region is required');
    if (!Number.isInteger(numberOfVisits) || numberOfVisits < 1 || numberOfVisits > 4) {
      rowErrors.push('numberOfVisits must be an integer 1..4');
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber: i, errors: rowErrors });
      continue;
    }

    const requiredTasks = [];
    TASK_COLUMNS.forEach((tcol, idx) => {
      const tasks = parseTaskCell(get(tcol));
      const visitType = idx + 1;
      if (visitType > numberOfVisits && tasks.length > 0) {
        rowErrors.push(
          `tasks_v${visitType} provided but numberOfVisits=${numberOfVisits}`,
        );
        return;
      }
      tasks.forEach((t, sortOrder) => {
        requiredTasks.push({ visitType, ...t, sortOrder });
      });
    });

    if (rowErrors.length > 0) {
      errors.push({ rowNumber: i, errors: rowErrors });
      continue;
    }

    const lat = get('latitude');
    const lng = get('longitude');

    rows.push({
      regionTitle: String(get('regionTitle')).trim(),
      companyName: String(get('companyName')).trim(),
      branchName: String(get('branchName')).trim(),
      categoryName: get('categoryName') ? String(get('categoryName')).trim() : null,
      branchNumber: get('branchNumber') ? String(get('branchNumber')).trim() : null,
      city: String(get('city')).trim(),
      region: String(get('region')).trim(),
      address: get('address') ? String(get('address')).trim() : null,
      latitude: lat !== null && lat !== '' ? Number(lat) : null,
      longitude: lng !== null && lng !== '' ? Number(lng) : null,
      numberOfVisits,
      code: get('code') ? String(get('code')).trim() : null,
      requiredTasks,
    });
  }

  return { rows, errors };
};

/**
 * Build an .xlsx Buffer from a list of region scheduling records
 * (in the serialised shape returned by the service layer).
 */
const buildExcelBuffer = async (records) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bareeq';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Region Schedulings');

  sheet.columns = [
    { header: 'Region Title', key: 'regionTitle', width: 25 },
    { header: 'Company Name', key: 'companyName', width: 25 },
    { header: 'Branch Name', key: 'branchName', width: 25 },
    { header: 'Category Name', key: 'categoryName', width: 20 },
    { header: 'Branch Number', key: 'branchNumber', width: 15 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Region', key: 'region', width: 15 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Latitude', key: 'latitude', width: 12 },
    { header: 'Longitude', key: 'longitude', width: 12 },
    { header: 'Number of Visits', key: 'numberOfVisits', width: 16 },
    { header: 'Code', key: 'code', width: 15 },
    { header: 'tasks_v1', key: 'tasksV1', width: 30 },
    { header: 'tasks_v2', key: 'tasksV2', width: 30 },
    { header: 'tasks_v3', key: 'tasksV3', width: 30 },
    { header: 'tasks_v4', key: 'tasksV4', width: 30 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const r of records) {
    const tasksByVisit = { 1: [], 2: [], 3: [], 4: [] };
    (r.requiredTasks || []).forEach((t) => {
      const label = t.titleEn ? `${t.titleAr} :: ${t.titleEn}` : t.titleAr;
      tasksByVisit[t.visitType]?.push(label);
    });

    sheet.addRow({
      regionTitle: r.regionTitle,
      companyName: r.companyName,
      branchName: r.branchName,
      categoryName: r.categoryName,
      branchNumber: r.branchNumber,
      city: r.city,
      region: r.region,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      numberOfVisits: r.numberOfVisits,
      code: r.code,
      tasksV1: tasksByVisit[1].join(' | '),
      tasksV2: tasksByVisit[2].join(' | '),
      tasksV3: tasksByVisit[3].join(' | '),
      tasksV4: tasksByVisit[4].join(' | '),
    });
  }

  return workbook.xlsx.writeBuffer();
};

/**
 * Build a PDF Buffer for the same records. Simple table layout —
 * Arabic shaping is left to the PDF reader's font rendering, which
 * is good enough for an admin-facing dump. (Prettier reports go
 * through the per-record PDF endpoint later.)
 */
const buildPdfBuffer = (records) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Bareeq — Region Schedulings', { align: 'center' });
    doc.moveDown();
    doc.fontSize(9);

    records.forEach((r, idx) => {
      if (idx > 0) doc.moveDown(0.5);
      doc
        .font('Helvetica-Bold')
        .text(`${idx + 1}. ${r.companyName} — ${r.branchName} (V1..V${r.numberOfVisits})`);
      doc
        .font('Helvetica')
        .text(`Region: ${r.region}   City: ${r.city}   Code: ${r.code || '—'}`);
      if (r.address) doc.text(`Address: ${r.address}`);
      if (r.requiredTasks?.length) {
        const lines = r.requiredTasks
          .map((t) => `  V${t.visitType}: ${t.titleEn || t.titleAr}`)
          .join('\n');
        doc.text(lines);
      }
    });

    doc.end();
  });

module.exports = {
  parseExcelBuffer,
  buildExcelBuffer,
  buildPdfBuffer,
};
