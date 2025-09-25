// Neynar API helper functions

async function getFollowerCount(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
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
    if (audience === 2) { // Anyone
      return true;
    }
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/follows?fid=${authorFid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    
    if (audience === 0) { // Following - check if interactor is in author's following
      return data.following?.some(user => user.fid === interactorFid) || false;
    } else if (audience === 1) { // Followers - check if interactor is in author's followers
      return data.followers?.some(user => user.fid === interactorFid) || false;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking audience criteria:', error);
    return false;
  }
}

async function getUserByFid(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
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
        'api_key': process.env.NEYNAR_API_KEY,
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
        'api_key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      // Neynar score is in power_badge field (0.0 to 1.0)
      return data.users[0].power_badge || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching Neynar score:', error);
    return 0;
  }
}

async function getUserData(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      const user = data.users[0];
      return {
        followerCount: user.follower_count || 0,
        neynarScore: user.power_badge || 0
      };
    }
    return { followerCount: 0, neynarScore: 0 };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { followerCount: 0, neynarScore: 0 };
  }
}

module.exports = {
  getFollowerCount,
  checkAudienceCriteria,
  getUserByFid,
  getCastByHash,
  getNeynarScore,
  getUserData
};