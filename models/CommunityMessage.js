const mongoose = require('mongoose');

const CommunityMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  equippedItems: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isAnnouncement: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  capped: {
    size: 1048576, // 1MB max size
    max: 1000      // 1000 messages max
  }
});

module.exports = mongoose.model('CommunityMessage', CommunityMessageSchema);
