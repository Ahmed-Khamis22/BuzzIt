const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ['verify_email', 'reset_password'],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 900 // Document automatically deletes after 15 minutes (900 seconds)
  }
});

const crypto = require('crypto');

// Optional: you can add a static method to generate a 6-digit OTP
otpSchema.statics.generateOTP = function() {
  return crypto.randomInt(100000, 999999).toString();
};

module.exports = mongoose.model('Otp', otpSchema);
