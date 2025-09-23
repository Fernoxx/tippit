'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [spendingLimit, setSpendingLimit] = useState(100);
  const [tipAmounts, setTipAmounts] = useState({
    like: 1,
    reply: 2,
    recast: 3,
    quoteCast: 4,
    follow: 5,
  });

  const handleSave = () => {
    // Logic to save settings to backend/contract
    alert('Settings saved!');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      
      {/* Spending Limit Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Set Spending Limit</h3>
        <div className="flex items-center space-x-4">
          <label htmlFor="spending-limit" className="text-sm font-medium">USDC Allowance:</label>
          <input
            id="spending-limit"
            type="number"
            value={spendingLimit}
            onChange={(e) => setSpendingLimit(Number(e.target.value))}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <button onClick={handleSave} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">Set Limit</button>
        <button className="mt-4 ml-2 bg-red-500 text-white px-4 py-2 rounded">Revoke Access</button>
      </div>

      {/* Tipping Amount Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Set Tipping Amounts</h3>
        <div className="space-y-4">
          {Object.entries(tipAmounts).map(([action, amount]) => (
            <div key={action} className="flex items-center space-x-4">
              <label className="text-sm font-medium capitalize w-20">{action}:</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setTipAmounts({ ...tipAmounts, [action]: Number(e.target.value) })}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">USDC</span>
            </div>
          ))}
        </div>
        <button onClick={handleSave} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">Save Amounts</button>
      </div>
    </div>
  );
}