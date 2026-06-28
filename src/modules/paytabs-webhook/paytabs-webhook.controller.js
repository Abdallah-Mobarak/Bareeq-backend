const { asyncHandler } = require('../../utils/asyncHandler');
const { logger } = require('../../utils/logger');
const paytabs = require('../../services/paytabs.service');
const service = require('./paytabs-webhook.service');

/**
 * POST /payments/paytabs/callback — server-to-server callback from PayTabs.
 * PUBLIC (no customer token); authenticity is proven by the HMAC signature
 * over the raw body (req.rawBody captured by the body-parser verify hook).
 */
const handleCallback = asyncHandler(async (req, res) => {
  const signature = req.get('signature');
  if (!paytabs.verifySignature(req.rawBody, signature)) {
    logger.warn(
      { hasSignature: Boolean(signature), hasRawBody: Boolean(req.rawBody) },
      'PayTabs callback rejected — signature mismatch',
    );
    return res.status(400).json({ success: false, error: { message: 'Invalid signature' } });
  }

  await service.completeTopupFromCallback(req.body || {});
  // Always 200 once handled so PayTabs stops retrying.
  return res.status(200).json({ success: true });
});

/**
 * GET /payments/paytabs/return — browser redirect target after payment.
 * Just a friendly page; the app refreshes the balance itself on resume.
 */
const handleReturn = (req, res) => {
  res
    .status(200)
    .type('html')
    .send(
      `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>بريق · الدفع</title>
</head>
<body style="font-family:-apple-system,Segoe UI,Tahoma,sans-serif;background:#f5f5f5;margin:0;">
  <div style="max-width:420px;margin:60px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <div style="font-size:48px;">✅</div>
    <h2 style="color:#1a73e8;margin:12px 0;">تم استلام الدفع</h2>
    <p style="color:#555;line-height:1.7;">من فضلك ارجع إلى تطبيق بريق — سيتم تحديث رصيد محفظتك تلقائيًا.</p>
    <p style="color:#999;font-size:13px;">Payment received. Please return to the Bareeq app — your balance will update automatically.</p>
  </div>
</body>
</html>`,
    );
};

module.exports = { handleCallback, handleReturn };
