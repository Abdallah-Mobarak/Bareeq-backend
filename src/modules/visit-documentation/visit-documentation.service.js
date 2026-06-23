const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');

const { prisma } = require('../../infrastructure/database/prisma');
const { ApiError } = require('../../utils/ApiError');
const password = require('../../utils/password');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/env');

/**
 * Visit Documentation — FRD §1.2.3.1 §2.5.
 *
 * Flow:
 *   1. Supervisor sends OTP (4 digits) to the branch manager's phone +
 *      generates a public documentation URL (long random slug).
 *   2. Branch manager opens the URL — no auth, no JWT, just the slug.
 *      Sees the visit details; can fill jobNumber + rating + comments.
 *   3. Branch manager submits → answers stored. Status stays
 *      UNDOCUMENTED until step 4.
 *   4. Branch manager reads the OTP off their SMS to the supervisor.
 *   5. Supervisor types the OTP into the mobile app → /verify-otp.
 *      If correct → documentationStatus = DOCUMENTED.
 *
 * MVP: no SMS provider. The OTP is logged + returned in the response
 * for development testing. Same for the documentation URL. When we
 * wire a real provider, only `dispatchOtp` changes.
 */

const OTP_TTL_MINUTES = 30;
const TOKEN_BYTES = 24; // 32-char base64url ≈ enough randomness

const generateOtp = () =>
  String(crypto.randomInt(0, 10_000)).padStart(4, '0');

const generateToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * Stub SMS dispatch. Logs the OTP + link so a developer can test the
 * flow without a real provider. Replace this function body when we
 * integrate Twilio / Unifonic / Infobip / WhatsApp Business.
 */
const dispatchOtp = ({ phone, otp, documentationUrl }) => {
  logger.info(
    { phone, otp, documentationUrl },
    '[MOCK SMS] OTP + documentation link (replace with real provider)',
  );
  // In production: await smsProvider.send(phone, message)
};

const loadOwnedInstance = async (visitInstanceId, supervisorId) => {
  const inst = await prisma.visitInstance.findFirst({
    where: {
      id: visitInstanceId,
      deletedAt: null,
      scheduledVisit: {
        deletedAt: null,
        monthlySchedule: { supervisorId, deletedAt: null },
      },
    },
  });
  if (!inst) {
    throw ApiError.notFound('Visit instance not found');
  }
  return inst;
};

/**
 * POST /visit-instances/:id/document/send-otp
 * Only allowed once status = IMPLEMENTED. Re-callable: each call
 * regenerates OTP + token (the previous OTP is invalidated by hash
 * replacement).
 */
const sendOtp = async (visitInstanceId, supervisorId, { branchManagerPhone }) => {
  const inst = await loadOwnedInstance(visitInstanceId, supervisorId);

  if (inst.status !== 'IMPLEMENTED') {
    throw ApiError.conflict(
      `OTP can only be sent once the visit is IMPLEMENTED (currently ${inst.status})`,
    );
  }
  if (inst.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('Visit is already documented');
  }

  const otp = generateOtp();
  const otpHash = await password.hash(otp);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.visitInstance.update({
    where: { id: visitInstanceId },
    data: {
      branchManagerPhone,
      documentationOtpHash: otpHash,
      otpExpiresAt: expiresAt,
      documentationToken: token,
    },
  });

  const documentationUrl = buildPublicUrl(token);
  dispatchOtp({ phone: branchManagerPhone, otp, documentationUrl });

  logger.info(
    { visitInstanceId, supervisorId, branchManagerPhone },
    'Documentation OTP issued',
  );

  /**
   * MVP: return the OTP and link in the response so the supervisor can
   * read them out during testing. In production we'd return only the
   * link (or just success), since the OTP arrives via SMS.
   */
  return {
    visitInstanceId,
    branchManagerPhone,
    documentationUrl,
    otp,
    otpExpiresAt: expiresAt,
    devNote:
      'OTP and link are returned here ONLY in MVP. Replace dispatchOtp() with a real SMS provider before production.',
  };
};

