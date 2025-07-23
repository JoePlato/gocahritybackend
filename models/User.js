const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const EncryptionUtil = require('../utils/encryption');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  accountType: {
    type: String,
    enum: ['individual', 'charity', 'admin'],
    default: 'individual'
  },
  // Charity creation authorization
  charityAuthorization: {
    code: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CharityCode'
    },
    authorizedAt: Date,
    canCreateCharity: {
      type: Boolean,
      default: false
    }
  },
  // Encrypted personal information
  personalInfo: {
    firstName: String, // encrypted
    lastName: String,  // encrypted
    phone: String,     // encrypted
    address: {
      street: String,  // encrypted
      city: String,    // encrypted
      state: String,   // encrypted
      zipCode: String, // encrypted
      country: String  // encrypted
    },
    dateOfBirth: String, // encrypted
    description: String  // encrypted
  },
  // Profile settings
  profile: {
    displayName: String,
    profilePicture: String,
    isPublic: {
      type: Boolean,
      default: false
    },
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false }
      },
      privacy: {
        showEmail: { type: Boolean, default: false },
        showPhone: { type: Boolean, default: false }
      }
    }
  },
  // Security
  refreshTokens: [String],
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String
}, {
  timestamps: true
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Encrypt personal info before saving
userSchema.pre('save', function(next) {
  if (this.personalInfo) {
    // Encrypt sensitive fields
    if (this.personalInfo.firstName && this.isModified('personalInfo.firstName')) {
      this.personalInfo.firstName = EncryptionUtil.simpleEncrypt(this.personalInfo.firstName);
    }
    if (this.personalInfo.lastName && this.isModified('personalInfo.lastName')) {
      this.personalInfo.lastName = EncryptionUtil.simpleEncrypt(this.personalInfo.lastName);
    }
    if (this.personalInfo.phone && this.isModified('personalInfo.phone')) {
      this.personalInfo.phone = EncryptionUtil.simpleEncrypt(this.personalInfo.phone);
    }
    if (this.personalInfo.description && this.isModified('personalInfo.description')) {
      this.personalInfo.description = EncryptionUtil.simpleEncrypt(this.personalInfo.description);
    }
    
    // Encrypt address fields
    if (this.personalInfo.address) {
      const address = this.personalInfo.address;
      if (address.street && this.isModified('personalInfo.address.street')) {
        address.street = EncryptionUtil.simpleEncrypt(address.street);
      }
      if (address.city && this.isModified('personalInfo.address.city')) {
        address.city = EncryptionUtil.simpleEncrypt(address.city);
      }
      if (address.state && this.isModified('personalInfo.address.state')) {
        address.state = EncryptionUtil.simpleEncrypt(address.state);
      }
      if (address.zipCode && this.isModified('personalInfo.address.zipCode')) {
        address.zipCode = EncryptionUtil.simpleEncrypt(address.zipCode);
      }
    }
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get decrypted personal info
userSchema.methods.getDecryptedPersonalInfo = function() {
  if (!this.personalInfo) return null;
  
  const decrypted = { ...this.personalInfo.toObject() };
  
  if (decrypted.firstName) {
    decrypted.firstName = EncryptionUtil.simpleDecrypt(decrypted.firstName);
  }
  if (decrypted.lastName) {
    decrypted.lastName = EncryptionUtil.simpleDecrypt(decrypted.lastName);
  }
  if (decrypted.phone) {
    decrypted.phone = EncryptionUtil.simpleDecrypt(decrypted.phone);
  }
  if (decrypted.description) {
    decrypted.description = EncryptionUtil.simpleDecrypt(decrypted.description);
  }
  
  if (decrypted.address) {
    if (decrypted.address.street) {
      decrypted.address.street = EncryptionUtil.simpleDecrypt(decrypted.address.street);
    }
    if (decrypted.address.city) {
      decrypted.address.city = EncryptionUtil.simpleDecrypt(decrypted.address.city);
    }
    if (decrypted.address.state) {
      decrypted.address.state = EncryptionUtil.simpleDecrypt(decrypted.address.state);
    }
    if (decrypted.address.zipCode) {
      decrypted.address.zipCode = EncryptionUtil.simpleDecrypt(decrypted.address.zipCode);
    }
  }
  
  return decrypted;
};

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshTokens;
  delete user.verificationToken;
  return user;
};

module.exports = mongoose.model('User', userSchema);