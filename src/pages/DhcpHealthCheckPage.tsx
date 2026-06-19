import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  fetchDhcpHealth,
  fetchDhcpHealthSummary,
  exportDhcpHealthCsv,
  type DhcpHealthRecord,
  type DhcpHealthSummary,
} from '../services/dhcpHealthApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  gray: '#6b7280',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  green: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  amber: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  red: 'bg-red-500/20 text-red-300 border border-red-500/40',
  blue: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  gray: 'bg-gray-500/20 text-gray-300 border border-gray-500/40',
};

type SortDir = 'asc' | 'desc';

function getStatus(server: DhcpHealthRecord): 'Healthy' | 'Warning' | 'Critical' {
  if (server.overallStatus) return server.overallStatus as 'Healthy' | 'Warning' | 'Critical';
  if (server.pingStatus === 'False' || server.dhcpServiceStatus === 'Stopped') return 'Critical';
  if (server.usagePercentage >= 80) return 'Warning';
  return 'Healthy';
}

function getPingBadge(value: string) {
  const ok = value === 'True';
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[ok ? 'green' : 'red']}`}>
      {ok ? 'Reachable' : 'Unreachable'}
    </span>
  );
}

function getServiceBadge(value: string) {
  const ok = value === 'Running';
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[ok ? 'green' : 'red']}`}>
      {value}
    </span>
  );
}

function getUsageColor(value: number) {
  if (value <= 70) return 'green';
  if (value <= 85) return 'amber';
  return 'red';
}

function getFailoverBadge(value: string) {
  const normalized = value.toLowerCase();
  let color: keyof typeof STATUS_BADGE_CLASSES = 'gray';
  if (normalized.includes('hot standby')) color = 'green';
  else if (normalized.includes('load balance')) color = 'blue';
  else if (normalized.includes('interrupted')) color = 'red';
  else if (normalized.includes('standalone')) color = 'gray';

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[color]}`}>
      {value}
    </span>
  );
}

function getHealthBadge(status: 'Healthy' | 'Warning' | 'Critical') {
  const map = {
    Healthy: STATUS_BADGE_CLASSES.green,
    Warning: STATUS_BADGE_CLASSES.amber,
    Critical: STATUS_BADGE_CLASSES.red,
  } as const;
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status]}`}>{status}</span>;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: 9 }).map((_, idx) => (
        <td key={idx} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-white/10" />
        </td>
      ))}
    </tr>
  );
}

