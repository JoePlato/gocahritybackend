const mongoose = require('mongoose');

const charityCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedBy: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: {
      type: Date
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
charityCodeSchema.index({ expiresAt: 1 });
charityCodeSchema.index({ isActive: 1 });

// Method to check if code is valid and available
charityCodeSchema.methods.isValidForUse = function() {
  const now = new Date();
  return (
    this.isActive &&
    now < this.expiresAt &&
    !this.isUsed
  );
};

// Method to use the code (one-time use)
charityCodeSchema.methods.useCode = function(userId) {
  if (!this.isValidForUse()) {
    throw new Error('Code is not valid for use');
  }
  
  this.usedBy = {
    user: userId,
    usedAt: new Date()
  };
  this.isUsed = true;
  
  return this.save();
};

// Static method to generate a random code
charityCodeSchema.statics.generateCode = function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

module.exports = mongoose.model('CharityCode', charityCodeSchema);