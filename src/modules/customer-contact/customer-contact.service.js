const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Customer Contact-Us — twin of company-portal's contact flow, reusing the
 * shared ContactMessage model (keyed by userId, not company-specific). Kept
 * as its own module so the customer surface stays decoupled from the company
 * portal even though the storage is identical.
 */

/**
 * Public-facing shape for a ContactMessage row — identical to the company
 * serializer. The admin's identity (repliedByAdminId) is never leaked.
 */
const serializeContactMessage = (row) => ({
  id: row.id,
  email: row.email,
  phone: row.phone,
  message: row.message,
  status: row.status,
  reply: row.reply,
  repliedAt: row.repliedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Defensive re-check that the caller is still a live CUSTOMER before we
 * persist a row pointing at their user_id (the route already requireRole's it).
 */
const ensureCustomer = async (userId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER', deletedAt: null },
  });
  if (!user) throw ApiError.notFound('Customer not found');
  return user;
};

/**
 * POST /customer/contact — store a Contact-Us message from the customer.
 */
const submitContactMessage = async (userId, { email, phone, message }) => {
  const user = await ensureCustomer(userId);

  const row = await prisma.contactMessage.create({
    data: { userId: user.id, email, phone, message },
  });

  return serializeContactMessage(row);
};

/**
 * GET /customer/contact/my-messages — the caller's own message history
 * (newest first) with any admin replies inlined. `userId = req.user.id` is
 * the entire authorization.
 */
const listMyContactMessages = async (userId, { page = 1, limit = 20 }) => {
  const [items, total] = await prisma.$transaction([
    prisma.contactMessage.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contactMessage.count({ where: { userId, deletedAt: null } }),
  ]);

  return {
    items: items.map(serializeContactMessage),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = {
  submitContactMessage,
  listMyContactMessages,
};
