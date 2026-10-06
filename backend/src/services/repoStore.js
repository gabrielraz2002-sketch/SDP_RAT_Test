import { randomUUID } from 'crypto';

/**
 * In-memory registry of loaded repositories.
 * Each record:
 * {
 *   id, name, path, dir, ref,
 *   addedAt, status ('queued' | 'processing' | 'ready' | 'error'),
 *   progress: { loaded, total }, error, authorMerges: [],
 *   mailmapDetected
 * }
 */
const repos = new Map();

export function addRepo(record) {
  const id = record.id || randomUUID();
  const repo = {
    name: '',
    path: '',
    dir: '',
    ref: 'HEAD',
    status: 'queued',
    progress: { loaded: 0, total: 0 },
    error: null,
    authorMerges: [],
    mailmapDetected: false,
    ...record,
    id,
    addedAt: record.addedAt || new Date(),
  };
  repos.set(id, repo);
  return repo;
}

export function getRepo(id) {
  return repos.get(id) || null;
}

export function listRepos() {
  return Array.from(repos.values());
}

export function updateRepo(id, patch) {
  const repo = repos.get(id);
  if (!repo) return null;
  Object.assign(repo, patch);
  return repo;
}

export function deleteRepo(id) {
  return repos.delete(id);
}
