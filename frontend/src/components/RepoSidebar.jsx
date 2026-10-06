import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getRepos } from '../utils/api.js';
import AddRepoModal from './AddRepoModal.jsx';

function StatusDot({ status }) {
  const cls =
    status === 'ready'
      ? 'bg-green-400'
      : status === 'error'
      ? 'bg-red-400'
      : 'bg-yellow-400 animate-pulse';
  return <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${cls}`} />;
}

export default function RepoSidebar() {
  const { id: activeId } = useParams();
  const navigate = useNavigate();
  const [repos, setRepos] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const fetchRepos = useCallback(async () => {
    try {
      setRepos(await getRepos());
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // Poll while any repo is still processing.
  useEffect(() => {
    const processing = repos.some(
      (r) => r.status === 'processing' || r.status === 'queued'
    );
    if (!processing) return;
    const t = setInterval(fetchRepos, 2000);
    return () => clearInterval(t);
  }, [repos, fetchRepos]);

  const handleAdded = useCallback(
    (id) => {
      fetchRepos();
      setShowModal(false);
      navigate(`/repo/${id}`);
    },
    [fetchRepos, navigate]
  );

  return (
    <aside className="w-60 flex-shrink-0 bg-zinc-800 border-r border-zinc-700 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-5 border-b border-zinc-700 bg-gradient-to-br from-indigo-950/80 via-zinc-800 to-zinc-800">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-2xl font-black text-white tracking-tight">RAT</h1>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mb-0.5 flex-shrink-0"></span>
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">Repo Analysis Tool</p>
      </div>

      {/* Repo list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {repos.length === 0 && (
          <p className="px-3 py-4 text-xs text-zinc-500 text-center">
            No repositories loaded
          </p>
        )}
        {repos.map((repo) => (
          <Link
            key={repo.id}
            to={`/repo/${repo.id}`}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
              repo.id === activeId
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                : 'text-zinc-300 hover:bg-zinc-700/70 hover:text-white'
            }`}
          >
            <StatusDot status={repo.status} />
            <span className="truncate flex-1">{repo.name}</span>
            {repo.status === 'ready' && repo.progress?.total > 0 && (
              <span
                className={`text-xs tabular-nums rounded px-1.5 py-0.5 ${
                  repo.id === activeId
                    ? 'bg-indigo-500 text-indigo-100'
                    : 'bg-zinc-700 text-zinc-400'
                }`}
              >
                {repo.progress.total}
              </span>
            )}
            {(repo.status === 'processing' || repo.status === 'queued') &&
              repo.progress?.total > 0 && (
                <span className="text-xs text-zinc-400 tabular-nums">
                  {repo.progress.loaded}/{repo.progress.total}
                </span>
              )}
          </Link>
        ))}
      </nav>

      {/* Add button */}
      <div className="p-3 border-t border-zinc-700">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium py-2 rounded-md transition-colors"
        >
          ＋ Add Repository
        </button>
      </div>

      {showModal && (
        <AddRepoModal onClose={() => setShowModal(false)} onAdded={handleAdded} />
      )}
    </aside>
  );
}
