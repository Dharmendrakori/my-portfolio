import React from 'react';

const AdDomainControllerTimeSyncDashboardPage: React.FC = () => {
  // Uses the repo's existing theme exactly (Matrix + glassmorphism) by rendering
  // the existing dashboard HTML directly.
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <iframe
        title="AD Domain Controller Time Synchronization Monitor"
        src="/demo/ad-domain-controller-time-sync-dashboard.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
};

export default AdDomainControllerTimeSyncDashboardPage;

