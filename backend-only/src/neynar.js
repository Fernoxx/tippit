// Neynar API helper functions

async function getFollowerCount(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      return data.users[0].follower_count || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching follower count:', error);
    return 0;
  }
}

async function checkAudienceCriteria(authorFid, interactorFid, audience) {
  try {
    // Audience 2 = Anyone (no restrictions)
    if (audience === 2) {
      console.log(`Audience check: Anyone allowed - ${interactorFid} can get tip`);
      return true;
    }
    
    // Use the most efficient approach: single API call to get relationship info
    // Use bulk endpoint with viewer_fid parameter for viewer_context
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${interactorFid}&viewer_fid=${authorFid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch user relationship for FID ${interactorFid}: ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    console.log('🔍 API Response structure:', JSON.stringify(data, null, 2));
    
    // Bulk endpoint returns users array
    const user = data.users?.[0];
    if (!user) {
      console.error(`No user found for FID ${interactorFid}`);
      return false;
    }
    
    const viewerContext = user.viewer_context;
    
    if (!viewerContext) {
      console.error(`No viewer_context found for FID ${interactorFid}`);
      console.log('🔍 User object structure:', JSON.stringify(user, null, 2));
      return false;
    }
    
    if (audience === 0) { // Following - ONLY users the caster follows can get tips
      const isFollowing = viewerContext.following || false;
      console.log(`Audience check: Following - ${interactorFid} is ${isFollowing ? 'in' : 'NOT in'} caster's following list`);
      return isFollowing;
    } else if (audience === 1) { // Followers - ONLY caster's followers can get tips
      const isFollower = viewerContext.followed_by || false;
      console.log(`Audience check: Followers - ${interactorFid} is ${isFollower ? 'a' : 'NOT a'} follower of caster`);
      return isFollower;
    }
    
    console.log(`Invalid audience value: ${audience}`);
    return false;
  } catch (error) {
    console.error(`Error checking audience criteria for ${interactorFid}:`, error);
    return false;
  }
}

async function getUserByFid(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    return data.users?.[0] || null;
  } catch (error) {
    console.error('Error fetching user by FID:', error);
    return null;
  }
}

async function getCastByHash(hash) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/cast?identifier=${hash}&type=hash`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    return data.cast || null;
  } catch (error) {
    console.error('Error fetching cast by hash:', error);
    return null;
  }
}

async function getNeynarScore(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      // Neynar score is in score field (0.0 to 1.0)
      return data.users[0].score || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching Neynar score:', error);
    return 0;
  }
}

async function getUserData(fid) {
  try {
    console.log(`🔍 Fetching user data for FID: ${fid}`);
    console.log(`🔑 Neynar API key exists: ${!!process.env.NEYNAR_API_KEY}`);
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    console.log(`📡 Neynar API response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`❌ Neynar API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`❌ Error response body:`, errorText);
      console.error(`❌ API Key length: ${process.env.NEYNAR_API_KEY?.length || 0}`);
      return { 
        username: null,
        display_name: null,
        pfp_url: null,
        followerCount: 0, 
        neynarScore: 0 
      };
    }
    
    const data = await response.json();
    console.log(`📊 Neynar API response data:`, data);
    
    if (data.users && data.users[0]) {
      const user = data.users[0];
      console.log(`✅ Found user data:`, user);
      return {
        username: user.username || null,
        display_name: user.display_name || null,
        pfp_url: user.pfp_url || null,
        followerCount: user.follower_count || 0,
        neynarScore: user.score || 0
      };
    }
    
    console.log(`❌ No user found in response`);
    return { 
      username: null,
      display_name: null,
      pfp_url: null,
      followerCount: 0, 
      neynarScore: 0 
    };
  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    return { 
      username: null,
      display_name: null,
      pfp_url: null,
      followerCount: 0, 
      neynarScore: 0 
    };
  }
}

// Helper function to get user data by FID (alias for getUserData)
async function getUserDataByFid(fid) {
  return await getUserData(fid);
}

// Get user data by wallet address using Neynar API
async function getUserDataByAddress(address) {
  try {
    console.log(`🔍 Fetching user data for address: ${address}`);
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Neynar API error for address ${address}:`, response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log(`📊 Neynar response for ${address}:`, data);

    if (data.users && data.users.length > 0) {
      const user = data.users[0];
      return {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        followerCount: user.follower_count || 0
      };
    }

    return null;
  } catch (error) {
    console.error(`❌ Error fetching user data for address ${address}:`, error);
    return null;
  }
}

module.exports = {
  getFollowerCount,
  checkAudienceCriteria,
  getUserByFid,
  getCastByHash,
  getNeynarScore,
  getUserData,
  getUserDataByFid,
  getUserDataByAddress
};