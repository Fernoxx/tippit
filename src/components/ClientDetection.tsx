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
      <div className="text-sm text-green-700 mt-1 space-y-1">
        <p>Client: {clientInfo.isBaseApp ? 'Base App (Coinbase)' : clientInfo.isFarcaster ? 'Farcaster' : 'Unknown'}</p>
        <p>User Agent: {clientInfo.userAgent.substring(0, 50)}...</p>
      </div>
    </div>
  );
}