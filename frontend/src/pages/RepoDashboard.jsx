import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getRepo, getAuthors, getCommits, getFiles } from '../utils/api.js';
import { useMetrics } from '../hooks/useMetrics.js';
import FilterBar from '../components/FilterBar.jsx';
import FileTree from '../components/FileTree.jsx';
import MetricsTable from '../components/MetricsTable.jsx';
import MetricsCharts from '../components/MetricsCharts.jsx';
import AuthorMergePanel from '../components/AuthorMergePanel.jsx';

const DEFAULT_FILTERS = {
  since: null,
  until: null,
  commitHashes: [],
  author: null,
  path: '',
  view: 'repo',
};

function SummaryCard({ label, value, sub, color, loading }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-5 bg-zinc-700 rounded animate-pulse w-20" />
      ) : (
        <>
          <p className={`text-lg font-semibold leading-tight truncate ${color || 'text-zinc-100'}`}>
            {value}
          </p>
          {sub && <p className="text-xs text-zinc-500 mt-0.5 truncate">{sub}</p>}
        </>
      )}
    </div>
  );
}

export default function RepoDashboard() {
  const { id } = useParams();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [tab, setTab] = useState('table'); // 'table' | 'charts'

  const [repo, setRepo] = useState(null);
  const [authors, setAuthors] = useState([]);
  const [commits, setCommits] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  // Maps path string → 'file' | 'directory' for auto view-selection.
  const [pathTypes, setPathTypes] = useState(new Map());

  const { data: metricsData, loading, error } = useMetrics(id, filters);

  // ── Data fetch on repo change ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setFilters(DEFAULT_FILTERS);
    setRepo(null);
    setFileTree(null);
    let cancelled = false;

    (async () => {
      try {
        const [repoData, authorsData, commitsData, filesData] = await Promise.all([
          getRepo(id),
          getAuthors(id),
          getCommits(id, { limit: 1000 }),
          getFiles(id),
        ]);
        if (cancelled) return;
        setRepo(repoData);
        setAuthors(authorsData || []);
        setCommits(commitsData?.commits || []);
        setFileTree(filesData);
        // Build path-type map for auto view resolution.
        const map = new Map();
        const walk = (node) => {
          if (!node) return;
          if (node.path) map.set(node.path, node.type);
          (node.children || []).forEach(walk);
        };
        walk(filesData);
        setPathTypes(map);
      } catch (_) {}
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Refresh after author merges ───────────────────────────────────────────
  const refreshAuthors = useCallback(async () => {
    if (!id) return;
    try {
      const [repoData, authorsData] = await Promise.all([getRepo(id), getAuthors(id)]);
      setRepo(repoData);
      setAuthors(authorsData || []);
    } catch (_) {}
  }, [id]);

  // ── Auto-set view when path changes via text input ────────────────────────
  useEffect(() => {
    const p = filters.path;
    if (!p) return;
    const type = pathTypes.get(p);
    if (type === 'file' && filters.view !== 'file')
      setFilters((f) => ({ ...f, view: 'file' }));
    else if (type === 'directory' && filters.view !== 'directory')
      setFilters((f) => ({ ...f, view: 'directory' }));
  // pathTypes is stable after load; filters.view excluded to avoid loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.path, pathTypes]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleTreeSelect = useCallback((path, type) => {
    setFilters((f) => ({
      ...f,
      path,
      view: type === 'file' ? 'file' : 'directory',
    }));
  }, []);

  const handlePathClick = useCallback((path, type) => {
    setFilters((f) => ({
      ...f,
      path,
      view: type === 'file' ? 'file' : type === 'directory' ? 'directory' : 'repo',
    }));
  }, []);

  // ── Derived metrics ───────────────────────────────────────────────────────
  const m = metricsData?.metrics;
  const topAuthor = useMemo(() => metricsData?.authors?.[0] ?? null, [metricsData]);

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!repo) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        authors={authors}
        commits={commits}
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border-b border-red-700/40 px-4 py-2 text-sm text-red-400 flex-shrink-0">
          <span>⚠</span>
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 border-b border-zinc-700 flex-shrink-0">
        <SummaryCard
          label="Commits"
          value={metricsData?.commitCount?.toLocaleString() ?? '—'}
          loading={loading}
        />
        <SummaryCard
          label="Total Churn"
          value={m ? m.churn.toLocaleString() : '—'}
          loading={loading}
        />
        <SummaryCard
          label="Growth"
          value={
            m
              ? `${m.growth >= 0 ? '+' : ''}${m.growth.toLocaleString()}`
              : '—'
          }
          color={m ? (m.growth >= 0 ? 'text-green-400' : 'text-red-400') : ''}
          loading={loading}
        />
        <SummaryCard
          label="Top Author"
          value={topAuthor?.name ?? '—'}
          sub={topAuthor ? `${(topAuthor.ownership * 100).toFixed(1)}% ownership` : ''}
          loading={loading}
        />
      </div>

      {/* Main panel: FileTree + Metrics content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: File tree (30%) */}
        <div className="w-64 flex-shrink-0 border-r border-zinc-700 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-700 flex-shrink-0">
            Files
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree
              tree={fileTree}
              activePath={filters.path}
              onSelect={handleTreeSelect}
            />
          </div>
        </div>

        {/* Right: Tab switcher + metrics (70%) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b border-zinc-700 bg-zinc-800 flex-shrink-0">
            <button
              onClick={() => setTab('table')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'table'
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Metrics Table
            </button>
            <button
              onClick={() => setTab('charts')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'charts'
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Charts
            </button>
            {/* Current path indicator */}
            {filters.path && (
              <div className="ml-auto flex items-center gap-2 px-3 py-1 text-xs text-zinc-500">
                <span className="text-indigo-400 capitalize">{filters.view}</span>
                <span className="truncate max-w-[200px]">/ {filters.path}</span>
                <button
                  onClick={() => setFilters((f) => ({ ...f, path: '', view: 'repo' }))}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'table' ? (
              <MetricsTable
                data={metricsData}
                loading={loading}
                onPathClick={handlePathClick}
              />
            ) : (
              <MetricsCharts data={metricsData} />
            )}
          </div>
        </div>
      </div>

      {/* Author merge panel (collapsible drawer at bottom) */}
      <AuthorMergePanel
        repoId={id}
        repo={repo}
        authors={authors}
        onRefresh={refreshAuthors}
      />
    </div>
  );
}
