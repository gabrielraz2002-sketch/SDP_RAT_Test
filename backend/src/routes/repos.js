import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { addRepo, getRepo, listRepos, updateRepo, deleteRepo } from '../services/repoStore.js';
import { cloneRepo } from '../services/gitService.js';
import { extractZip } from '../utils/zipExtract.js';
import {
  buildEngine,
  removeEngine,
  listAuthors,
  listCommits,
  getRepoFileTree,
} from '../services/metricService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '../../repos');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

fs.mkdirSync(REPOS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = express.Router();
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

function publicRepo(repo) {
  return {
    id: repo.id,
    name: repo.name,
    ref: repo.ref,
    status: repo.status,
    progress: repo.progress,
    error: repo.error,
    addedAt: repo.addedAt,
    mailmapDetected: repo.mailmapDetected,
    authorMerges: repo.authorMerges,
  };
}

function deriveNameFromUrl(url) {
  const last = String(url).replace(/\/+$/, '').split('/').pop() || 'repo';
  return last.replace(/\.git$/i, '').replace(/[^\w.-]+/g, '-') || 'repo';
}

// POST /api/repos/upload — multipart zip (field "repo"), optional name/ref
router.post('/upload', upload.single('repo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No zip file uploaded (expected multipart field "repo")' });
  }
  const zipPath = req.file.path;
  try {
    const { id, destDir, repoPath } = extractZip(zipPath);
    const name = (req.body.name || req.file.originalname || 'uploaded-repo').replace(/\.zip$/i, '');
    addRepo({
      id,
      name,
      path: repoPath,
      dir: destDir,
      ref: req.body.ref || 'HEAD',
      status: 'queued',
    });
    res.json({ id, status: 'processing' });
    buildEngine(id); // fire and forget — the client polls /status
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
});

// POST /api/repos/clone — { url, name, ref? }
router.post('/clone', (req, res) => {
  const { url, name, ref } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const id = randomUUID();
  const destPath = path.join(REPOS_DIR, id);
  addRepo({
    id,
    name: name || deriveNameFromUrl(url),
    path: destPath,
    dir: destPath,
    ref: ref || 'HEAD',
    status: 'queued',
  });
  res.json({ id, status: 'processing' });

  cloneRepo(url, destPath)
    .then(() => buildEngine(id))
    .catch((err) => updateRepo(id, { status: 'error', error: err.message }));
});

// GET /api/repos — list all repos
router.get('/', (_req, res) => {
  res.json(listRepos().map(publicRepo));
});

// GET /api/repos/:id — single repo info
router.get('/:id', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  res.json(publicRepo(repo));
});

// DELETE /api/repos/:id — remove repo and delete its directory from disk
router.delete('/:id', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  removeEngine(repo.id);
  deleteRepo(repo.id);
  const dir = repo.dir || repo.path;
  try {
    if (dir && path.resolve(dir).startsWith(path.resolve(REPOS_DIR) + path.sep)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    return res.status(500).json({ error: `Removed from registry but failed to delete files: ${err.message}` });
  }
  res.json({ ok: true });
});

// GET /api/repos/:id/authors — authors after mailmap + manual merges
router.get('/:id/authors', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') return res.status(409).json({ error: `Repo is ${repo.status}` });
  res.json(listAuthors(repo.id));
});

// GET /api/repos/:id/commits?page=&limit=&since=&until=
router.get('/:id/commits', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') return res.status(409).json({ error: `Repo is ${repo.status}` });
  res.json(listCommits(repo.id, req.query));
});

// GET /api/repos/:id/files — nested file/directory tree
router.get('/:id/files', async (req, res, next) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') return res.status(409).json({ error: `Repo is ${repo.status}` });
  try {
    res.json(await getRepoFileTree(repo.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/:id/merge-authors — { canonical: {name,email}, aliases: [{name,email}] }
router.post('/:id/merge-authors', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  const { canonical, aliases } = req.body || {};
  if (!canonical || !canonical.email) {
    return res.status(400).json({ error: 'canonical.email is required' });
  }

  const canonEmail = String(canonical.email);
  let group = repo.authorMerges.find((g) => g.canonical.email.toLowerCase() === canonEmail.toLowerCase());
  if (!group) {
    group = { canonical: { name: canonical.name || canonEmail, email: canonEmail }, aliases: [] };
    repo.authorMerges.push(group);
  } else {
    group.canonical = { name: canonical.name || group.canonical.name, email: canonEmail };
  }
  for (const alias of aliases || []) {
    if (!alias || !alias.email) continue;
    const email = String(alias.email);
    if (email.toLowerCase() === canonEmail.toLowerCase()) continue;
    if (group.aliases.some((a) => a.email.toLowerCase() === email.toLowerCase())) continue;
    group.aliases.push({ name: alias.name || email, email });
  }
  updateRepo(repo.id, { authorMerges: repo.authorMerges });
  res.json({ authorMerges: repo.authorMerges });
});

// DELETE /api/repos/:id/merge-authors/:canonicalEmail — remove a merge group
router.delete('/:id/merge-authors/:canonicalEmail', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  const target = String(req.params.canonicalEmail).toLowerCase();
  const before = repo.authorMerges.length;
  const remaining = repo.authorMerges.filter((g) => g.canonical.email.toLowerCase() !== target);
  updateRepo(repo.id, { authorMerges: remaining });
  res.json({ removed: before - remaining.length, authorMerges: remaining });
});

// GET /api/repos/:id/status
router.get('/:id/status', (req, res) => {
  const repo = getRepo(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  res.json({
    status: repo.status,
    progress: repo.progress,
    error: repo.error,
    mailmapDetected: repo.mailmapDetected,
  });
});

export default router;
