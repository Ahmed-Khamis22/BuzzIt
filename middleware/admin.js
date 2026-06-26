const User = require('../models/User');

async function admin(req, res, next) {
  const user = await User.findById(req.userId).select('isAdmin');
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = admin;
