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
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user?fid=${interactorFid}&viewer_fid=${authorFid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch user relationship for FID ${interactorFid}: ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    const viewerContext = data.user?.viewer_context;
    
    if (!viewerContext) {
      console.error(`No viewer_context found for FID ${interactorFid}`);
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
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    if (data.users && data.users[0]) {
      const user = data.users[0];
      return {
        followerCount: user.follower_count || 0,
        neynarScore: user.score || 0
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