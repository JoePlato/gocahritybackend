const axios = require('axios');
const readline = require('readline');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Helper function to get admin token
async function getAdminToken() {
  console.log('\n🔐 Admin Authentication Required');
  console.log('===============================');
  
  const email = await prompt('Enter admin email: ');
  const password = await prompt('Enter admin password: ');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email,
      password
    });
    
    if (!response.data.user.isAdmin) {
      throw new Error('User is not an admin');
    }
    
    console.log(`✅ Authenticated as admin: ${response.data.user.email}\n`);
    return response.data.accessToken;
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

// Generate single charity code
async function generateSingleCode(token) {
  console.log('📝 Creating Single Charity Code');
  console.log('==============================');
  
  const description = await prompt('Enter description (optional): ');
  const customCode = await prompt('Enter custom code (8 chars, optional): ');
  const daysValid = await prompt('Enter days valid (default 30): ') || '30';
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(daysValid));
  
  const requestData = {
    expiresAt: expiresAt.toISOString(),
    ...(description && { description }),
    ...(customCode && { code: customCode.toUpperCase() })
  };
  
  try {
    const response = await axios.post(`${BASE_URL}/api/admin/charity-codes`, requestData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\n✅ Charity code created successfully!');
    console.log('====================================');
    console.log(`Code: ${response.data.code.code}`);
    console.log(`Expires: ${new Date(response.data.code.expiresAt).toLocaleDateString()}`);
    console.log(`Description: ${response.data.code.description || 'None'}`);
    console.log(`ID: ${response.data.code.id}\n`);
    
  } catch (error) {
    console.error('❌ Failed to create code:', error.response?.data?.error || error.message);
  }
}

// Generate multiple charity codes
async function generateBulkCodes(token) {
  console.log('📦 Creating Multiple Charity Codes');
  console.log('==================================');
  
  const count = await prompt('Enter number of codes to generate (max 50): ');
  const description = await prompt('Enter description for batch (optional): ');
  const daysValid = await prompt('Enter days valid (default 30): ') || '30';
  
  if (parseInt(count) > 50 || parseInt(count) < 1) {
    console.error('❌ Count must be between 1 and 50');
    return;
  }
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(daysValid));
  
  const requestData = {
    count: parseInt(count),
    expiresAt: expiresAt.toISOString(),
    ...(description && { description })
  };
  
  try {
    const response = await axios.post(`${BASE_URL}/api/admin/charity-codes/bulk`, requestData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`\n✅ ${count} charity codes created successfully!`);
    console.log('='.repeat(50));
    console.log(`Expires: ${new Date(expiresAt).toLocaleDateString()}\n`);
    
    console.log('Generated Codes:');
    console.log('----------------');
    response.data.codes.forEach((code, index) => {
      console.log(`${(index + 1).toString().padStart(2)}: ${code.code} | ${code.description}`);
    });
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to create codes:', error.response?.data?.error || error.message);
  }
}

// View charity code statistics
async function viewCodeStats(token) {
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/charity-codes/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const stats = response.data.stats;
    
    console.log('\n📊 Charity Code Statistics');
    console.log('==========================');
    console.log(`Total Codes: ${stats.total}`);
    console.log(`Active Codes: ${stats.active}`);
    console.log(`Used Codes: ${stats.used}`);
    console.log(`Expired Codes: ${stats.expired}`);
    console.log(`Unused Codes: ${stats.unused}\n`);
    
  } catch (error) {
    console.error('❌ Failed to get statistics:', error.response?.data?.error || error.message);
  }
}

// View active charity codes
async function viewActiveCodes(token) {
  try {
    const response = await axios.get(`${BASE_URL}/api/admin/charity-codes?status=active&limit=20`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\n🟢 Active Charity Codes (Last 20)');
    console.log('=================================');
    
    if (response.data.codes.length === 0) {
      console.log('No active codes found.\n');
      return;
    }
    
    response.data.codes.forEach(code => {
      const expires = new Date(code.expiresAt).toLocaleDateString();
      console.log(`${code.code} | Expires: ${expires} | ${code.description || 'No description'}`);
    });
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to get active codes:', error.response?.data?.error || error.message);
  }
}

// Main menu
async function showMenu() {
  console.log('🏗️  Charity Code Generator');
  console.log('=========================');
  console.log('1. Generate single code');
  console.log('2. Generate multiple codes');
  console.log('3. View code statistics');
  console.log('4. View active codes');
  console.log('5. Exit');
  
  return await prompt('\nSelect option (1-5): ');
}

// Main function
async function main() {
  console.log('🎯 Welcome to the Charity Code Generator!');
  console.log('This script allows admins to generate charity authorization codes.\n');
  
  const token = await getAdminToken();
  
  while (true) {
    const choice = await showMenu();
    
    switch (choice) {
      case '1':
        await generateSingleCode(token);
        break;
      case '2':
        await generateBulkCodes(token);
        break;
      case '3':
        await viewCodeStats(token);
        break;
      case '4':
        await viewActiveCodes(token);
        break;
      case '5':
        console.log('\n👋 Goodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid option. Please choose 1-5.\n');
    }
    
    await prompt('Press Enter to continue...');
    console.clear();
  }
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  console.log('\n\n👋 Script terminated by user');
  rl.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Unexpected error:', error.message);
  rl.close();
  process.exit(1);
});

// Start the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    rl.close();
    process.exit(1);
  });
}

module.exports = { main };