/**
 * POST /visit-instances/:id/document/verify-otp
 * Supervisor confirms the OTP the branch manager received. If valid,
 * the visit is marked DOCUMENTED.
 */
const verifyOtp = async (visitInstanceId, supervisorId, { otp }) => {
  const inst = await loadOwnedInstance(visitInstanceId, supervisorId);

  if (!inst.documentationOtpHash || !inst.otpExpiresAt) {
    throw ApiError.badRequest('No OTP has been issued for this visit yet');
  }
  if (inst.otpExpiresAt < new Date()) {
    throw ApiError.badRequest('OTP has expired; send a new one');
  }
  if (inst.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('Visit is already documented');
  }

  // OTP_TEST_MODE master-code bypass — accept the fixed test code (default
  // 0000) so a test build can clear the documentation OTP screen with no SMS.
  // SECURITY: gated behind OTP_TEST_MODE; turn OFF before launch.
  const masterBypass = config.otpTestMode && otp === config.otpTestCode;
  if (masterBypass) {
    logger.warn({ visitInstanceId }, 'OTP_TEST_MODE master code accepted — disable before launch');
  }
  const ok = masterBypass || (await password.compare(otp, inst.documentationOtpHash));
  if (!ok) {
    throw ApiError.badRequest('Invalid OTP');
  }

  const now = new Date();
  await prisma.visitInstance.update({
    where: { id: visitInstanceId },
    data: {
      documentationStatus: 'DOCUMENTED',
      documentedAt: now,
      // Burn the OTP on success — single-use.
      documentationOtpHash: null,
      otpExpiresAt: null,
    },
  });

  logger.info({ visitInstanceId, supervisorId }, 'Visit marked DOCUMENTED');

  return { visitInstanceId, documentationStatus: 'DOCUMENTED', documentedAt: now };
};

/**
 * Public reads — branch manager view via long-slug URL. No JWT, just
 * the slug acts as a capability token. We return the visit details
 * + tasks + photos + the supervisor's basic info.
 */
