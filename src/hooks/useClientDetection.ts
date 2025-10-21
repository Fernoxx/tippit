// Client detection hook for Base App vs Farcaster
import { useMiniKit } from '@coinbase/onchainkit/minikit';

export function useClientDetection() {
  const { context } = useMiniKit();
  
  const isBaseApp = context?.client?.clientFid === 309857;
  const isFarcaster = context?.client?.clientFid === 1;
  const isMiniApp = isBaseApp || isFarcaster;
  
  return {
    isBaseApp,
    isFarcaster,
    isMiniApp,
    clientFid: context?.client?.clientFid,
    userFid: context?.user?.fid,
    isAdded: context?.client?.added,
    location: context?.location
  };
}