// Simple script to clear the blocklist
// This will be used by the running server to clear the blocklist

console.log('🧹 CLEARING BLOCKLIST...');

// Try to find the correct server URL
const possibleUrls = [
  'https://ecion-backend-production.up.railway.app',
  'https://ecion-backend.up.railway.app',
  'https://ecion-backend-production.railway.app',
  'https://ecion-backend.railway.app',
  'https://ecion-backend-production.up.railway.app',
  'https://ecion-backend-production.up.railway.app',
  'https://ecion-backend-production.up.railway.app'
];

async function clearBlocklist() {
  for (const url of possibleUrls) {
    try {
      console.log(`Trying: ${url}/api/debug/clear-blocklist`);
      const response = await fetch(`${url}/api/debug/clear-blocklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ SUCCESS:', result);
        return;
      } else {
        console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('❌ Could not find running server');
}

clearBlocklist();