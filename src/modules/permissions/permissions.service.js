const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Read-only catalog. Permissions are seeded at deploy time
 * (see scripts/seed-permissions.js) and never edited via the API.
 *
 * The admin UI calls this endpoint to render the "pick permissions"
 * checklist when creating/editing a PermissionRole.
 */

const serializePermission = (p) => ({
  id: p.id,
  key: p.key,
  module: p.module,
  descriptionAr: p.descriptionAr,
  descriptionEn: p.descriptionEn,
});

/**
 * Returns either a flat list or a map grouped by module, depending on
 * the `groupByModule` flag. Grouped form is what the admin UI wants;
 * flat form is convenient for tooling.
 */
const listPermissions = async ({ groupByModule = true } = {}) => {
  const rows = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
  });

  const items = rows.map(serializePermission);

  if (!groupByModule) {
    return { items, total: items.length };
  }

  const grouped = items.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {});

  return { modules: grouped, total: items.length };
};

module.exports = { listPermissions };
