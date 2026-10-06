import { useState, useMemo } from 'react';

const VIEWS = ['repo', 'directory', 'file', 'author'];
const VIEW_LABELS = { repo: 'Repository', directory: 'Directory', file: 'File', author: 'Author' };

const inputCls =
  'bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function FilterBar({ filters, onChange, authors = [], commits = [] }) {
  const [commitMode, setCommitMode] = useState('time'); // 'time' | 'manual'
  const [commitSearch, setCommitSearch] = useState('');

  const set = (patch) => onChange((f) => ({ ...f, ...patch }));

  const clearAll = () =>
    onChange({ since: null, until: null, commitHashes: [], author: null, path: '', view: 'repo' });

  const hasFilter =
    filters.since != null ||
    filters.until != null ||
    (filters.commitHashes && filters.commitHashes.length > 0) ||
    filters.author ||
    filters.path;

  const filteredCommits = useMemo(() => {
    if (!commitSearch.trim()) return commits;
    const q = commitSearch.toLowerCase();
    return commits.filter(
      (c) =>
        c.hash.toLowerCase().includes(q) ||
        (c.message || '').toLowerCase().includes(q) ||
        (c.authorName || '').toLowerCase().includes(q)
    );
  }, [commits, commitSearch]);

  const toggleHash = (hash) => {
    const prev = filters.commitHashes || [];
    const next = prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash];
    set({ commitHashes: next });
  };

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3 space-y-3 flex-shrink-0">
      {/* Row 1 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex bg-zinc-700/60 rounded-lg p-0.5 gap-0.5">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => set({ view: v, ...(v === 'repo' ? { path: '' } : {}) })}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                filters.view === v
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Author dropdown */}
        <select
          value={filters.author || ''}
          onChange={(e) => set({ author: e.target.value || null })}
          className={`${inputCls} max-w-[220px]`}
        >
          <option value="">All Authors</option>
          {authors.map((a) => (
            <option key={`${a.email}\x00${a.name}`} value={`${a.name} <${a.email}>`}>
              {a.name} &lt;{a.email}&gt;
            </option>
          ))}
        </select>

        {/* Path input */}
        <div className="flex items-center bg-zinc-700 border border-zinc-600 rounded-md px-2 py-1.5 gap-1 min-w-[160px] max-w-[280px] focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-zinc-500 text-xs flex-shrink-0">/</span>
          <input
            type="text"
            value={filters.path || ''}
            onChange={(e) => set({ path: e.target.value })}
            placeholder={filters.view === 'repo' ? 'path filter' : 'enter path'}
            disabled={filters.view === 'repo' && !filters.path}
            className="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none flex-1 min-w-0 disabled:opacity-40"
          />
          {filters.path && (
            <button
              onClick={() => set({ path: '', view: 'repo' })}
              className="text-zinc-400 hover:text-zinc-100 text-xs flex-shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {hasFilter && (
          <button
            onClick={clearAll}
            className="text-xs text-zinc-400 hover:text-red-400 transition-colors ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Row 2: Commit filter */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex bg-zinc-700/60 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
          <button
            onClick={() => {
              setCommitMode('time');
              set({ commitHashes: [] });
            }}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              commitMode === 'time'
                ? 'bg-zinc-600 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Time Range
          </button>
          <button
            onClick={() => {
              setCommitMode('manual');
              set({ since: null, until: null });
            }}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${
              commitMode === 'manual'
                ? 'bg-zinc-600 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Manual Selection
            {filters.commitHashes?.length > 0 && (
              <span className="bg-indigo-600 text-white rounded-full px-1.5 text-xs leading-4">
                {filters.commitHashes.length}
              </span>
            )}
          </button>
        </div>

        {commitMode === 'time' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-400">From</span>
            <input
              type="datetime-local"
              value={
                filters.since != null
                  ? new Date(filters.since * 1000).toISOString().slice(0, 16)
                  : ''
              }
              onChange={(e) =>
                set({
                  since: e.target.value
                    ? Math.floor(new Date(e.target.value).getTime() / 1000)
                    : null,
                })
              }
              className={inputCls}
            />
            <span className="text-xs text-zinc-400">To</span>
            <input
              type="datetime-local"
              value={
                filters.until != null
                  ? new Date(filters.until * 1000).toISOString().slice(0, 16)
                  : ''
              }
              onChange={(e) =>
                set({
                  until: e.target.value
                    ? Math.floor(new Date(e.target.value).getTime() / 1000)
                    : null,
                })
              }
              className={inputCls}
            />
          </div>
        ) : (
          <CommitSelector
            commits={commits}
            filtered={filteredCommits}
            selected={filters.commitHashes || []}
            onToggle={toggleHash}
            onClear={() => set({ commitHashes: [] })}
            search={commitSearch}
            onSearch={setCommitSearch}
          />
        )}
      </div>
    </div>
  );
}

function CommitSelector({ commits, filtered, selected, onToggle, onClear, search, onSearch }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded-md px-3 py-1.5 hover:bg-zinc-600 transition-colors"
      >
        <span>{selected.length === 0 ? 'Select commits…' : `${selected.length} selected`}</span>
        <span className="text-zinc-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-40 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl w-96 max-h-72 flex flex-col">
            <div className="p-2 border-b border-zinc-700">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search by hash, message, author…"
                className="w-full bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-zinc-500">No matching commits</p>
              )}
              {filtered.slice(0, 200).map((c) => (
                <label
                  key={c.hash}
                  className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-700/60 transition-colors ${
                    selected.includes(c.hash) ? 'bg-zinc-700/40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(c.hash)}
                    onChange={() => onToggle(c.hash)}
                    className="mt-0.5 flex-shrink-0 accent-indigo-500"
                  />
                  <span className="text-xs leading-snug min-w-0">
                    <span className="font-mono text-indigo-300">{c.hash.slice(0, 8)}</span>{' '}
                    <span className="text-zinc-500">
                      {new Date(c.date * 1000).toLocaleDateString()}
                    </span>{' '}
                    <span className="text-zinc-300 break-all">
                      {(c.message || '').slice(0, 60)}
                    </span>
                  </span>
                </label>
              ))}
              {filtered.length > 200 && (
                <p className="px-3 py-2 text-xs text-zinc-500 text-center">
                  Showing 200 of {filtered.length} — search to narrow
                </p>
              )}
            </div>
            {selected.length > 0 && (
              <div className="p-2 border-t border-zinc-700">
                <button
                  onClick={onClear}
                  className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
