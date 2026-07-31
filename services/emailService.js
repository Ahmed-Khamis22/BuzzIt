const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    const mailOptions = {
      from: `"BuzzIt App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Email sent successfully to ${to}. Message ID: ${info.messageId}`);
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
