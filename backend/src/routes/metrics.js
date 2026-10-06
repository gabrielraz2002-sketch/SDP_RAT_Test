import express from 'express';
import { getRepo } from '../services/repoStore.js';
import { queryMetrics, computeTimeline } from '../services/metricService.js';

const router = express.Router();

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/metrics/:repoId/timeline
 * Query: since, until, commits, author, path (same as main), plus granularity.
 */
router.get('/:repoId/timeline', (req, res, next) => {
  const repo = getRepo(req.params.repoId);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') {
    return res.status(400).json({ error: 'Repo not ready' });
  }

  try {
    const q = req.query;
    const params = {
      since: numberOrNull(q.since),
      until: numberOrNull(q.until),
      commitHashes: q.commits
        ? String(q.commits).split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      author: q.author ? String(q.author) : null,
      path: q.path !== undefined ? String(q.path) : '',
      granularity: q.granularity ? String(q.granularity) : null,
    };
    const result = computeTimeline(req.params.repoId, params);
    res.json({ repoId: req.params.repoId, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/metrics/:repoId
 * Query: since, until (unix), commits (comma-separated hashes, overrides
 * since/until), author (email), path ("" or "/" = root), view
 * (repo | directory | file | author; also accepts "repository").
 */
router.get('/:repoId', (req, res, next) => {
  const repo = getRepo(req.params.repoId);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') {
    return res.status(409).json({ error: `Repo is ${repo.status}`, status: repo.status });
  }

  try {
    const q = req.query;
    const params = {
      since: numberOrNull(q.since),
      until: numberOrNull(q.until),
      commitHashes: q.commits ? String(q.commits).split(',').map((s) => s.trim()).filter(Boolean) : null,
      author: q.author ? String(q.author) : null,
      path: q.path !== undefined ? String(q.path) : '',
      view: q.view ? String(q.view) : 'repo',
    };
    res.json(queryMetrics(req.params.repoId, params));
  } catch (err) {
    next(err);
  }
});

export default router;