const loadByToken = async (token) => {
  const inst = await prisma.visitInstance.findFirst({
    where: { documentationToken: token, deletedAt: null },
    include: {
      scheduledVisit: {
        include: {
          monthlySchedule: {
            include: {
              supervisor: { select: { id: true, nameAr: true, nameEn: true, phone: true } },
            },
          },
          regionScheduling: {
            include: {
              requiredTasks: {
                orderBy: [{ visitType: 'asc' }, { sortOrder: 'asc' }],
              },
            },
          },
        },
      },
      photos: { where: { deletedAt: null }, orderBy: { uploadedAt: 'asc' } },
      taskChecks: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!inst) {
    throw ApiError.notFound('Documentation link not found or has been revoked');
  }
  return inst;
};

const serializePublic = (inst) => {
  const rs = inst.scheduledVisit.regionScheduling;
  const sup = inst.scheduledVisit.monthlySchedule.supervisor;
  return {
    visit: {
      id: inst.id,
      visitOrder: inst.visitOrder,
      visitType: `V${inst.visitOrder}`,
      scheduledDate: inst.scheduledDate,
      status: inst.status,
      documentationStatus: inst.documentationStatus,
      startedAt: inst.startedAt,
      endedAt: inst.endedAt,
      durationSeconds: inst.durationSeconds,
      jobNumber: inst.jobNumber,
      rating: inst.rating,
      comments: inst.comments,
      documentedAt: inst.documentedAt,
    },
    branch: {
      branchName: rs.branchName,
      categoryName: rs.categoryName,
      branchNumber: rs.branchNumber,
      city: rs.city,
      region: rs.region,
      address: rs.address,
      latitude: rs.latitude,
      longitude: rs.longitude,
      code: rs.code,
    },
    company: { name: rs.companyName },
    supervisor: { nameAr: sup.nameAr, nameEn: sup.nameEn, phone: sup.phone },
    photos: inst.photos.map((p) => ({ id: p.id, url: p.url })),
    taskChecks: inst.taskChecks.map((tc) => ({
      titleAr: tc.titleAr,
      titleEn: tc.titleEn,
      done: tc.done,
    })),
  };
};

const getPublicView = async (token) => {
  const inst = await loadByToken(token);
  return serializePublic(inst);
};

/**
 * POST /public/document/:token/submit
 * Branch manager fills jobNumber / rating / comments. Stored as-is;
 * status stays UNDOCUMENTED until the supervisor verifies the OTP.
 */
const submitPublic = async (token, payload) => {
  const inst = await loadByToken(token);

  if (inst.documentationStatus === 'DOCUMENTED') {
    throw ApiError.conflict('This visit has already been documented');
  }

  await prisma.visitInstance.update({
    where: { id: inst.id },
    data: {
      jobNumber: payload.jobNumber || null,
      rating: payload.rating,
      comments: payload.comments || null,
    },
  });

  logger.info(
    { visitInstanceId: inst.id, rating: payload.rating },
    'Branch manager submitted documentation form',
  );

  // Re-read for fresh data
  const reread = await loadByToken(token);
  return serializePublic(reread);
};

/**
 * GET /public/document/:token/pdf
 * Generate a printable receipt for the branch manager. Streamed back
 * to the caller as application/pdf.
 */
const buildPdf = (data) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Visit Documentation', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();

      doc.fontSize(12).text('Branch', { underline: true });
      doc
        .fontSize(10)
        .text(`Company: ${data.company.name}`)
        .text(`Branch:  ${data.branch.branchName}`)
        .text(`Category: ${data.branch.categoryName || '-'}`)
        .text(`Branch #: ${data.branch.branchNumber || '-'}`)
        .text(`City:    ${data.branch.city}`)
        .text(`Region:  ${data.branch.region}`)
        .text(`Address: ${data.branch.address || '-'}`)
        .text(`Code:    ${data.branch.code || '-'}`);
      doc.moveDown();

      doc.fontSize(12).text('Visit', { underline: true });
      doc
        .fontSize(10)
        .text(`Type:        ${data.visit.visitType}`)
        .text(`Scheduled:   ${data.visit.scheduledDate}`)
        .text(`Status:      ${data.visit.status}`)
        .text(`Started:     ${data.visit.startedAt || '-'}`)
        .text(`Ended:       ${data.visit.endedAt || '-'}`)
        .text(
          `Duration:    ${
            data.visit.durationSeconds
              ? `${Math.round(data.visit.durationSeconds / 60)} minutes`
              : '-'
          }`,
        );
      doc.moveDown();

      doc.fontSize(12).text('Supervisor', { underline: true });
      doc
        .fontSize(10)
        .text(`Name:  ${data.supervisor.nameAr}${data.supervisor.nameEn ? ` (${data.supervisor.nameEn})` : ''}`)
        .text(`Phone: ${data.supervisor.phone || '-'}`);
      doc.moveDown();

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
        .text(`Status:    ${data.visit.documentationStatus}`)
        .text(`Job #:     ${data.visit.jobNumber || '-'}`)
        .text(`Rating:    ${data.visit.rating ? `${data.visit.rating} / 5` : '-'}`)
        .text(`Comments:  ${data.visit.comments || '-'}`);
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

const buildPublicUrl = (token) => {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  // Mounted directly under the app, not under /api/v1 — see app.js notes.
  return `${base}/api/v1/public/document/${token}`;
};

const getPdfBuffer = async (token) => {
  const inst = await loadByToken(token);
  const data = serializePublic(inst);
  return buildPdf(data);
};

module.exports = {
  sendOtp,
  verifyOtp,
  getPublicView,
  submitPublic,
  getPdfBuffer,
};
