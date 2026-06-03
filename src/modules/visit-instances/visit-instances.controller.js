const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./visit-instances.service');

const getOne = asyncHandler(async (req, res) => {
  const data = await service.getVisit(req.params.id, req.user.id);
  res.json({ success: true, data });
});

const start = asyncHandler(async (req, res) => {
  const data = await service.startVisit(req.params.id, req.user.id, req.body);
  res.json({ success: true, data });
});

const finalClosed = asyncHandler(async (req, res) => {
  const data = await service.finalClosedVisit(req.params.id, req.user.id);
  res.json({ success: true, data });
});

const notImplemented = asyncHandler(async (req, res) => {
  const data = await service.notImplementedVisit(req.params.id, req.user.id, req.body);
  res.json({ success: true, data });
});

const complete = asyncHandler(async (req, res) => {
  const data = await service.completeVisit(req.params.id, req.user.id, req.body);
  res.json({ success: true, data });
});

const toggleTask = asyncHandler(async (req, res) => {
  const data = await service.toggleTaskCheck(
    req.params.id,
    req.params.taskCheckId,
    req.user.id,
    req.body,
  );
  res.json({ success: true, data });
});

const uploadPhotos = asyncHandler(async (req, res) => {
  const data = await service.addPhotos(req.params.id, req.user.id, req.files);
  res.json({ success: true, data });
});

const removePhoto = asyncHandler(async (req, res) => {
  const data = await service.deletePhoto(
    req.params.id,
    req.params.photoId,
    req.user.id,
  );
  res.json({ success: true, data });
});

module.exports = {
  getOne,
  start,
  finalClosed,
  notImplemented,
  complete,
  toggleTask,
  uploadPhotos,
  removePhoto,
};
