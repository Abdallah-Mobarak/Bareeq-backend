const { asyncHandler } = require('../../utils/asyncHandler');
const permissionsService = require('./permissions.service');

/**
 * GET /permissions — admin only.
 * Returns the static permission catalog so the admin UI can build
 * the role editor.
 */
const list = asyncHandler(async (req, res) => {
  const result = await permissionsService.listPermissions(req.validatedQuery);
  res.json({ success: true, data: result });
});

module.exports = { list };
