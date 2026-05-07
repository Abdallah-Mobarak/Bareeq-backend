const { asyncHandler } = require('../../utils/asyncHandler');
const { ApiError } = require('../../utils/ApiError');
const service = require('./region-schedulings.service');
const excel = require('./region-schedulings.excel');

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.body);
  res.status(201).json({ success: true, data: { regionScheduling: item } });
});

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.validatedQuery);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const item = await service.getOne(req.params.id);
  res.json({ success: true, data: { regionScheduling: item } });
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.body);
  res.json({ success: true, data: { regionScheduling: item } });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, data: { message: 'Region scheduling deleted' } });
});

/**
 * POST /region-schedulings/import — multipart/form-data, field name "file".
 *
 * Two-pass: parse + validate the whole sheet first, then commit. If any
 * row has an error, nothing is inserted and the admin gets the full
 * error report — far easier to fix in Excel than to chase one-by-one.
 */
const importExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded (expected field "file")');
  }

  const { rows, errors } = await excel.parseExcelBuffer(req.file.buffer);

  if (errors.length > 0) {
    throw ApiError.unprocessable('The Excel file contains invalid rows', { errors });
  }
  if (rows.length === 0) {
    throw ApiError.badRequest('No data rows found in the file');
  }

  const created = await service.createMany(rows);
  res.status(201).json({
    success: true,
    data: {
      message: `${created.length} region scheduling records imported`,
      count: created.length,
    },
  });
});

/**
 * GET /region-schedulings/export.xlsx
 * Honours the same filter query string as GET /region-schedulings,
 * but ignores pagination — exports everything that matches.
 */
const exportExcel = asyncHandler(async (req, res) => {
  const all = await service.list({ ...req.validatedQuery, page: 1, limit: 10000 });
  const buffer = await excel.buildExcelBuffer(all.items);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="region-schedulings.xlsx"');
  res.send(Buffer.from(buffer));
});

const exportPdf = asyncHandler(async (req, res) => {
  const all = await service.list({ ...req.validatedQuery, page: 1, limit: 10000 });
  const buffer = await excel.buildPdfBuffer(all.items);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="region-schedulings.pdf"');
  res.send(buffer);
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  importExcel,
  exportExcel,
  exportPdf,
};
