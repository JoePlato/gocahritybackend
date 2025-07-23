const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation schema for updating personal info
const updatePersonalInfoSchema = Joi.object({
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
  phone: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    country: Joi.string().optional()
  }).optional(),
  dateOfBirth: Joi.string().optional(),
  description: Joi.string().optional()
});

const updateProfileSchema = Joi.object({
  displayName: Joi.string().optional(),
  profilePicture: Joi.string().uri().optional(),
  isPublic: Joi.boolean().optional(),
  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional()
    }).optional(),
    privacy: Joi.object({
      showEmail: Joi.boolean().optional(),
      showPhone: Joi.boolean().optional()
    }).optional()
  }).optional()
});

// Update personal information
router.put('/personal-info', auth, async (req, res) => {
  try {
    const { error, value } = updatePersonalInfoSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update personal info (will be encrypted by pre-save middleware)
    user.personalInfo = { ...user.personalInfo, ...value };
    await user.save();
    
    // Return decrypted data
    const updatedUser = await User.findById(user._id);
    const personalInfo = updatedUser.getDecryptedPersonalInfo();
    
    res.json({
      message: 'Personal information updated successfully',
      personalInfo
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update personal information', details: error.message });
  }
});

// Update profile settings
router.put('/profile', auth, async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update profile
    user.profile = { ...user.profile, ...value };
    await user.save();
    
    res.json({
      message: 'Profile updated successfully',
      profile: user.profile
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// Get user profile (public view)
router.get('/:id/profile', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshTokens -personalInfo -verificationToken');
    
    if (!user || !user.isActive || !user.profile.isPublic) {
      return res.status(404).json({ error: 'User not found or profile not public' });
    }
    
    res.json({
      id: user._id,
      displayName: user.profile.displayName,
      profilePicture: user.profile.profilePicture,
      accountType: user.accountType,
      memberSince: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Delete user account
router.delete('/account', auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;