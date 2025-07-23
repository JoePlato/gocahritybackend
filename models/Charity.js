const mongoose = require('mongoose');
const EncryptionUtil = require('../utils/encryption');

const charitySchema = new mongoose.Schema({
  // Owner of the charity account
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic charity information (encrypted)
  basicInfo: {
    name: { type: String, required: true }, // encrypted
    description: String,      // encrypted
    mission: String,          // encrypted
    vision: String,           // encrypted
    foundedYear: String,      // encrypted
    website: String,          // encrypted
    email: String,            // encrypted
    phone: String             // encrypted
  },
  
  // Legal and registration info (encrypted)
  legalInfo: {
    registrationNumber: String,    // encrypted
    taxId: String,                 // encrypted
    legalStructure: String,        // encrypted
    registeredAddress: {
      street: String,              // encrypted
      city: String,                // encrypted
      state: String,               // encrypted
      zipCode: String,             // encrypted
      country: String              // encrypted
    }
  },
  
  // Contact information (encrypted)
  contactInfo: {
    primaryContact: {
      name: String,                // encrypted
      title: String,               // encrypted
      email: String,               // encrypted
      phone: String                // encrypted
    },
    mailingAddress: {
      street: String,              // encrypted
      city: String,                // encrypted
      state: String,               // encrypted
      zipCode: String,             // encrypted
      country: String              // encrypted
    }
  },
  
  // Financial information (encrypted)
  financialInfo: {
    annualBudget: String,          // encrypted
    fundingSources: [String],      // encrypted array
    bankingInfo: {
      accountName: String,         // encrypted
      accountNumber: String,       // encrypted
      routingNumber: String,       // encrypted
      bankName: String             // encrypted
    }
  },
  
  // Programs and services
  programs: [{
    name: String,                  // encrypted
    description: String,           // encrypted
    targetAudience: String,        // encrypted
    budget: String,                // encrypted
    startDate: Date,
    endDate: Date,
    isActive: { type: Boolean, default: true }
  }],
  
  // Social media and public presence
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String
  },
  
  // Status and verification
  status: {
    type: String,
    enum: ['pending', 'verified', 'suspended', 'inactive'],
    default: 'pending'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  logo: String,
  images: [String],
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  
  // Extension fields for future use
  customFields: {
    type: Map,
    of: String  // These will be encrypted too
  },
  
  tags: [String],
  categories: [String]
}, {
  timestamps: true
});

// Encrypt sensitive fields before saving
charitySchema.pre('save', function(next) {
  const fieldsToEncrypt = [
    'basicInfo.name', 'basicInfo.description', 'basicInfo.mission', 
    'basicInfo.vision', 'basicInfo.foundedYear', 'basicInfo.website',
    'basicInfo.email', 'basicInfo.phone',
    'legalInfo.registrationNumber', 'legalInfo.taxId', 'legalInfo.legalStructure',
    'contactInfo.primaryContact.name', 'contactInfo.primaryContact.title',
    'contactInfo.primaryContact.email', 'contactInfo.primaryContact.phone',
    'financialInfo.annualBudget', 'financialInfo.bankingInfo.accountName',
    'financialInfo.bankingInfo.accountNumber', 'financialInfo.bankingInfo.routingNumber',
    'financialInfo.bankingInfo.bankName'
  ];
  
  fieldsToEncrypt.forEach(fieldPath => {
    const value = this.get(fieldPath);
    if (value && this.isModified(fieldPath)) {
      this.set(fieldPath, EncryptionUtil.simpleEncrypt(value));
    }
  });
  
  // Encrypt address fields
  const addressFields = [
    'legalInfo.registeredAddress', 'contactInfo.mailingAddress'
  ];
  
  addressFields.forEach(addressPath => {
    const address = this.get(addressPath);
    if (address) {
      ['street', 'city', 'state', 'zipCode', 'country'].forEach(field => {
        const fullPath = `${addressPath}.${field}`;
        const value = this.get(fullPath);
        if (value && this.isModified(fullPath)) {
          this.set(fullPath, EncryptionUtil.simpleEncrypt(value));
        }
      });
    }
  });
  
  // Encrypt funding sources array
  if (this.financialInfo && this.financialInfo.fundingSources && this.isModified('financialInfo.fundingSources')) {
    this.financialInfo.fundingSources = this.financialInfo.fundingSources.map(source => 
      EncryptionUtil.simpleEncrypt(source)
    );
  }
  
  // Encrypt programs
  if (this.programs && this.isModified('programs')) {
    this.programs.forEach(program => {
      if (program.name) program.name = EncryptionUtil.simpleEncrypt(program.name);
      if (program.description) program.description = EncryptionUtil.simpleEncrypt(program.description);
      if (program.targetAudience) program.targetAudience = EncryptionUtil.simpleEncrypt(program.targetAudience);
      if (program.budget) program.budget = EncryptionUtil.simpleEncrypt(program.budget);
    });
  }
  
  // Encrypt custom fields
  if (this.customFields && this.isModified('customFields')) {
    const encryptedFields = new Map();
    for (const [key, value] of this.customFields) {
      encryptedFields.set(key, EncryptionUtil.simpleEncrypt(value));
    }
    this.customFields = encryptedFields;
  }
  
  next();
});

