const { prisma } = require('../../infrastructure/database/prisma');

/**
 * Public-readable system settings — FRD §1.1 / §2.1 marketplace
 * ("view Privacy Policy", "contact admin via Email/Phone") and the
 * Companies §2.4 Contact Us channels.
 *
 * Settings come from the same SystemSetting table the admin manages.
 * We expose ONLY a whitelisted subset so an admin can't accidentally
 * leak an internal flag by giving it a clever key.
 *
 * Keys are stored snake_case in the DB; we project them to
 * camelCase in the response to match the rest of the public API.
 */
const PUBLIC_KEYS = {
  privacy_policy_ar: 'privacyPolicyAr',
  privacy_policy_en: 'privacyPolicyEn',
  contact_email: 'contactEmail',
  contact_phone: 'contactPhone',
  contact_whatsapp: 'contactWhatsapp',
  contact_facebook: 'contactFacebook',
};

const getPublic = async () => {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.keys(PUBLIC_KEYS) } },
    select: { key: true, value: true },
  });

  /**
   * Build an object pre-seeded with empty strings so the FE always
   * sees a stable shape — never undefined for a known field.
   */
  const settings = Object.fromEntries(Object.values(PUBLIC_KEYS).map((k) => [k, '']));
  for (const r of rows) {
    const camelKey = PUBLIC_KEYS[r.key];
    if (camelKey) settings[camelKey] = r.value;
  }

  return settings;
};

module.exports = { getPublic, PUBLIC_KEYS };
