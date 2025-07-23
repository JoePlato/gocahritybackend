const express = require('express');
const Joi = require('joi');
const Charity = require('../models/Charity');
const { auth, authorizeCharityOwner, canCreateCharity } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createCharitySchema = Joi.object({
  basicInfo: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    mission: Joi.string().optional(),
    vision: Joi.string().optional(),
    foundedYear: Joi.string().optional(),
    website: Joi.string().uri().optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional()
  }).required(),
  legalInfo: Joi.object({
    registrationNumber: Joi.string().optional(),
    taxId: Joi.string().optional(),
    legalStructure: Joi.string().optional(),
    registeredAddress: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      zipCode: Joi.string().optional(),
      country: Joi.string().optional()
    }).optional()
  }).optional(),
  contactInfo: Joi.object({
    primaryContact: Joi.object({
      name: Joi.string().optional(),
      title: Joi.string().optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional()
    }).optional(),
    mailingAddress: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      zipCode: Joi.string().optional(),
      country: Joi.string().optional()
    }).optional()
  }).optional(),
  socialMedia: Joi.object({
    facebook: Joi.string().uri().optional(),
    twitter: Joi.string().uri().optional(),
    instagram: Joi.string().uri().optional(),
    linkedin: Joi.string().uri().optional(),
    youtube: Joi.string().uri().optional()
  }).optional(),
  categories: Joi.array().items(Joi.string()).optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

// Create charity (requires charity authorization code)
router.post('/', auth, canCreateCharity, async (req, res) => {
  try {
    const { error, value } = createCharitySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Check if user already has a charity (if you want to limit to one per user)
    const existingCharity = await Charity.findOne({ owner: req.user._id });
    if (existingCharity && req.user.accountType === 'individual') {
      return res.status(400).json({ error: 'Individual users can only create one charity' });
    }
    
    const charity = new Charity({
      owner: req.user._id,
      ...value
    });
    
    await charity.save();
    
    res.status(201).json({
      message: 'Charity created successfully',
      charity: {
        id: charity._id,
        name: charity.basicInfo.name, // This will be encrypted in DB
        status: charity.status,
        createdAt: charity.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create charity', details: error.message });
  }
});

// Get user's charities
router.get('/my-charities', auth, async (req, res) => {
  try {
    const charities = await Charity.find({ owner: req.user._id });
    
    const decryptedCharities = charities.map(charity => {
      const decrypted = charity.getDecryptedData();
      return {
        id: decrypted._id,
        name: decrypted.basicInfo?.name,
        description: decrypted.basicInfo?.description,
        status: decrypted.status,
        isPublic: decrypted.isPublic,
        createdAt: decrypted.createdAt,
        updatedAt: decrypted.updatedAt
      };
    });
    
    res.json(decryptedCharities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get charities' });
  }
});

// Get charity by ID (for owner or public view)
router.get('/:id', async (req, res) => {
  try {
    const charity = await Charity.findById(req.params.id).populate('owner', 'profile.displayName accountType');
    
    if (!charity) {
      return res.status(404).json({ error: 'Charity not found' });
    }
    
    // Check if user is owner or if charity is public
    const isOwner = req.user && charity.owner._id.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.accountType === 'admin';
    
    if (!charity.isPublic && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. Charity is not public.' });
    }
    
    const decryptedCharity = charity.getDecryptedData();
    
    // Remove sensitive financial info if not owner/admin
    if (!isOwner && !isAdmin) {
      delete decryptedCharity.financialInfo;
      delete decryptedCharity.legalInfo;
    }
    
    res.json(decryptedCharity);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get charity' });
  }
});

// Update charity
router.put('/:id', auth, authorizeCharityOwner, async (req, res) => {
  try {
    const charity = req.charity;
    
    // Update fields (they will be encrypted by pre-save middleware)
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== 'owner') {
        charity[key] = req.body[key];
      }
    });
    
    await charity.save();
    
    const decryptedCharity = charity.getDecryptedData();
    
    res.json({
      message: 'Charity updated successfully',
      charity: decryptedCharity
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update charity', details: error.message });
  }
});

// Add program to charity
router.post('/:id/programs', auth, authorizeCharityOwner, async (req, res) => {
  try {
    const { name, description, targetAudience, budget, startDate, endDate } = req.body;
    
    const program = {
      name,
      description,
      targetAudience,
      budget,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };
    
    req.charity.programs.push(program);
    await req.charity.save();
    
    res.status(201).json({
      message: 'Program added successfully',
      program: req.charity.programs[req.charity.programs.length - 1]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add program' });
  }
});

// Get public charities (for browsing)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const query = { isPublic: true, status: 'verified' };
    
    if (category) {
      query.categories = category;
    }
    
    const charities = await Charity.find(query)
      .populate('owner', 'profile.displayName')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Charity.countDocuments(query);
    
    const publicCharities = charities.map(charity => {
      const decrypted = charity.getDecryptedData();
      return {
        id: decrypted._id,
        name: decrypted.basicInfo?.name,
        description: decrypted.basicInfo?.description,
        mission: decrypted.basicInfo?.mission,
        website: decrypted.basicInfo?.website,
        socialMedia: decrypted.socialMedia,
        logo: decrypted.logo,
        categories: decrypted.categories,
        tags: decrypted.tags,
        owner: charity.owner,
        createdAt: decrypted.createdAt
      };
    });
    
    res.json({
      charities: publicCharities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get public charities' });
  }
});

// Delete charity
router.delete('/:id', auth, authorizeCharityOwner, async (req, res) => {
  try {
    await Charity.findByIdAndDelete(req.params.id);
    res.json({ message: 'Charity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete charity' });
  }
});

module.exports = router;