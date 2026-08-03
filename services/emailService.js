// Render blocks (or Gmail throttles from Render's shared IP range — either
// way, the result is the same) outbound SMTP: connections to Gmail on 465
// failed with ENETUNREACH over IPv6 and ETIMEDOUT over IPv4, so no amount of
// DNS-order tweaking fixes it. SendGrid sends over a plain HTTPS POST instead,
// which egresses fine from anywhere a normal API call would.
//
// Picked over Resend specifically because Resend requires a verified *domain*
// before it'll deliver to anyone but the account owner — no domain here.
// SendGrid's Single Sender Verification confirms one address (a link sent to
// noreply.buzzit@gmail.com, clicked once in their dashboard) and after that
// it can send to any recipient.
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM || 'noreply.buzzit@gmail.com';
const FROM_NAME = 'BuzzIt';

const sendEmail = async (to, subject, htmlContent) => {
  if (!SENDGRID_API_KEY) {
    console.error('[EmailService] SENDGRID_API_KEY is not set — cannot send email');
    return false;
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_ADDRESS, name: FROM_NAME },
        subject,
        content: [{ type: 'text/html', value: htmlContent }],
      }),
    });

    // SendGrid answers 202 with an empty body on success — there's no
    // message id to log, unlike Resend.
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[EmailService] SendGrid rejected the send (${res.status}): ${body}`);
      return false;
    }

    console.log(`[EmailService] Email sent successfully to ${to}.`);
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
