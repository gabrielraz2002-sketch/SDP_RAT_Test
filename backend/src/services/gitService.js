import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_BUFFER = 1024 * 1024 * 1024; // 1 GiB — git log output on large repos is big

// Never let git sit waiting for a terminal prompt (bad URLs must fail fast).
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

function git(repoPath, args) {
  return execFileAsync('git', ['-C', repoPath, ...args], {
    maxBuffer: MAX_BUFFER,
    env: GIT_ENV,
  });
}

/** Blobless clone: fast even for huge repos; no extra fetch afterwards. */
export async function cloneRepo(url, destPath) {
  await execFileAsync('git', ['clone', '--filter=blob:none', url, destPath], {
    maxBuffer: MAX_BUFFER,
    env: GIT_ENV,
  });
  return destPath;
}

/** Resolve a ref to a full 40-char SHA (pass through full SHAs unchanged). */
export async function resolveRef(repoPath, ref) {
  const trimmed = String(ref || 'HEAD').trim() || 'HEAD';
  if (/^[0-9a-f]{40}$/i.test(trimmed)) return trimmed;
  const { stdout } = await git(repoPath, ['rev-parse', trimmed]);
  return stdout.trim();
}

/** Non-merge commit count at ref (used for progress.total). */
export async function getCommitCount(repoPath, ref) {
  const { stdout } = await git(repoPath, ['rev-list', '--count', '--no-merges', ref]);
  return parseInt(stdout.trim(), 10);
}

/**
 * Raw commit list at ref (no merges).
 * Format: %H NUL %ae NUL %an NUL %cd NUL %P NUL %s
 * subject is appended so the /commits endpoint can show messages.
 */
export async function getRawCommits(repoPath, ref) {
  const format = '%H%x00%ae%x00%an%x00%cd%x00%P%x00%s';
  const { stdout } = await git(repoPath, ['log', `--format=${format}`, '--date=unix', '--no-merges', ref]);
  const commits = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const parts = line.split('\x00');
    if (parts.length < 5) continue;
    const [hash, authorEmail, authorName, date, parents] = parts;
    const parentStr = (parents || '').trim();
    commits.push({
      hash,
      authorEmail,
      authorName,
      date: parseInt(date, 10),
      parentHash: parentStr ? parentStr.split(/\s+/)[0] : null,
      message: parts.slice(5).join('\x00').trim(),
    });
  }
  return commits;
}

/**
 * Per-commit numstat diff. Renames (-M50) are attributed to the NEW path only;
 * binary files ("-" counts) are skipped. The initial commit diffs against the
 * empty tree.
 */
export async function getCommitDiff(repoPath, commitHash, parentHash) {
  const parent = parentHash || EMPTY_TREE;
  const args = ['diff', '--numstat', '-M50', parent, commitHash];
  let stdout;
  try {
    ({ stdout } = await git(repoPath, args));
  } catch (err) {
    // Blobless clones fetch missing blobs lazily; concurrent diffs can hit a
    // transient failure. Retry once before giving up.
    await new Promise((r) => setTimeout(r, 300));
    ({ stdout } = await git(repoPath, args));
  }

  const changes = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const addedStr = parts[0];
    const removedStr = parts[1];
    const rawPath = parts.slice(2).join('\t');
    if (addedStr === '-' || removedStr === '-') continue; // binary: not measured
    const added = parseInt(addedStr, 10);
    const removed = parseInt(removedStr, 10);
    if (Number.isNaN(added) || Number.isNaN(removed)) continue;
    changes.push({ path: normalizeDiffPath(rawPath), added, removed });
  }
  return changes;
}

/** Collapse rename notation to the new path: "a/{old => new}/b" and "old => new". */
function normalizeDiffPath(p) {
  if (!p.includes(' => ')) return p;
  const brace = p.match(/^(.*)\{(.*?) => (.*?)\}(.*)$/);
  if (brace) {
    return `${brace[1]}${brace[3]}${brace[4]}`.replace(/\/{2,}/g, '/');
  }
  return p.slice(p.indexOf(' => ') + 4);
}

/** Flat file list at ref. */
export async function getFileTree(repoPath, ref) {
  const { stdout } = await git(repoPath, ['ls-tree', '-r', '--name-only', ref]);
  return stdout.split('\n').filter((l) => l.length > 0);
}

/** .mailmap content at ref (git show), falling back to the on-disk file. */
export async function readMailmap(repoPath, ref) {
  try {
    const { stdout } = await git(repoPath, ['show', `${ref}:.mailmap`]);
    return stdout || null;
  } catch {
    try {
      return fs.readFileSync(path.join(repoPath, '.mailmap'), 'utf8');
    } catch {
      return null;
    }
  }
}
