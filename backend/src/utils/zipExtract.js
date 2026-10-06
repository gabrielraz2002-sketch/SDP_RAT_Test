import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '../../repos');

/**
 * Extract an uploaded zip into backend/repos/<uuid>/.
 * The .git directory may be nested inside a top-level folder; walk the tree
 * to find the directory that directly contains it.
 *
 * Returns { id, destDir, repoPath } where repoPath is the absolute path of the
 * directory that directly contains .git (destDir is the top-level uuid folder,
 * kept for cleanup on delete).
 */
export function extractZip(zipPath) {
  const id = randomUUID();
  const destDir = path.join(REPOS_DIR, id);
  fs.mkdirSync(destDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);

  const repoPath = findGitRoot(destDir);
  if (!repoPath) {
    throw new Error('No .git directory found in the uploaded zip. Zip the repository including its .git folder.');
  }
  return { id, destDir, repoPath };
}

/** Recursively find the first directory that directly contains a .git entry. */
function findGitRoot(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
    return dir;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findGitRoot(path.join(dir, e.name));
      if (found) return found;
    }
  }
  return null;
}
