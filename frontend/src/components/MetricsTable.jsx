import { useState, useMemo } from 'react';

const COLUMNS = [
  { key: 'path', label: 'Path', align: 'left' },
  { key: 'addedLines', label: 'Added', align: 'right' },
  { key: 'removedLines', label: 'Removed', align: 'right' },
  { key: 'growth', label: 'Growth', align: 'right' },
  { key: 'churn', label: 'Churn', align: 'right' },
  { key: 'modifications', label: 'Mods', align: 'right' },
  { key: 'modificationFrequency', label: 'Mod Freq', align: 'right' },
  { key: 'churnRate', label: 'Churn Rate', align: 'right' },
  { key: 'topAuthor', label: 'Top Author', align: 'left' },
];

const PAGE_SIZE = 50;

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_, i) => (
    <tr key={i} className="border-b border-zinc-700/40">
      {COLUMNS.map((c) => (
        <td key={c.key} className="px-3 py-2">
          <div
            className="h-3 bg-zinc-700 rounded animate-pulse"
            style={{ width: c.key === 'path' ? 140 : c.key === 'topAuthor' ? 100 : 40 }}
          />
        </td>
      ))}
    </tr>
  ));
}

export default function MetricsTable({ data, loading, onPathClick }) {
  const [sortKey, setSortKey] = useState('churn');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const rows = data?.breakdown ?? [];

  const sorted = useMemo(() => {
    if (!rows.length) return rows;
    return [...rows].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'topAuthor') {
        av = a.topAuthor?.ownership ?? 0;
        bv = b.topAuthor?.ownership ?? 0;
      }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label).join(',');
    const body = sorted.map((r) =>
      COLUMNS.map((c) => {
        if (c.key === 'topAuthor') {
          const own = ((r.topAuthor?.ownership ?? 0) * 100).toFixed(1);
          return `"${r.topAuthor?.name ?? ''} (${own}%)"`;
        }
        if (c.key === 'modificationFrequency')
          return `${((r[c.key] ?? 0) * 100).toFixed(2)}%`;
        if (c.key === 'churnRate') return (r[c.key] ?? 0).toFixed(2);
        return r[c.key] ?? '';
      }).join(',')
    );
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'metrics.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 flex-shrink-0">
        <span className="text-xs text-zinc-500">{rows.length} items</span>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-600 rounded px-2.5 py-1 transition-colors disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs text-zinc-300 border-collapse">
          <thead className="bg-zinc-800 sticky top-0 z-10">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`px-3 py-2 font-medium text-zinc-400 cursor-pointer hover:text-zinc-100 select-none whitespace-nowrap border-b border-zinc-700 ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-indigo-400">
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <SkeletonRows />}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-3 py-10 text-center text-zinc-500 text-sm"
                >
                  No data for the selected filters
                </td>
              </tr>
            )}
            {pageRows.map((row, i) => (
              <tr
                key={`${row.path}:${i}`}
                className="border-b border-zinc-700/30 hover:bg-zinc-800/60 transition-colors"
              >
                <td className="px-3 py-1.5 max-w-[200px]">
                  <button
                    onClick={() => onPathClick && onPathClick(row.path, row.type)}
                    title={row.path}
                    className="text-indigo-300 hover:text-indigo-100 text-left truncate block w-full"
                  >
                    {row.path.length > 48 ? '…' + row.path.slice(-45) : row.path}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-right text-green-400 tabular-nums">
                  {row.addedLines.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right text-red-400 tabular-nums">
                  {row.removedLines.toLocaleString()}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    row.growth > 0
                      ? 'text-green-400'
                      : row.growth < 0
                      ? 'text-red-400'
                      : 'text-zinc-500'
                  }`}
                >
                  {row.growth > 0 ? '+' : ''}
                  {row.growth.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {row.churn.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.modifications}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(row.modificationFrequency * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {row.churnRate.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="text-zinc-300">{row.topAuthor?.name ?? ''}</span>
                  <span className="text-zinc-500 ml-1">
                    ({((row.topAuthor?.ownership ?? 0) * 100).toFixed(0)}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-700 text-xs text-zinc-400 flex-shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 rounded hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            ← Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 rounded hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
