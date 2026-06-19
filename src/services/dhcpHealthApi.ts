import { API_BASE } from '../apiConfig';

export interface DhcpHealthRecord {
  Id: number;
  DHCPServer: string;
  PingStatus: string | boolean;
  DHCPServiceStatus: string;
  ScopeCount: number;
  UsagePercentage: number;
  FailoverPartner: string | null;
  FailoverMode: string;
  LastChecked: string;
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
  const res = await fetch(`${API_BASE}/api/dhcp-health`);
  if (!res.ok) throw new Error('Failed to fetch DHCP health data');
  return res.json();
};

export const fetchDhcpHealthSummary = async (): Promise<DhcpHealthSummaryResponse> => {
  const res = await fetch(`${API_BASE}/api/dhcp-health/summary`);
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
    'Last Checked',
  ];

  const rows = data.map((r) => [
    r.DHCPServer,
    String(r.PingStatus),
    r.DHCPServiceStatus,
    String(r.ScopeCount),
    String(r.UsagePercentage),
    r.FailoverPartner || 'N/A',
    r.FailoverMode,
    r.LastChecked,
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