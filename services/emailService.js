// Render blocks (or Gmail throttles from Render's shared IP range — either
// way, the result is the same) outbound SMTP: connections to Gmail on 465
// failed with ENETUNREACH over IPv6 and ETIMEDOUT over IPv4, so no amount of
// DNS-order tweaking fixes it. Resend sends over a plain HTTPS POST instead,
// which egresses fine from anywhere a normal API call would.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's shared sending domain — works immediately with no DNS setup.
// Switch to a verified custom domain later for better inbox placement.
const FROM_ADDRESS = process.env.EMAIL_FROM || 'BuzzIt <onboarding@resend.dev>';

const sendEmail = async (to, subject, htmlContent) => {
  if (!RESEND_API_KEY) {
    console.error('[EmailService] RESEND_API_KEY is not set — cannot send email');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html: htmlContent }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[EmailService] Resend rejected the send (${res.status}): ${body}`);
      return false;
    }

    const data = await res.json();
    console.log(`[EmailService] Email sent successfully to ${to}. Message ID: ${data.id}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to send email to ${to}:`, error);
    return false;
  }
};

const sendVerificationEmail = async (to, otpCode) => {
  const subject = 'كود تفعيل حسابك في BuzzIt 🚀';
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
      <h2 style="color: #0F0C29;">أهلاً بيك في BuzzIt! 🎉</h2>
      <p>عشان نبدأ المغامرة، استخدم الكود ده لتفعيل حسابك:</p>
      <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; color: #FFF; background: linear-gradient(to right, #0F0C29, #302B63, #24243E); border-radius: 10px; width: fit-content; letter-spacing: 5px;">
        ${otpCode}
      </div>
      <p style="font-size: 14px; color: #666;">الكود ده صالح لمدة 15 دقيقة بس.</p>
      <p style="font-size: 14px; color: #666;">لو معملتش حساب، تقدر تتجاهل الإيميل ده.</p>
    </div>
  `;
  return sendEmail(to, subject, html);
};

const sendPasswordResetEmail = async (to, otpCode) => {
  const subject = 'إعادة تعيين كلمة المرور - BuzzIt 🔐';
  const html = `
    <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
      <h2 style="color: #FF3B30;">إعادة تعيين كلمة المرور</h2>
      <p>وصلنا طلب لتغيير كلمة المرور الخاصة بيك. استخدم الكود ده عشان تغيرها:</p>
      <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; color: #FFF; background: #FF3B30; border-radius: 10px; width: fit-content; letter-spacing: 5px;">
        ${otpCode}
      </div>
      <p style="font-size: 14px; color: #666;">الكود ده صالح لمدة 15 دقيقة بس.</p>
      <p style="font-size: 14px; color: #666;">لو مطلبتش تغير الباسورد، تجاهل الإيميل ده ومحدش هيقدر يدخل حسابك.</p>
    </div>
  `;
  return sendEmail(to, subject, html);
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
