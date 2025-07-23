const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Charity = require('../models/Charity');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password -refreshTokens');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token or user not active.' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    if (req.user.accountType !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Middleware to check if user is charity owner or admin
const authorizeCharityOwner = async (req, res, next) => {
  try {
    const charityId = req.params.id;
    const charity = await Charity.findById(charityId);
    
    if (!charity) {
      return res.status(404).json({ error: 'Charity not found' });
    }
    
    if (charity.owner.toString() !== req.user._id.toString() && req.user.accountType !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Not authorized to modify this charity.' });
    }
    
    req.charity = charity;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Middleware to check if user can create charity
const canCreateCharity = async (req, res, next) => {
  try {
    // Admins can always create charities
    if (req.user.accountType === 'admin') {
      return next();
    }
    
    // Check if user has charity authorization
    if (!req.user.charityAuthorization || !req.user.charityAuthorization.canCreateCharity) {
      return res.status(403).json({ 
        error: 'Access denied. You need a valid charity creation code to create a charity account. Please contact an administrator for a code.' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

module.exports = { auth, requireAdmin, authorizeCharityOwner, canCreateCharity };