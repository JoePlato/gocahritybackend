const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Charity = require('../models/Charity');
const CharityCode = require('../models/CharityCode');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication and admin privileges
router.use(auth);
router.use(requireAdmin);

// Validation schemas
const updateUserSchema = Joi.object({
  accountType: Joi.string().valid('individual', 'charity').optional(), // Removed 'admin' option
  isActive: Joi.boolean().optional()
});

const createCharityCodeSchema = Joi.object({
  code: Joi.string().alphanum().length(8).uppercase().optional(),
  expiresAt: Joi.date().greater('now').required(),
  description: Joi.string().max(200).optional()
});

const bulkCreateCharityCodesSchema = Joi.object({
  count: Joi.number().integer().min(1).max(50).required(),
  expiresAt: Joi.date().greater('now').required(),
  description: Joi.string().max(200).optional()
});

// ========== CHARITY CODE MANAGEMENT ==========

// Generate single charity code
router.post('/charity-codes', async (req, res) => {
  try {
    const { error, value } = createCharityCodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Generate code if not provided
    let code = value.code;
    if (!code) {
      do {
        code = CharityCode.generateCode();
      } while (await CharityCode.findOne({ code }));
    } else {
      // Check if provided code already exists
      const existingCode = await CharityCode.findOne({ code });
      if (existingCode) {
        return res.status(400).json({ error: 'Code already exists' });
      }
    }
    
    const charityCode = new CharityCode({
      code,
      expiresAt: value.expiresAt,
      description: value.description,
      createdBy: req.user._id
    });
    
    await charityCode.save();
    
    res.status(201).json({
      message: 'Charity code created successfully',
      code: {
        id: charityCode._id,
        code: charityCode.code,
        expiresAt: charityCode.expiresAt,
        description: charityCode.description,
        isActive: charityCode.isActive,
        createdAt: charityCode.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create charity code', details: error.message });
  }
});

// Generate multiple charity codes
router.post('/charity-codes/bulk', async (req, res) => {
  try {
    const { error, value } = bulkCreateCharityCodesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const codes = [];
    const codePromises = [];
    
    for (let i = 0; i < value.count; i++) {
      let code;
      do {
        code = CharityCode.generateCode();
      } while (codes.includes(code) || await CharityCode.findOne({ code }));
      
      codes.push(code);
      
      const charityCode = new CharityCode({
        code,
        expiresAt: value.expiresAt,
        description: value.description ? `${value.description} (${i + 1}/${value.count})` : `Batch code ${i + 1}`,
        createdBy: req.user._id
      });
      
      codePromises.push(charityCode.save());
    }
    
    const savedCodes = await Promise.all(codePromises);
    
    res.status(201).json({
      message: `${value.count} charity codes created successfully`,
      codes: savedCodes.map(code => ({
        id: code._id,
        code: code.code,
        expiresAt: code.expiresAt,
        description: code.description
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bulk charity codes', details: error.message });
  }
});

// Get all charity codes
router.get('/charity-codes', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status === 'active') {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
      query.isUsed = false;
    } else if (status === 'expired') {
      query.expiresAt = { $lte: new Date() };
    } else if (status === 'used') {
      query.isUsed = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    // Search by code or description
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const codes = await CharityCode.find(query)
      .populate('createdBy', 'email')
      .populate('usedBy.user', 'email profile.displayName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await CharityCode.countDocuments(query);
    
    res.json({
      codes,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get charity codes' });
  }
});

// Get charity code statistics
router.get('/charity-codes/stats', async (req, res) => {
  try {
    const now = new Date();
    
    const [total, active, expired, used, unused] = await Promise.all([
      CharityCode.countDocuments({}),
      CharityCode.countDocuments({ 
        isActive: true, 
        expiresAt: { $gt: now },
        isUsed: false
      }),
      CharityCode.countDocuments({ expiresAt: { $lte: now } }),
      CharityCode.countDocuments({ isUsed: true }),
      CharityCode.countDocuments({ isUsed: false })
    ]);
    
    res.json({
      stats: {
        total,
        active,
        expired,
        used,
        unused
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get charity code statistics' });
  }
});

// Deactivate charity code
router.put('/charity-codes/:id/deactivate', async (req, res) => {
  try {
    const code = await CharityCode.findById(req.params.id);
    if (!code) {
      return res.status(404).json({ error: 'Charity code not found' });
    }
    
    if (code.isUsed) {
      return res.status(400).json({ error: 'Cannot deactivate a code that has already been used' });
    }
    
    code.isActive = false;
    await code.save();
    
    res.json({
      message: 'Charity code deactivated successfully',
      code: {
        id: code._id,
        code: code.code,
        isActive: code.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deactivate charity code' });
  }
});

// ========== USER MANAGEMENT ==========

// Get all users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, accountType, search, isActive } = req.query;
    
    let query = {};
    
    // Filter by account type
    if (accountType) {
      query.accountType = accountType;
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search by email
    if (search) {
      query.email = { $regex: search, $options: 'i' };
    }
    
    const users = await User.find(query)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get specific user
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get decrypted personal info if exists
    let personalInfo = null;
    if (user.personalInfo) {
      personalInfo = user.getDecryptedPersonalInfo();
    }
    
    // Get user's charities
    const charities = await Charity.find({ owner: user._id })
      .select('basicInfo.name status isPublic createdAt');
    
    res.json({
      user: user.toObject(),
      personalInfo,
      charities: charities.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent modification of admin accounts
    if (user.accountType === 'admin') {
      return res.status(403).json({ error: 'Cannot modify admin accounts through API. Admin accounts must be managed directly in the database.' });
    }
    
    // Update fields
    Object.keys(value).forEach(key => {
      user[key] = value[key];
    });
    
    await user.save();
    
    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        email: user.email,
        accountType: user.accountType,
        isActive: user.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user account
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent deletion of admin accounts
    if (user.accountType === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin accounts through API. Admin accounts must be managed directly in the database.' });
    }
    
    // Delete user's charities first
    await Charity.deleteMany({ owner: user._id });
    
    // Delete user
    await User.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: 'User account and associated charities deleted successfully',
      deletedUser: {
        email: user.email,
        accountType: user.accountType
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

// Get admin dashboard stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [totalUsers, totalCharities, activeUsers, totalAdmins] = await Promise.all([
      User.countDocuments({}),
      Charity.countDocuments({}),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ accountType: 'admin' })
    ]);
    
    // Get recent users
    const recentUsers = await User.find()
      .select('email accountType createdAt')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get recent charities
    const recentCharities = await Charity.find()
      .populate('owner', 'email')
      .select('basicInfo.name status createdAt owner')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      stats: {
        totalUsers,
        totalCharities,
        activeUsers,
        totalAdmins,
        inactiveUsers: totalUsers - activeUsers
      },
      recentUsers,
      recentCharities: recentCharities.map(charity => ({
        id: charity._id,
        name: charity.basicInfo?.name || 'Unnamed',
        status: charity.status,
        owner: charity.owner,
        createdAt: charity.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// Get all charities (admin view)
router.get('/charities', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    const charities = await Charity.find(query)
      .populate('owner', 'email accountType')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Charity.countDocuments(query);
    
    // Return basic info (names will be encrypted in DB but decrypted here)
    const charitiesWithBasicInfo = charities.map(charity => {
      const decryptedData = charity.getDecryptedData();
      return {
        id: charity._id,
        name: decryptedData.basicInfo?.name || 'Unnamed',
        description: decryptedData.basicInfo?.description,
        status: charity.status,
        isPublic: charity.isPublic,
        owner: charity.owner,
        createdAt: charity.createdAt,
        updatedAt: charity.updatedAt
      };
    });
    
    res.json({
      charities: charitiesWithBasicInfo,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get charities' });
  }
});

// Update charity status (admin only)
router.put('/charities/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'verified', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    const charity = await Charity.findById(req.params.id);
    if (!charity) {
      return res.status(404).json({ error: 'Charity not found' });
    }
    
    charity.status = status;
    await charity.save();
    
    const decryptedData = charity.getDecryptedData();
    
    res.json({
      message: 'Charity status updated successfully',
      charity: {
        id: charity._id,
        name: decryptedData.basicInfo?.name,
        status: charity.status,
        updatedAt: charity.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update charity status' });
  }
});

module.exports = router;