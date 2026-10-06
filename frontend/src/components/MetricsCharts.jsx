import { useState } from 'react';
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
} from 'recharts';

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

export default function MetricsCharts({ data }) {
  const [tab, setTab] = useState('bar');

  const breakdown = data?.breakdown ?? [];
  const authors = data?.authors ?? [];

  // Top 10 by churn (already sorted desc by backend).
  const barData = breakdown.slice(0, 10).map((r) => ({
    name: r.path.split('/').pop() || r.path,
    fullPath: r.path,
    added: r.addedLines,
    removed: r.removedLines,
  }));

  // Author ownership pie slices (top 15, filter zero ownership).
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

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-700 flex-shrink-0">
        {[
          { id: 'bar', label: 'Top 10 by Churn' },
          { id: 'pie', label: 'Author Ownership' },
        ].map((t) => (
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

      <div className="flex-1 p-4 min-h-0">
        {tab === 'bar' ? (
          barData.length === 0 ? (
            empty
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                layout="vertical"
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
                  formatter={(value, name, props) => [
                    value.toLocaleString(),
                    name,
                  ]}
                  labelFormatter={(label, payload) =>
                    payload?.[0]?.payload?.fullPath || label
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }}
                />
                <Bar dataKey="added" name="Added Lines" stackId="s" fill="#22c55e" radius={[0, 2, 2, 0]} />
                <Bar dataKey="removed" name="Removed Lines" stackId="s" fill="#ef4444" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : pieData.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