export default function DhcpHealthCheckPage() {
  const [records, setRecords] = useState<DhcpHealthRecord[]>([]);
  const [summary, setSummary] = useState<DhcpHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof DhcpHealthRecord>('dhcpServer');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    try {
      const [healthRes, summaryRes] = await Promise.all([fetchDhcpHealth(), fetchDhcpHealthSummary()]);
      console.log('DHCP API Response', healthRes.data);
      if (healthRes.success && healthRes.data) setRecords(healthRes.data);
      if (summaryRes.success && summaryRes.summary) setSummary(summaryRes.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((r) => {
      const haystack = [
        r.dhcpServer,
        r.pingStatus,
        r.dhcpServiceStatus,
        String(r.scopeCount),
        String(r.usagePercentage),
        r.failoverPartner || '',
        r.failoverMode,
        r.lastChecked,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [records, search]);

  const sorted = useMemo(() => {
    const data = [...filtered];
    data.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortDir === 'asc' ? -1 : 1;
      return sortDir === 'asc' ? 1 : -1;
    });
    return data;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: keyof DhcpHealthRecord) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleExport = () => {
    exportDhcpHealthCsv(records);
  };

  const kpis = [
    { label: 'Total DHCP Servers', value: summary?.totalServers ?? 0, trend: 'Total monitored', color: 'text-white' },
    { label: 'Reachable Servers', value: summary?.reachableServers ?? 0, trend: 'Ping OK', color: 'text-emerald-300' },
    { label: 'Running DHCP Services', value: summary?.runningServices ?? 0, trend: 'Service active', color: 'text-emerald-300' },
    { label: 'Warning Servers', value: summary?.warningServers ?? 0, trend: 'Usage 80-90%', color: 'text-amber-300' },
    { label: 'Critical Servers', value: summary?.criticalServers ?? 0, trend: 'Ping/Service down or >90%', color: 'text-red-300' },
    { label: 'Average Scope Utilization', value: `${summary?.avgScopeUtilization ?? 0}%`, trend: 'Across all scopes', color: 'text-white' },
  ];

  const scopeChartData = useMemo(
    () =>
      records.map((r) => ({
        server: r.dhcpServer,
        usage: Number(r.usagePercentage || 0),
      })),
    [records]
  );

  const serviceStatusData = useMemo(() => {
    const running = records.filter((r) => r.dhcpServiceStatus === 'Running').length;
    const stopped = records.length - running;
    return [
      { name: 'Running', value: running },
      { name: 'Stopped', value: stopped },
    ];
  }, [records]);

  const failoverModeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      const mode = r.failoverMode || 'Unknown';
      counts[mode] = (counts[mode] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [records]);

  const healthOverviewData = useMemo(() => {
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    for (const r of records) {
      const status = getStatus(r);
      if (status === 'Healthy') healthy++;
      else if (status === 'Warning') warning++;
      else critical++;
    }
    return [
      { name: 'Servers', healthy, warning, critical },
    ];
  }, [records]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-screen bg-[#050b14] p-4 md:p-6 text-gray-100"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              DHCP Health Check Automation
            </h1>
            <p className="text-sm text-gray-400">
              Enterprise DHCP monitoring and reporting solution for proactive infrastructure management.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-200 transition hover:border-emerald-400/40 hover:text-emerald-300"
            >
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur"
            >
              <p className="text-xs text-gray-400">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="mt-1 text-[11px] text-gray-500">{kpi.trend}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-semibold text-gray-200">Scope Utilization by DHCP Server</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scopeChartData}>
                  <XAxis dataKey="server" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={0} angle={-35} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    itemStyle={{ color: '#e5e7eb' }}
                  />
                  <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                    {scopeChartData.map((entry) => (
                      <Cell key={entry.server} fill={getUsageColor(entry.usage) === 'green' ? COLORS.green : getUsageColor(entry.usage) === 'amber' ? COLORS.amber : COLORS.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-semibold text-gray-200">DHCP Service Status Distribution</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={serviceStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    <Cell key="running" fill={COLORS.green} />
                    <Cell key="stopped" fill={COLORS.red} />
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    itemStyle={{ color: '#e5e7eb' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-semibold text-gray-200">Failover Mode Distribution</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failoverModeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {failoverModeData.map((entry, idx) => (
                      <Cell key={entry.name} fill={[COLORS.green, COLORS.blue, COLORS.red, COLORS.gray, COLORS.amber][idx % 5]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    itemStyle={{ color: '#e5e7eb' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
            <h2 className="mb-3 text-sm font-semibold text-gray-200">Server Health Overview</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthOverviewData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={70} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0b1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    itemStyle={{ color: '#e5e7eb' }}
                  />
                  <Bar dataKey="healthy" stackId="a" fill={COLORS.green} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="warning" stackId="a" fill={COLORS.amber} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="critical" stackId="a" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-white/5 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-200">DHCP Servers</h2>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">{filtered.length}</span>
            </div>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search servers..."
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-emerald-400/60 md:w-72"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase text-gray-400">
                  {[
                    ['dhcpServer', 'DHCP Server'],
                    ['pingStatus', 'Ping Status'],
                    ['dhcpServiceStatus', 'DHCP Service'],
                    ['scopeCount', 'Scope Count'],
                    ['usagePercentage', 'Usage %'],
                    ['failoverPartner', 'Failover Partner'],
                    ['failoverMode', 'Failover Mode'],
                    ['overallStatus', 'Overall Status'],
                    ['lastChecked', 'Last Checked'],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key as keyof DhcpHealthRecord)}
                      className="cursor-pointer select-none px-4 py-3 font-medium hover:text-emerald-300"
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {sortKey === key && <span className="text-[10px] text-emerald-400">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => <SkeletonRow key={idx} />)
                ) : pageData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                      No DHCP health records found.
                    </td>
                  </tr>
                ) : (
                  pageData.map((r) => {
                    const status = getStatus(r);
                    return (
                      <tr key={r.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{r.dhcpServer}</td>
                        <td className="px-4 py-3">{getPingBadge(r.pingStatus)}</td>
                        <td className="px-4 py-3">{getServiceBadge(r.dhcpServiceStatus)}</td>
                        <td className="px-4 py-3 text-gray-300">{r.scopeCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${getUsageColor(Number(r.usagePercentage || 0)) === 'green' ? 'text-emerald-300' : getUsageColor(Number(r.usagePercentage || 0)) === 'amber' ? 'text-amber-300' : 'text-red-300'}`}>
                              {r.usagePercentage}%
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full rounded-full ${getUsageColor(Number(r.usagePercentage || 0)) === 'green' ? 'bg-emerald-500' : getUsageColor(Number(r.usagePercentage || 0)) === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(Number(r.usagePercentage || 0), 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{r.failoverPartner || 'N/A'}</td>
                        <td className="px-4 py-3">{getFailoverBadge(r.failoverMode)}</td>
                        <td className="px-4 py-3">{getHealthBadge(status)}</td>
                        <td className="px-4 py-3 text-gray-400">{r.lastChecked}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-gray-400">
            <span>
              Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 transition hover:border-emerald-400/40 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 transition hover:border-emerald-400/40 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}