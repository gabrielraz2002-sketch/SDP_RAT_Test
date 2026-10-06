import { useState, useCallback } from 'react';
import { mergeAuthors, removeMerge } from '../utils/api.js';

export default function AuthorMergePanel({ repoId, repo, authors, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [canonical, setCanonical] = useState('');
  const [aliases, setAliases] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const merges = repo?.authorMerges ?? [];

  const findAuthor = (label) => {
    const m = label.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (!m) return null;
    return authors.find(
      (a) =>
        a.name === m[1].trim() &&
        a.email.toLowerCase() === m[2].trim().toLowerCase()
    );
  };

  const applyMerge = useCallback(async () => {
    const canon = findAuthor(canonical);
    if (!canon) return;
    const aliasObjs = aliases.map(findAuthor).filter(Boolean);
    if (aliasObjs.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await mergeAuthors(repoId, {
        canonical: { name: canon.name, email: canon.email },
        aliases: aliasObjs.map((a) => ({ name: a.name, email: a.email })),
      });
      setCanonical('');
      setAliases([]);
      onRefresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, canonical, aliases, authors, onRefresh]);

  const handleRemove = useCallback(
    async (email) => {
      try {
        await removeMerge(repoId, email);
        onRefresh();
      } catch (_) {}
    },
    [repoId, onRefresh]
  );

  const toggleAlias = (v) =>
    setAliases((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const authorLabel = (a) => `${a.name} <${a.email}>`;

  return (
    <div className="border-t border-zinc-700 bg-zinc-800 flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <span>Author Management</span>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-zinc-700">
          {repo?.mailmapDetected && (
            <div className="mt-4 text-xs text-indigo-300 bg-indigo-900/20 border border-indigo-700/30 rounded-md px-3 py-2">
              📋 Mailmap detected — authors have been auto-merged from .mailmap.
            </div>
          )}

          {/* All authors table */}
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              All Authors
            </h4>
            <div className="overflow-x-auto max-h-48 border border-zinc-700 rounded-lg">
              <table className="w-full text-xs text-zinc-300">
                <thead className="sticky top-0 bg-zinc-800">
                  <tr className="text-left text-zinc-500 border-b border-zinc-700">
                    <th className="px-3 py-1.5">Name</th>
                    <th className="px-3 py-1.5">Email</th>
                    <th className="px-3 py-1.5 text-right">Commits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/30">
                  {authors.map((a) => (
                    <tr key={`${a.name}:${a.email}`} className="hover:bg-zinc-700/20">
                      <td className="px-3 py-1">{a.name}</td>
                      <td className="px-3 py-1 text-zinc-400">{a.email}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{a.commits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Merge UI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Canonical Author <span className="text-zinc-500">(keep as primary)</span>
              </label>
              <select
                value={canonical}
                onChange={(e) => {
                  setCanonical(e.target.value);
                  setAliases([]);
                }}
                className="w-full bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select canonical…</option>
                {authors.map((a) => (
                  <option key={`${a.name}:${a.email}`} value={authorLabel(a)}>
                    {authorLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Merge Into Canonical <span className="text-zinc-500">(aliases)</span>
              </label>
              <div className="bg-zinc-700 border border-zinc-600 rounded-md px-2 py-1.5 max-h-36 overflow-y-auto space-y-0.5">
                {authors
                  .filter((a) => authorLabel(a) !== canonical)
                  .map((a) => {
                    const v = authorLabel(a);
                    return (
                      <label
                        key={v}
                        className="flex items-center gap-2 cursor-pointer hover:bg-zinc-600/40 rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={aliases.includes(v)}
                          onChange={() => toggleAlias(v)}
                          className="flex-shrink-0 accent-indigo-500"
                        />
                        <span className="text-xs text-zinc-300 truncate">{v}</span>
                      </label>
                    );
                  })}
                {authors.length === 0 && (
                  <p className="text-xs text-zinc-500 py-1">No authors available</p>
                )}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={applyMerge}
            disabled={!canonical || aliases.length === 0 || busy}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium py-1.5 px-5 rounded-md transition-colors"
          >
            {busy ? 'Applying…' : 'Apply Merge'}
          </button>

          {/* Existing merge groups */}
          {merges.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Existing Merge Groups
              </h4>
              <div className="space-y-2">
                {merges.map((g) => (
                  <div
                    key={g.canonical.email}
                    className="bg-zinc-700/40 border border-zinc-700 rounded-lg px-3 py-2 flex items-start justify-between gap-3"
                  >
                    <div className="text-xs min-w-0">
                      <p className="text-zinc-200 font-medium truncate">
                        {g.canonical.name} &lt;{g.canonical.email}&gt;
                      </p>
                      <p className="text-zinc-400 mt-0.5 truncate">
                        ← {g.aliases.map((a) => `${a.name} <${a.email}>`).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemove(g.canonical.email)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
