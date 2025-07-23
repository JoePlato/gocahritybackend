const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const CharityCode = require('../models/CharityCode');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  accountType: Joi.string().valid('individual', 'charity').default('individual')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const verifyCharityCodeSchema = Joi.object({
  code: Joi.string().alphanum().length(8).uppercase().required()
});

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password, accountType } = value;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Create new user
    const user = new User({
      email,
      password,
      accountType
    });
    
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Store refresh token
    user.refreshTokens.push(refreshToken);
    await user.save();
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        email: user.email,
        accountType: user.accountType,
        isAdmin: user.accountType === 'admin',
        canCreateCharity: user.charityAuthorization?.canCreateCharity || false
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password } = value;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(400).json({ error: 'Invalid credentials or account inactive' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Store refresh token and update last login
    user.refreshTokens.push(refreshToken);
    user.lastLogin = new Date();
    await user.save();
    
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        accountType: user.accountType,
        profile: user.profile,
        isAdmin: user.accountType === 'admin',
        canCreateCharity: user.charityAuthorization?.canCreateCharity || false
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Verify charity creation code
router.post('/verify-charity-code', auth, async (req, res) => {
  try {
    const { error, value } = verifyCharityCodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { code } = value;
    
    // Check if user already has charity authorization
    if (req.user.charityAuthorization && req.user.charityAuthorization.canCreateCharity) {
      return res.status(400).json({ 
        error: 'You already have charity creation authorization',
        details: 'Your account is already authorized to create charity accounts.'
      });
    }
    
    // Find the charity code
    const charityCode = await CharityCode.findOne({ 
      code: code.toUpperCase(),
      isActive: true 
    });
    
    if (!charityCode) {
      return res.status(404).json({ error: 'Invalid charity code' });
    }
    
    // Check if code is valid for use
    if (!charityCode.isValidForUse()) {
      const now = new Date();
      let reason = 'Code is not valid';
      
      if (now >= charityCode.expiresAt) {
        reason = 'Code has expired';
      } else if (charityCode.isUsed) {
        reason = 'Code has already been used';
      } else if (!charityCode.isActive) {
        reason = 'Code is inactive';
      }
      
      return res.status(400).json({ 
        error: reason,
        details: {
          expiresAt: charityCode.expiresAt,
          isUsed: charityCode.isUsed,
          isActive: charityCode.isActive
        }
      });
    }
    
    // Use the code and authorize the user
    await charityCode.useCode(req.user._id);
    
    // Update user authorization
    const user = await User.findById(req.user._id);
    user.charityAuthorization = {
      code: charityCode._id,
      authorizedAt: new Date(),
      canCreateCharity: true
    };
    await user.save();
    
    res.json({
      message: 'Charity creation code verified successfully',
      authorization: {
        canCreateCharity: true,
        authorizedAt: user.charityAuthorization.authorizedAt,
        codeDescription: charityCode.description
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Code verification failed', details: error.message });
  }
});

// Check charity authorization status
router.get('/charity-authorization-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('charityAuthorization.code', 'code description expiresAt');
    
    res.json({
      canCreateCharity: user.charityAuthorization?.canCreateCharity || false,
      authorizedAt: user.charityAuthorization?.authorizedAt,
      code: user.charityAuthorization?.code ? {
        description: user.charityAuthorization.code.description,
        expiresAt: user.charityAuthorization.code.expiresAt
      } : null,
      isAdmin: user.accountType === 'admin'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get authorization status' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    
    // Replace old refresh token with new one
    user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();
    
    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', auth, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      req.user.refreshTokens = req.user.refreshTokens.filter(token => token !== refreshToken);
      await req.user.save();
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = req.user.toObject();
    
    // Get decrypted personal info if it exists
    if (user.personalInfo) {
      user.personalInfo = req.user.getDecryptedPersonalInfo();
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

module.exports = router;