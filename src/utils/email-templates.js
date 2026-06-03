/**
 * Bilingual (Arabic + English) email templates for OTP flows.
 *
 * Why a helper module instead of inline strings in each service:
 *   - Four call sites (Customer/SP × signup/reset) would otherwise
 *     duplicate the same HTML scaffold and risk drifting.
 *   - One place to tweak branding (colors, copy) when design lands.
 *
 * Why inline CSS in the HTML: email clients (Gmail/Outlook/Apple Mail)
 * strip <style> tags or sandbox them. Inline `style="…"` is the only
 * formatting that reliably survives.
 *
 * Why both `text` and `html`: a small minority of email clients still
 * render plaintext only (notifications, watch glances, etc.), and many
 * spam filters treat HTML-only mail as suspicious.
 *
 * Each builder returns `{ subject, html, text }` ready for mailer.sendEmail.
 */

/**
 * Internal: render the shared HTML scaffold. The Arabic block is RTL,
 * the English block is LTR, separated by a divider. The OTP code is
 * shown identically in both so the user can copy it from either side.
 */
const renderHtml = ({
  nameAr,
  nameEn,
  code,
  ttlMinutes,
  arMessage,
  enMessage,
  arDisclaimer,
  enDisclaimer,
}) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bareeq</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Tahoma',Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.05);">

    <div style="background:#1a73e8;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600;">بريق · Bareeq</h1>
    </div>

    <div style="padding:24px 32px;direction:rtl;text-align:right;border-bottom:1px solid #e0e0e0;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">مرحباً ${escapeHtml(nameAr)}،</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">${arMessage}</p>
      <div style="background:#f0f7ff;border:1px dashed #1a73e8;border-radius:6px;padding:16px;text-align:center;margin:16px 0;font-size:28px;font-weight:700;color:#1a73e8;letter-spacing:6px;font-family:'Courier New',monospace;direction:ltr;">${code}</div>
      <p style="font-size:13px;color:#888;margin:0;">الرمز صالح لمدة ${ttlMinutes} دقيقة.</p>
      <p style="font-size:12px;color:#999;margin-top:16px;">${arDisclaimer}</p>
    </div>

    <div style="padding:24px 32px;direction:ltr;text-align:left;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">Hello ${escapeHtml(nameEn || nameAr)},</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">${enMessage}</p>
      <div style="background:#f0f7ff;border:1px dashed #1a73e8;border-radius:6px;padding:16px;text-align:center;margin:16px 0;font-size:28px;font-weight:700;color:#1a73e8;letter-spacing:6px;font-family:'Courier New',monospace;">${code}</div>
      <p style="font-size:13px;color:#888;margin:0;">The code expires in ${ttlMinutes} minutes.</p>
      <p style="font-size:12px;color:#999;margin-top:16px;">${enDisclaimer}</p>
    </div>

    <div style="background:#fafafa;padding:16px;text-align:center;font-size:12px;color:#999;">© Bareeq</div>
  </div>
</body>
</html>`;

/**
 * Internal: plaintext fallback. Mirrors the HTML structure but as a
 * flat document. Email clients that disable HTML render this instead.
 */
const renderText = ({
  nameAr,
  nameEn,
  code,
  ttlMinutes,
  arMessage,
  enMessage,
  arDisclaimer,
  enDisclaimer,
}) =>
  `بريق · Bareeq\n\n` +
  `مرحباً ${nameAr}،\n` +
  `${arMessage}\n\n` +
  `رمز التحقق: ${code}\n` +
  `الرمز صالح لمدة ${ttlMinutes} دقيقة.\n\n` +
  `${arDisclaimer}\n\n` +
  `— — —\n\n` +
  `Hello ${nameEn || nameAr},\n` +
  `${enMessage}\n\n` +
  `Verification code: ${code}\n` +
  `The code expires in ${ttlMinutes} minutes.\n\n` +
  `${enDisclaimer}\n`;

/**
 * Minimal HTML escaping for the only user-controlled fields in the
 * template (names). Codes are server-generated digits and don't need it.
 * We don't pull in a full library because the surface is tiny.
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Signup OTP — covers Customer and Service Provider. The only difference
 * is the noun used in the body ("your account" vs "your service provider
 * account") so we accept a flag rather than splitting into two templates.
 */
const signupOtpEmail = ({ nameAr, nameEn, code, ttlMinutes, isServiceProvider = false }) => {
  const arContext = isServiceProvider ? 'حساب مقدم الخدمة الخاص بك' : 'حسابك في بريق';
  const enContext = isServiceProvider ? 'service provider account' : 'Bareeq account';

  const fields = {
    nameAr,
    nameEn,
    code,
    ttlMinutes,
    arMessage: `استخدم الرمز التالي لتفعيل ${arContext}:`,
    enMessage: `Use the following code to verify your ${enContext}:`,
    arDisclaimer: 'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.',
    enDisclaimer: "If you didn't try to sign up, ignore this email.",
  };

  return {
    subject: 'بريق · رمز التحقق — Bareeq · verification code',
    html: renderHtml(fields),
    text: renderText(fields),
  };
};

/**
 * Password reset OTP — identical scaffold, reset-specific copy.
 */
const passwordResetOtpEmail = ({ nameAr, nameEn, code, ttlMinutes }) => {
  const fields = {
    nameAr,
    nameEn,
    code,
    ttlMinutes,
    arMessage: 'استخدم الرمز التالي لإعادة تعيين كلمة المرور:',
    enMessage: 'Use the following code to reset your password:',
    arDisclaimer: 'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.',
    enDisclaimer: "If you didn't request a password reset, ignore this email.",
  };

  return {
    subject: 'بريق · إعادة تعيين كلمة المرور — Bareeq · password reset code',
    html: renderHtml(fields),
    text: renderText(fields),
  };
};

module.exports = {
  signupOtpEmail,
  passwordResetOtpEmail,
};
