# Deployment Guide - Direct to Main

This project is configured to deploy directly to production from the main branch.

## Initial Setup

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: PIT - Post Incentive Tipping"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pit-app.git
   git push -u origin main
   ```

2. **Set up Vercel**
   - Import project from GitHub at https://vercel.com/new
   - Select the `pit-app` repository
   - Configure environment variables:
     - `WALLETCONNECT_PROJECT_ID`
     - `PIT_TIPPING_ADDRESS` (after contract deployment)
     - `FARCASTER_ORACLE_ADDRESS` (after contract deployment)

3. **Configure GitHub Secrets**
   Go to Settings > Secrets and add:
   - `VERCEL_TOKEN` - Get from https://vercel.com/account/tokens
   - `VERCEL_ORG_ID` - Found in Vercel project settings
   - `VERCEL_PROJECT_ID` - Found in Vercel project settings
   - `WALLETCONNECT_PROJECT_ID` - From WalletConnect Cloud
   - `DEPLOYER_PRIVATE_KEY` - For contract deployment
   - `BASE_RPC_URL` - Base network RPC endpoint
   - `BASESCAN_API_KEY` - For contract verification

## Daily Development Workflow

### Quick Push to Main
```bash
# Make your changes
npm run dev  # Test locally

# Push directly to main
./scripts/push-to-main.sh "feat: add new feature"
```

### Manual Git Commands
```bash
# Stage changes
git add .

# Commit
git commit -m "feat: your feature description"

# Push to main
git push origin main
```

## Contract Deployment

1. **Deploy via GitHub Actions**
   - Go to Actions tab
   - Select "Deploy Smart Contracts"
   - Click "Run workflow"
   - Choose network (base-goerli for testing, base for production)

2. **Update Contract Addresses**
   After deployment, update these secrets in GitHub:
   - `PIT_TIPPING_ADDRESS`
   - `FARCASTER_ORACLE_ADDRESS`

## Automatic Deployments

Every push to main triggers:
1. Build verification
2. Test execution (if tests exist)
3. Automatic deployment to Vercel
4. Production URL update

## Monitoring

- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub Actions**: Check the Actions tab for deployment status
- **Contract Explorer**: https://basescan.org

## Rollback

If issues occur:
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push --force origin main
```

## Best Practices

1. **Always test locally first**
   ```bash
   npm run dev
   npm run build
   ```

2. **Use descriptive commit messages**
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `style:` for UI changes
   - `refactor:` for code improvements

3. **Monitor deployments**
   - Check GitHub Actions for build status
   - Verify on Vercel dashboard
   - Test production site after deployment

## Emergency Contacts

- Vercel Status: https://vercel-status.com
- Base Network Status: https://status.base.org