const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');

/**
 * Admin-side Contact-Us management — FRD §4.12.
 *
 * Closes the loop opened by /company/contact (FRD §2.4 + FR-63):
 *   1. COMPANY_USER / AM submits → row in `contact_messages` (status PENDING)
 *   2. Admin lists / reads here
 *   3. Admin posts a reply → status flips to REPLIED
 *   4. User pulls /company/contact/my-messages and sees the reply
 *
 * No notifications fired yet — that's a Sprint 3 cross-cutting concern.
 * For now the user has to poll. Adding the notification hook later is
 * one line in `replyToMessage` once the notifications module exists.
 */

const serializeMessage = (m) => ({
  id: m.id,
  sender: m.user
    ? {
        id: m.user.id,
        role: m.user.role,
        nameAr: m.user.nameAr,
        nameEn: m.user.nameEn,
        company: m.user.company
          ? { id: m.user.company.id, nameAr: m.user.company.nameAr, nameEn: m.user.company.nameEn }
          : null,
      }
    : null,
  email: m.email,
  phone: m.phone,
  message: m.message,
  status: m.status,
  reply: m.reply,
  repliedAt: m.repliedAt,
  repliedBy: m.repliedBy
    ? { id: m.repliedBy.id, nameAr: m.repliedBy.nameAr, nameEn: m.repliedBy.nameEn }
    : null,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

const buildWhere = (q) => {
  const where = { deletedAt: null };
  if (q.status) where.status = q.status;
  if (q.email) where.email = { contains: q.email, mode: 'insensitive' };
  if (q.userRole) {
    where.user = { role: q.userRole };
  }
  return where;
};

/**
 * GET /admin/contact-messages — FRD §4.12.1.
 * Newest first by default so the admin lands on what needs attention.
 */
const listMessages = async (rawQuery) => {
  const { page = 1, limit = 20, sort = 'newest', ...filters } = rawQuery;
  const where = buildWhere(filters);

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  const [items, total] = await prisma.$transaction([
    prisma.contactMessage.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            role: true,
            nameAr: true,
            nameEn: true,
            company: { select: { id: true, nameAr: true, nameEn: true } },
          },
        },
        repliedBy: { select: { id: true, nameAr: true, nameEn: true } },
      },
    }),
    prisma.contactMessage.count({ where }),
  ]);

  return {
    items: items.map(serializeMessage),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * GET /admin/contact-messages/:id — full detail view.
 */
const getMessageById = async (id) => {
  const m = await prisma.contactMessage.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          nameAr: true,
          nameEn: true,
          company: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
      repliedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!m) throw ApiError.notFound('Message not found');
  return serializeMessage(m);
};

/**
 * POST /admin/contact-messages/:id/reply — FRD §4.12.2.
 * Stamps the reply text, flips status to REPLIED, records the admin
 * who replied. Allowed on already-REPLIED messages too (re-reply) —
 * the admin may want to correct or extend their answer; the FRD
 * doesn't pin this down, but re-reply is the safer default than
 * locking the message after one response.
 */
const replyToMessage = async (adminId, id, { reply }) => {
  const existing = await prisma.contactMessage.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Message not found');

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: {
      reply,
      repliedAt: new Date(),
      repliedByAdminId: adminId,
      status: 'REPLIED',
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          nameAr: true,
          nameEn: true,
          company: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
      repliedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  return serializeMessage(updated);
};

/**
 * DELETE /admin/contact-messages/:id — soft delete so audit history
 * survives. Useful for clearing spam or test rows.
 */
const deleteMessage = async (id) => {
  const existing = await prisma.contactMessage.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Message not found');

  await prisma.contactMessage.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

module.exports = {
  listMessages,
  getMessageById,
  replyToMessage,
  deleteMessage,
};
