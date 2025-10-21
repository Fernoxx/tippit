// Client detection component
import { useClientDetection } from '@/hooks/useClientDetection';

export default function ClientDetection() {
  const { isBaseApp, isFarcaster, isMiniApp, clientFid, userFid, isAdded, location } = useClientDetection();
  
  if (!isMiniApp) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium text-yellow-800">Not in Mini App</h3>
        <p className="text-sm text-yellow-700 mt-1">
          This app works best in Base App or Farcaster. Open it in one of these clients for the full experience.
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-green-800">
        {isBaseApp ? 'Base App' : isFarcaster ? 'Farcaster' : 'Mini App'} Detected
      </h3>
      <div className="text-sm text-green-700 mt-1 space-y-1">
        <p>Client: {isBaseApp ? 'Base App (Coinbase)' : isFarcaster ? 'Farcaster' : 'Unknown'}</p>
        <p>User FID: {userFid || 'Unknown'}</p>
        <p>Added: {isAdded ? 'Yes' : 'No'}</p>
        <p>Location: {typeof location === 'string' ? location : 'Unknown'}</p>
      </div>
    </div>
  );
}