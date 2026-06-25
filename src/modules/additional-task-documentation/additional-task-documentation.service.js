const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/env');

/**
 * Additional-Task Documentation — FRD §1.4.4.1 / §3.9.6.
 *
 * Same OTP flow as the regular visit documentation (visit-documentation
 * module), but on the AdditionalTask table:
 *   1. Supervisor sends a 4-digit OTP to the branch manager's phone +
 *      generates a public documentation URL (long random slug).
 *   2. Branch manager opens the URL (no auth) — sees the task details +
 *      photos; fills jobNumber + rating + comments.
 *   3. Branch manager reads the OTP off their SMS to the supervisor.
 *   4. Supervisor types the OTP into the app → /verify-otp.
 *      If correct → documentationStatus = DOCUMENTED.
 *
 * MVP: no SMS provider. The OTP + link are logged and returned in the
 * response for development testing — same convention as visit-documentation.
 */

const OTP_TTL_MINUTES = 30;
const TOKEN_BYTES = 24;

const generateOtp = () => String(crypto.randomInt(0, 10_000)).padStart(4, '0');
const generateToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * Stub SMS dispatch — logs the OTP + link so the flow is testable without
 * a real provider. Replace the body when wiring Twilio / Unifonic / etc.
 */
const dispatchOtp = ({ phone, otp, documentationUrl }) => {
  logger.info(
    { phone, otp, documentationUrl },
    '[MOCK SMS] Additional-task OTP + documentation link (replace with real provider)',
  );
};

