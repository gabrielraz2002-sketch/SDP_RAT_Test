import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { getTimeline } from '../utils/api.js';

const CHART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#e4e4e7' },
  itemStyle: { color: '#a1a1aa' },
};

const fmtNum = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

function getBucketEnd(timestamp, gran) {
  if (gran === 'day') return timestamp + 86400 - 1;
  if (gran === 'week') return timestamp + 7 * 86400 - 1;
  const d = new Date(timestamp * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000) - 1;
}

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="font-semibold text-zinc-200 mb-1.5 pb-1 border-b border-zinc-700">{label}</p>
      <p>
        <span className="text-green-400 w-16 inline-block">Added:</span>
        <span className="text-zinc-100">{d.added.toLocaleString()}</span>
      </p>
      <p>
        <span className="text-red-400 w-16 inline-block">Removed:</span>
        <span className="text-zinc-100">{d.removed.toLocaleString()}</span>
      </p>
      <p>
        <span className="text-zinc-400 w-16 inline-block">Churn:</span>
        <span className="text-zinc-100">{d.churn.toLocaleString()}</span>
      </p>
      <p>
        <span className="text-zinc-400 w-16 inline-block">Growth:</span>
        <span className={d.growth >= 0 ? 'text-green-400' : 'text-red-400'}>
          {d.growth >= 0 ? '+' : ''}
          {d.growth.toLocaleString()}
        </span>
      </p>
    </div>
  );
}

const GRAN_OPTIONS = [
  { value: null, label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const TABS = [
  { id: 'bar', label: 'Top 10 by Churn' },
  { id: 'pie', label: 'Author Ownership' },
  { id: 'timeline', label: 'Activity Over Time' },
];

export default function MetricsCharts({ data, filters, repoId, onBucketClick }) {
  const [tab, setTab] = useState('bar');
  const [selectedGran, setSelectedGran] = useState(null); // null = auto
  const [tlData, setTlData] = useState(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState(null);

  // Fetch timeline data lazily — only when the timeline tab is active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'timeline' || !repoId) return;
    const controller = new AbortController();
    let timer;

    const doFetch = async () => {
      setTlLoading(true);
      setTlError(null);
      try {
        const params = {};
        if (filters?.since != null) params.since = filters.since;
        if (filters?.until != null) params.until = filters.until;
        if (filters?.commitHashes?.length) params.commits = filters.commitHashes.join(',');
        if (filters?.author) params.author = filters.author;
        if (filters?.path) params.path = filters.path;
        if (selectedGran) params.granularity = selectedGran;
        const result = await getTimeline(repoId, params, controller.signal);
        setTlData(result);
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setTlError(err.response?.data?.error || err.message || 'Failed to load timeline');
      } finally {
        setTlLoading(false);
      }
    };

    timer = setTimeout(doFetch, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, repoId, selectedGran, JSON.stringify(filters)]); // eslint-disable-line

  const breakdown = data?.breakdown ?? [];
  const authors = data?.authors ?? [];

  const barData = breakdown.slice(0, 10).map((r) => ({
    name: r.path.split('/').pop() || r.path,
    fullPath: r.path,
    added: r.addedLines,
    removed: r.removedLines,
  }));

  const pieData = authors
    .filter((a) => a.ownership > 0)
    .slice(0, 15)
    .map((a) => ({
      name: a.name,
      value: parseFloat((a.ownership * 100).toFixed(2)),
    }));

  const empty = (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      No data to display
    </div>
  );

  const activeBucketGran = tlData?.granularity || 'month';

  const handleAreaClick = (chartData) => {
    if (!chartData?.activePayload?.[0]?.payload || !onBucketClick) return;
    const { timestamp } = chartData.activePayload[0].payload;
    onBucketClick(timestamp, getBucketEnd(timestamp, activeBucketGran));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-700 flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Granularity selector — timeline tab only */}
      {tab === 'timeline' && (
        <div className="flex items-center gap-2 px-4 pt-3 flex-shrink-0">
          <span className="text-xs text-zinc-500">Granularity:</span>
          <div className="flex bg-zinc-700/60 rounded-lg p-0.5 gap-0.5">
            {GRAN_OPTIONS.map((g) => {
              const isActive = g.value === selectedGran;
              return (
                <button
                  key={String(g.value)}
                  onClick={() => setSelectedGran(g.value)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {g.label}
                  {g.value === null && tlData?.granularity && (
                    <span className="ml-1 text-zinc-500">({tlData.granularity})</span>
                  )}
                </button>
              );
            })}
          </div>
          {onBucketClick && (
            <span className="ml-auto text-xs text-zinc-600">Click a bar to filter by time</span>
          )}
        </div>
      )}

      <div className="flex-1 p-4 min-h-0 overflow-hidden">
        {/* ── Top 10 by Churn ── */}
        {tab === 'bar' &&
          (barData.length === 0 ? (
            empty
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                layout="vertical"
                syncId="rat-charts"
                margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={130}
                  tickFormatter={(v) => (v.length > 20 ? v.slice(0, 17) + '…' : v)}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [value.toLocaleString(), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullPath || label}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }} />
                <Bar dataKey="added" name="Added Lines" stackId="s" fill="#22c55e" radius={[0, 2, 2, 0]} />
                <Bar dataKey="removed" name="Removed Lines" stackId="s" fill="#ef4444" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ))}

        {/* ── Author Ownership ── */}
        {tab === 'pie' &&
          (pieData.length === 0 ? (
            empty
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius="70%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    percent > 0.03 ? `${name} ${(percent * 100).toFixed(1)}%` : ''
                  }
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v) => [`${v}%`, 'Ownership']}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }}
                  formatter={(value, entry) =>
                    `${value} (${entry.payload?.value?.toFixed(1)}%)`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          ))}

        {/* ── Activity Over Time ── */}
        {tab === 'timeline' &&
          (tlLoading ? (
            <div className="flex items-center justify-center h-full gap-2 text-zinc-500 text-sm">
              <span className="w-4 h-4 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
              Loading activity data…
            </div>
          ) : tlError ? (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">
              {tlError}
            </div>
          ) : !tlData?.buckets?.length ? (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              No activity data for the selected filters
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={tlData.buckets}
                syncId="rat-charts"
                margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                onClick={handleAreaClick}
                style={{ cursor: onBucketClick ? 'pointer' : 'default' }}
              >
                <defs>
                  <linearGradient id="gradAdded" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradRemoved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtNum}
                />
                <Tooltip content={<TimelineTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="added"
                  name="Added Lines"
                  stackId="1"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#gradAdded)"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="removed"
                  name="Removed Lines"
                  stackId="1"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#gradRemoved)"
                  fillOpacity={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          ))}
      </div>
    </div>
  );
}
