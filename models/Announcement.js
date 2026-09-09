const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  targetAction: { type: String, default: 'none' }, // 'none', 'store', 'solo_games', 'create_room', 'url', 'screen'
  targetUrl: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', announcementSchema);
