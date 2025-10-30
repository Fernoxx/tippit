-- EMERGENCY: Restore 23 deleted users
-- Run this SQL directly in Railway's PostgreSQL database console

-- Step 1: Restore all 23 users by setting is_tracking=true
UPDATE user_profiles 
SET is_tracking = true, updated_at = NOW()
WHERE fid IN (
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
);

-- Step 2: Check which users were restored
SELECT 
  fid, 
  user_address, 
  username, 
  display_name, 
  is_tracking,
  updated_at
FROM user_profiles 
WHERE fid IN (
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
)
ORDER BY fid;

-- Step 3: Count total active users
SELECT COUNT(*) as total_active_users
FROM user_profiles
WHERE is_tracking = true;
