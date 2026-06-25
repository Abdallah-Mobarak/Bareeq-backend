const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./additional-task-documentation.service');

const sendOtp = asyncHandler(async (req, res) => {
  const data = await service.sendOtp(req.params.id, req.user.id, req.body);
  res.json({ success: true, data });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const data = await service.verifyOtp(req.params.id, req.user.id, req.body);
  res.json({ success: true, data });
});

const publicView = asyncHandler(async (req, res) => {
  const data = await service.getPublicView(req.params.token);
  res.json({ success: true, data });
});

const publicSubmit = asyncHandler(async (req, res) => {
  const data = await service.submitPublic(req.params.token, req.body);
  res.json({ success: true, data });
});

const publicPdf = asyncHandler(async (req, res) => {
  const buffer = await service.getPdfBuffer(req.params.token);
  res
    .status(200)
    .setHeader('Content-Type', 'application/pdf')
    .setHeader(
      'Content-Disposition',
      `attachment; filename="additional-task-${req.params.token.slice(0, 8)}.pdf"`,
    )
    .send(buffer);
});

module.exports = { sendOtp, verifyOtp, publicView, publicSubmit, publicPdf };
