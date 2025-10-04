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
      // Fetch all following users with pagination
      let cursor = '';
      let allFollowingUsers = [];
      
      do {
        const url = cursor 
          ? `https://api.neynar.com/v2/farcaster/following/?fid=${authorFid}&limit=100&cursor=${cursor}`
          : `https://api.neynar.com/v2/farcaster/following/?fid=${authorFid}&limit=100`;
          
        const response = await fetch(url, {
          headers: {
            'x-api-key': process.env.NEYNAR_API_KEY,
          },
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch following for FID ${authorFid}: ${response.status}`);
          return false;
        }
        
        const data = await response.json();
        allFollowingUsers = allFollowingUsers.concat(data.users || []);
        cursor = data.next?.cursor || '';
        
        // Safety check to prevent infinite loops
        if (allFollowingUsers.length > 10000) {
          console.warn(`Following list too large for FID ${authorFid}, stopping at ${allFollowingUsers.length} users`);
          break;
        }
      } while (cursor);
      
      const isFollowing = allFollowingUsers.some(user => user.fid === interactorFid);
      console.log(`Audience check: Following - ${interactorFid} is ${isFollowing ? 'in' : 'NOT in'} caster's following list (checked ${allFollowingUsers.length} users)`);
      return isFollowing;
    } else if (audience === 1) { // Followers - ONLY caster's followers can get tips
      // Fetch all followers with pagination
      let cursor = '';
      let allFollowers = [];
      
      do {
        const url = cursor 
          ? `https://api.neynar.com/v2/farcaster/followers/?fid=${authorFid}&limit=100&cursor=${cursor}`
          : `https://api.neynar.com/v2/farcaster/followers/?fid=${authorFid}&limit=100`;
          
        const response = await fetch(url, {
          headers: {
            'x-api-key': process.env.NEYNAR_API_KEY,
          },
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch followers for FID ${authorFid}: ${response.status}`);
          return false;
        }
        
        const data = await response.json();
        allFollowers = allFollowers.concat(data.users || []);
        cursor = data.next?.cursor || '';
        
        // Safety check to prevent infinite loops
        if (allFollowers.length > 10000) {
          console.warn(`Followers list too large for FID ${authorFid}, stopping at ${allFollowers.length} users`);
          break;
        }
      } while (cursor);
      
      const isFollower = allFollowers.some(user => user.fid === interactorFid);
      console.log(`Audience check: Followers - ${interactorFid} is ${isFollower ? 'a' : 'NOT a'} follower of caster (checked ${allFollowers.length} users)`);
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