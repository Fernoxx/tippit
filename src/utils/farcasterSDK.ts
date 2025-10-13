// Centralized Farcaster SDK manager to prevent multiple ready() calls
class FarcasterSDKManager {
  private static instance: FarcasterSDKManager;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;

  static getInstance(): FarcasterSDKManager {
    if (!FarcasterSDKManager.instance) {
      FarcasterSDKManager.instance = new FarcasterSDKManager();
    }
    return FarcasterSDKManager.instance;
  }

  async ensureReady(): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.callReady();
    return this.readyPromise;
  }

  private async callReady(): Promise<void> {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      const isMini = await sdk.isInMiniApp();
      
      if (isMini) {
        console.log('Calling Farcaster SDK ready()...');
        await sdk.actions.ready();
        console.log('✅ Farcaster SDK ready() completed successfully');
        this.isReady = true;
      } else {
        console.log('Not in Farcaster miniapp, skipping ready() call');
      }
    } catch (error) {
      console.error('❌ Farcaster SDK ready() failed:', error);
      // Reset so it can be retried
      this.readyPromise = null;
      throw error;
    }
  }

  isReadySync(): boolean {
    return this.isReady;
  }
}

export const farcasterSDK = FarcasterSDKManager.getInstance();