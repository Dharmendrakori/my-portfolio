export interface DhcpHealthRecord {
  id: number;
  dhcpServer: string;
  pingStatus: string;
  dhcpServiceStatus: string;
  scopeCount: number;
  usagePercentage: number;
  failoverPartner: string | null;
  failoverMode: string;
  overallStatus?: string;
  lastChecked: string;
}

export interface DhcpHealthSummary {
  totalServers: number;
  reachableServers: number;
  runningServices: number;
  warningServers: number;
  criticalServers: number;
  avgScopeUtilization: number;
}

export interface DhcpHealthResponse {
  success: boolean;
  data?: DhcpHealthRecord[];
  message?: string;
  error?: string;
}

export interface DhcpHealthSummaryResponse {
  success: boolean;
  summary?: DhcpHealthSummary;
  error?: string;
}

export const fetchDhcpHealth = async (): Promise<DhcpHealthResponse> => {
  const res = await fetch(`${import.meta.env.VITE_API_BASE || 'https://portfolio-api-3sx8.onrender.com'}/api/dhcp-health`);
  if (!res.ok) throw new Error('Failed to fetch DHCP health data');
  return res.json();
};

export const fetchDhcpHealthSummary = async (): Promise<DhcpHealthSummaryResponse> => {
  const res = await fetch(`${import.meta.env.VITE_API_BASE || 'https://portfolio-api-3sx8.onrender.com'}/api/dhcp-health/summary`);
  if (!res.ok) throw new Error('Failed to fetch DHCP health summary');
  return res.json();
};

export const exportDhcpHealthCsv = (data: DhcpHealthRecord[]): void => {
  if (!data.length) return;

  const headers = [
    'DHCP Server',
    'Ping Status',
    'DHCP Service',
    'Scope Count',
    'Usage %',
    'Failover Partner',
    'Failover Mode',
    'Overall Status',
    'Last Checked',
  ];

  const rows = data.map((r) => [
    r.dhcpServer,
    r.pingStatus,
    r.dhcpServiceStatus,
    String(r.scopeCount),
    String(r.usagePercentage),
    r.failoverPartner || 'N/A',
    r.failoverMode,
    r.overallStatus || 'Unknown',
    r.lastChecked,
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dhcp-health-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};