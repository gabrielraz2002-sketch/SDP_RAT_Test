import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRepos } from '../utils/api.js';

function StatusBadge({ status }) {
  const map = {
    ready: 'bg-green-900/40 text-green-400 border-green-700/50',
    error: 'bg-red-900/40 text-red-400 border-red-700/50',
    processing: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50',
    queued: 'bg-zinc-700 text-zinc-400 border-zinc-600',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
        map[status] || map.queued
      }`}
    >
      {status}
    </span>
  );
}

export default function HomePage() {
  const [repos, setRepos] = useState([]);

  useEffect(() => {
    getRepos().then(setRepos).catch(() => {});
  }, []);

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-7xl mb-5">📊</div>
        <h2 className="text-3xl font-bold text-zinc-100 mb-3">Repo Analysis Tool</h2>
        <p className="text-zinc-400 max-w-lg mb-6 leading-relaxed">
          RAT computes detailed git metrics — churn, growth, modification frequency, and author
          ownership — across files, directories, and the repository root. Supports filtering by
          time range, commit set, author, and path.
        </p>
        <p className="text-zinc-500 text-sm">
          Click{' '}
          <span className="text-indigo-400 font-medium">＋ Add Repository</span> in the sidebar
          to load your first repo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Repositories</h2>
      <p className="text-sm text-zinc-400 mb-5">
        Select a repository to explore its metrics.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {repos.map((repo) => (
          <div
            key={repo.id}
            className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-zinc-100 truncate">{repo.name}</h3>
              <StatusBadge status={repo.status} />
            </div>
            <p className="text-sm text-zinc-400">
              {repo.status === 'ready'
                ? `${repo.progress?.total ?? 0} commits`
                : repo.status === 'error'
                ? repo.error || 'Processing error'
                : 'Processing…'}
            </p>
            {repo.status === 'ready' && (
              <Link
                to={`/repo/${repo.id}`}
                className="mt-auto text-center bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-1.5 rounded-md transition-colors"
              >
                Open →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
