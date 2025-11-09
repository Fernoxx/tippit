# Notification System Documentation

## Flow Confirmation ✅

### Cast Tracking Flow:
1. **When user approves USDC allowance:**
   - Their FID is added to `follow.created` webhook (active users)
   - Their latest cast is fetched and saved to database (`user_profiles.latest_cast_hash`)
   - Their cast hash is added to `cast.created.parent_hashes` and `reaction.created.target_cast_hashes` webhooks
   - Homepage cache is updated with their cast

2. **API Polling (Every 15 minutes):**
   - `pollLatestCasts()` runs every 15 minutes
   - Fetches latest casts for all active users (FIDs in `follow.created`)
   - Updates `user_profiles.latest_cast_hash` in database
   - Updates homepage cache via `refreshActiveCastEntry()`
   - Updates webhook filters with new cast hashes

3. **Webhook `cast.created` events:**
   - When a tracked user posts a new main cast, webhook fires
   - Cast hash is saved to database (`user_profiles.latest_cast_hash`)
   - Homepage cache is updated immediately via `refreshActiveCastEntry()`

## Notification System

### Current Notifications Being Sent:

1. **Allowance Empty Notification** (when user removed from follow.created due to insufficient allowance)
   - Title: "Approve More Token Allowance"
   - Message: "Your token allowance is too low. Please approve more tokens to continue earning tips!"
   - Sent: Once per user (tracked by `allowanceEmptyNotificationSent` flag)
   - Trigger: When `removeFidFromWebhook()` is called with reason `insufficient_allowance`

2. **Insufficient Balance Notification** (when user removed after tip due to low balance)
   - Title: "Insufficient Balance"
   - Message: "Your token balance is too low to continue tipping. Please add more tokens to continue earning tips!"
   - Sent: When user is removed after tip processing due to insufficient balance
   - Trigger: In `batchTransferManager.js` after tip processing

3. **Balance Restored Notification** (when user balance is restored)
   - Title: "You're Back!"
   - Message: "Your balance is restored! You're now active and can tip your audience again. 🎉"
   - Sent: When user balance is restored during hourly check
   - Trigger: In `checkRemovedUsersForBalanceRestoration()`

4. **Daily Earnings Notification** (scheduled daily)
   - Title: "You earned from Ecion in the last 24 hours"
   - Message: Shows total earnings for the day
   - Sent: Once per day at 9 AM UTC (if user earned minimum amount)
   - Trigger: Scheduled job

### Notification Requirements:

**Neynar Endpoint We're Using:**
- We're using the **Farcaster Notification API** directly
- Endpoint: User's `notification_url` (stored in database when they add mini app)
- Method: POST
- Body format:
  ```json
  {
    "notificationId": "unique-id",
    "title": "Notification Title",
    "body": "Notification Message",
    "targetUrl": "https://ecion.vercel.app",
    "tokens": ["user-notification-token"]
  }
  ```

**What We Need:**
- Users must add the mini app to receive notifications
- Notification tokens are stored in database when user adds mini app
- We check `hasNotificationTokens()` before sending
- If user hasn't added mini app, notification is skipped (logged but not sent)

### Notification Statistics:

To check total notifications being sent, you can:
1. Check logs for `📧 Sent` messages
2. Use endpoint: `/api/debug/notification-tokens` to see all users with notification tokens
3. Check database `notification_tokens` table

### Issues Fixed:

1. ✅ **Notification not sending when user removed from follow.created:**
   - Added notification sending in `removeFidFromWebhook()` function
   - Notification sent when reason is `insufficient_allowance` or `insufficient_funds`
   - Only sent once per user (tracked by `allowanceEmptyNotificationSent` flag)

2. ✅ **Notification tracking:**
   - `allowanceEmptyNotificationSent` flag prevents duplicate notifications
   - Flag is reset when user approves more tokens