const buildPublicUrl = (token) => {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/api/v1/public/additional-task-document/${token}`;
};

/** Load a task scoped to the calling supervisor (404 if out-of-scope). */
const loadOwnedTask = async (taskId, supervisorId) => {
  const task = await prisma.additionalTask.findFirst({
    where: { id: taskId, supervisorId, deletedAt: null },
  });
  if (!task) throw ApiError.notFound('Additional task not found');
  return task;
};

/**
 * POST /supervisor/additional-tasks/:id/document/send-otp
 * Only allowed once status = IMPLEMENTED. Re-callable: each call
 * regenerates the OTP + token (the previous OTP is invalidated).
 */
const sendOtp = async (taskId, supervisorId, { branchManagerPhone }) => {
  const task = await loadOwnedTask(taskId, supervisorId);

  if (task.status !== 'IMPLEMENTED') {
    throw ApiError.conflict(
      `OTP can only be sent once the task is IMPLEMENTED (currently ${task.status})`,
    );
  }
  if (task.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('Task is already documented');
  }

  const otp = generateOtp();
  const otpHash = await password.hash(otp);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.additionalTask.update({
    where: { id: taskId },
    data: {
      branchManagerPhone,
      documentationOtpHash: otpHash,
      otpExpiresAt: expiresAt,
      documentationToken: token,
    },
  });

  const documentationUrl = buildPublicUrl(token);
  dispatchOtp({ phone: branchManagerPhone, otp, documentationUrl });

  logger.info({ taskId, supervisorId, branchManagerPhone }, 'Additional-task documentation OTP issued');

  return {
    additionalTaskId: taskId,
    branchManagerPhone,
    documentationUrl,
    otp,
    otpExpiresAt: expiresAt,
    devNote:
      'OTP and link are returned here ONLY in MVP. Replace dispatchOtp() with a real SMS provider before production.',
  };
};

/**
 * POST /supervisor/additional-tasks/:id/document/verify-otp
 * Supervisor confirms the OTP the branch manager received. If valid,
 * the task is marked DOCUMENTED.
 */
const verifyOtp = async (taskId, supervisorId, { otp }) => {
  const task = await loadOwnedTask(taskId, supervisorId);

  if (!task.documentationOtpHash || !task.otpExpiresAt) {
    throw ApiError.badRequest('No OTP has been issued for this task yet');
  }
  if (task.otpExpiresAt < new Date()) {
    throw ApiError.badRequest('OTP has expired; send a new one');
  }
  if (task.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('Task is already documented');
  }

  // OTP_TEST_MODE master-code bypass (default 0000) — gated behind the flag,
  // turn OFF before launch. Mirrors visit-documentation.
  const masterBypass = config.otpTestMode && otp === config.otpTestCode;
  if (masterBypass) {
    logger.warn({ taskId }, 'OTP_TEST_MODE master code accepted — disable before launch');
  }
  const ok = masterBypass || (await password.compare(otp, task.documentationOtpHash));
  if (!ok) {
    throw ApiError.badRequest('Invalid OTP');
  }

  const now = new Date();
  await prisma.additionalTask.update({
    where: { id: taskId },
    data: {
      documentationStatus: 'DOCUMENTED',
      documentedAt: now,
      // Burn the OTP on success — single-use.
      documentationOtpHash: null,
      otpExpiresAt: null,
    },
  });

  logger.info({ taskId, supervisorId }, 'Additional task marked DOCUMENTED');

  return { additionalTaskId: taskId, documentationStatus: 'DOCUMENTED', documentedAt: now };
};

/**
 * Public reads — branch manager view via the long-slug URL. No JWT, the
 * slug is the capability token.
 */
const loadByToken = async (token) => {
  const task = await prisma.additionalTask.findFirst({
    where: { documentationToken: token, deletedAt: null },
    include: {
      supervisor: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
      photos: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
      taskChecks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!task) {
    throw ApiError.notFound('Documentation link not found or has been revoked');
  }
  return task;
};

const serializePublic = (task) => ({
  task: {
    id: task.id,
    visitDate: task.visitDate,
    status: task.status,
    documentationStatus: task.documentationStatus,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    durationSeconds: task.durationSeconds,
    jobNumber: task.jobNumber,
    rating: task.rating,
    comments: task.comments,
    documentedAt: task.documentedAt,
  },
  branch: {
    companyName: task.companyName,
    branchName: task.branchName,
    categoryName: task.categoryName,
    address: task.address,
    location: task.location,
    latitude: task.latitude,
    longitude: task.longitude,
  },
  supervisor: task.supervisor
    ? { nameAr: task.supervisor.nameAr, nameEn: task.supervisor.nameEn, phone: task.supervisor.phone }
    : null,
  photos: task.photos.map((p) => ({ id: p.id, url: p.url })),
  // FRD §1.4.4.1 — the public link shows the required tasks + Done/Not Done.
  taskChecks: (task.taskChecks || []).map((c) => ({
    titleAr: c.titleAr,
    titleEn: c.titleEn,
    done: c.done,
  })),
});

const getPublicView = async (token) => {
  const task = await loadByToken(token);
  return serializePublic(task);
};

/**
 * POST /public/additional-task-document/:token/submit
 * Branch manager fills jobNumber / rating / comments. Stored as-is;
 * status stays UNDOCUMENTED until the supervisor verifies the OTP.
 */
const submitPublic = async (token, payload) => {
  const task = await loadByToken(token);

  if (task.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('This task has already been documented');
  }

  await prisma.additionalTask.update({
    where: { id: task.id },
    data: {
      jobNumber: payload.jobNumber || null,
      rating: payload.rating,
      comments: payload.comments || null,
    },
  });

  logger.info({ additionalTaskId: task.id, rating: payload.rating }, 'Branch manager submitted additional-task documentation');

  const reread = await loadByToken(token);
  return serializePublic(reread);
};

/** GET /public/additional-task-document/:token/pdf — printable receipt. */
const buildPdf = (data) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Additional Task Documentation', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();

      doc.fontSize(12).text('Branch', { underline: true });
      doc
        .fontSize(10)
        .text(`Company: ${data.branch.companyName}`)
        .text(`Branch:  ${data.branch.branchName || '-'}`)
        .text(`Category: ${data.branch.categoryName || '-'}`)
        .text(`Address: ${data.branch.address || '-'}`);
      doc.moveDown();

      doc.fontSize(12).text('Task', { underline: true });
      doc
        .fontSize(10)
        .text(`Visit Date: ${data.task.visitDate}`)
        .text(`Status:     ${data.task.status}`)
        .text(`Started:    ${data.task.startedAt || '-'}`)
        .text(`Ended:      ${data.task.endedAt || '-'}`)
        .text(
          `Duration:   ${
            data.task.durationSeconds ? `${Math.round(data.task.durationSeconds / 60)} minutes` : '-'
          }`,
        );
      doc.moveDown();

      if (data.supervisor) {
        doc.fontSize(12).text('Supervisor', { underline: true });
        doc
          .fontSize(10)
          .text(`Name:  ${data.supervisor.nameAr}${data.supervisor.nameEn ? ` (${data.supervisor.nameEn})` : ''}`)
          .text(`Phone: ${data.supervisor.phone || '-'}`);
        doc.moveDown();
      }

      if (data.taskChecks.length > 0) {
        doc.fontSize(12).text('Required Tasks', { underline: true });
        data.taskChecks.forEach((t) => {
          doc.fontSize(10).text(`  [${t.done ? 'X' : ' '}] ${t.titleAr}${t.titleEn ? ` / ${t.titleEn}` : ''}`);
        });
        doc.moveDown();
      }

      doc.fontSize(12).text('Documentation', { underline: true });
      doc
        .fontSize(10)
        .text(`Status:   ${data.task.documentationStatus}`)
        .text(`Job #:    ${data.task.jobNumber || '-'}`)
        .text(`Rating:   ${data.task.rating ? `${data.task.rating} / 5` : '-'}`)
        .text(`Comments: ${data.task.comments || '-'}`);
      doc.moveDown();

      if (data.photos.length > 0) {
        doc.fontSize(12).text(`Photos (${data.photos.length})`, { underline: true });
        data.photos.forEach((p) => doc.fontSize(8).text(p.url));
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

const getPdfBuffer = async (token) => {
  const task = await loadByToken(token);
  return buildPdf(serializePublic(task));
};

module.exports = {
  sendOtp,
  verifyOtp,
  getPublicView,
  submitPublic,
  getPdfBuffer,
};
