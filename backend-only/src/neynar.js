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
    
    if (audience === 0) { // Following - ONLY users the caster follows can get tips
      // Use a more efficient approach: check if interactor is in caster's following list
      // by fetching caster's following list with a reasonable limit first
      const response = await fetch(`https://api.neynar.com/v2/farcaster/following/?fid=${authorFid}&limit=100`, {
        headers: {
          'x-api-key': process.env.NEYNAR_API_KEY,
        },
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch following for FID ${authorFid}: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      const isFollowing = data.users?.some(user => user.fid === interactorFid) || false;
      
      if (isFollowing) {
        console.log(`Audience check: Following - ${interactorFid} is in caster's following list`);
        return true;
      }
      
      // If not found in first 100, check if we need to fetch more
      // Only do this if the caster has more than 100 following
      if (data.next?.cursor) {
        console.log(`User ${interactorFid} not in first 100 following, checking remaining...`);
        // For now, let's be conservative and only check first 100 to save API calls
        // TODO: Implement full pagination only when needed
        console.log(`Audience check: Following - ${interactorFid} is NOT in caster's following list (checked first 100)`);
        return false;
      }
      
      console.log(`Audience check: Following - ${interactorFid} is NOT in caster's following list`);
      return false;
    } else if (audience === 1) { // Followers - ONLY caster's followers can get tips
      // Use a more efficient approach: check if interactor follows the caster
      // by fetching caster's followers list with a reasonable limit first
      const response = await fetch(`https://api.neynar.com/v2/farcaster/followers/?fid=${authorFid}&limit=100`, {
        headers: {
          'x-api-key': process.env.NEYNAR_API_KEY,
        },
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch followers for FID ${authorFid}: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      const isFollower = data.users?.some(user => user.fid === interactorFid) || false;
      
      if (isFollower) {
        console.log(`Audience check: Followers - ${interactorFid} is a follower of caster`);
        return true;
      }
      
      // If not found in first 100, check if we need to fetch more
      // Only do this if the caster has more than 100 followers
      if (data.next?.cursor) {
        console.log(`User ${interactorFid} not in first 100 followers, checking remaining...`);
        // For now, let's be conservative and only check first 100 to save API calls
        // TODO: Implement full pagination only when needed
        console.log(`Audience check: Followers - ${interactorFid} is NOT a follower of caster (checked first 100)`);
        return false;
      }
      
      console.log(`Audience check: Followers - ${interactorFid} is NOT a follower of caster`);
      return false;
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