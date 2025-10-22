// Client detection component
import { useEffect, useState } from 'react';

export default function ClientDetection() {
  const [clientInfo, setClientInfo] = useState({
    isFarcaster: false,
    isBaseApp: false,
    isMiniApp: false,
    userAgent: ''
  });

  useEffect(() => {
    const detectClient = () => {
      const userAgent = navigator.userAgent;
      const isFarcaster = typeof window !== 'undefined' && !!(window as any).farcaster;
      const isBaseApp = userAgent.includes('Base') || userAgent.includes('Coinbase');
      const isMiniApp = isFarcaster || isBaseApp;

      setClientInfo({
        isFarcaster,
        isBaseApp,
        isMiniApp,
        userAgent
      });
    };

    detectClient();
  }, []);

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-green-800">
        {clientInfo.isBaseApp ? 'Base App' : clientInfo.isFarcaster ? 'Farcaster' : 'Mini App'} Detected
      </h3>
      <div className="text-sm text-green-700 mt-1 space-y-1">
        <p>Client: {clientInfo.isBaseApp ? 'Base App (Coinbase)' : clientInfo.isFarcaster ? 'Farcaster' : 'Unknown'}</p>
        <p>User Agent: {clientInfo.userAgent.substring(0, 50)}...</p>
      </div>
    </div>
  );
}
