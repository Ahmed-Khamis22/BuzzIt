const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  minVersion: { type: String, default: '1.0.0' },
  latestVersion: { type: String, default: '1.0.0' },
  storeUrl: { type: String, default: 'https://play.google.com/store/apps/details?id=com.buzzit.game' },
  maintenanceEnabled: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: 'حنكشة تحت الصيانة دلوقتي. هنرجع بسرعة!' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('AppSettings', appSettingsSchema);