// Method to get decrypted charity data
charitySchema.methods.getDecryptedData = function() {
  const charity = this.toObject();
  
  // Decrypt basic info
  if (charity.basicInfo) {
    Object.keys(charity.basicInfo).forEach(key => {
      if (charity.basicInfo[key]) {
        charity.basicInfo[key] = EncryptionUtil.simpleDecrypt(charity.basicInfo[key]);
      }
    });
  }
  
  // Decrypt legal info
  if (charity.legalInfo) {
    Object.keys(charity.legalInfo).forEach(key => {
      if (key === 'registeredAddress' && charity.legalInfo[key]) {
        Object.keys(charity.legalInfo[key]).forEach(addrKey => {
          if (charity.legalInfo[key][addrKey]) {
            charity.legalInfo[key][addrKey] = EncryptionUtil.simpleDecrypt(charity.legalInfo[key][addrKey]);
          }
        });
      } else if (charity.legalInfo[key]) {
        charity.legalInfo[key] = EncryptionUtil.simpleDecrypt(charity.legalInfo[key]);
      }
    });
  }
  
  // Decrypt contact info
  if (charity.contactInfo) {
    if (charity.contactInfo.primaryContact) {
      Object.keys(charity.contactInfo.primaryContact).forEach(key => {
        if (charity.contactInfo.primaryContact[key]) {
          charity.contactInfo.primaryContact[key] = EncryptionUtil.simpleDecrypt(charity.contactInfo.primaryContact[key]);
        }
      });
    }
    if (charity.contactInfo.mailingAddress) {
      Object.keys(charity.contactInfo.mailingAddress).forEach(key => {
        if (charity.contactInfo.mailingAddress[key]) {
          charity.contactInfo.mailingAddress[key] = EncryptionUtil.simpleDecrypt(charity.contactInfo.mailingAddress[key]);
        }
      });
    }
  }
  
  // Decrypt financial info
  if (charity.financialInfo) {
    if (charity.financialInfo.annualBudget) {
      charity.financialInfo.annualBudget = EncryptionUtil.simpleDecrypt(charity.financialInfo.annualBudget);
    }
    if (charity.financialInfo.fundingSources) {
      charity.financialInfo.fundingSources = charity.financialInfo.fundingSources.map(source =>
        EncryptionUtil.simpleDecrypt(source)
      );
    }
    if (charity.financialInfo.bankingInfo) {
      Object.keys(charity.financialInfo.bankingInfo).forEach(key => {
        if (charity.financialInfo.bankingInfo[key]) {
          charity.financialInfo.bankingInfo[key] = EncryptionUtil.simpleDecrypt(charity.financialInfo.bankingInfo[key]);
        }
      });
    }
  }
  
  // Decrypt programs
  if (charity.programs) {
    charity.programs.forEach(program => {
      if (program.name) program.name = EncryptionUtil.simpleDecrypt(program.name);
      if (program.description) program.description = EncryptionUtil.simpleDecrypt(program.description);
      if (program.targetAudience) program.targetAudience = EncryptionUtil.simpleDecrypt(program.targetAudience);
      if (program.budget) program.budget = EncryptionUtil.simpleDecrypt(program.budget);
    });
  }
  
  // Decrypt custom fields
  if (charity.customFields) {
    const decryptedFields = new Map();
    for (const [key, value] of charity.customFields) {
      decryptedFields.set(key, EncryptionUtil.simpleDecrypt(value));
    }
    charity.customFields = decryptedFields;
  }
  
  return charity;
};

module.exports = mongoose.model('Charity', charitySchema);