import { getRepo, updateRepo } from './repoStore.js';
import {
  resolveRef,
  getCommitCount,
  getRawCommits,
  getCommitDiff,
  getFileTree,
  readMailmap,
} from './gitService.js';
import { parseMailmapContent } from '../utils/mailmap.js';

/**
 * In-memory metric engines, one per loaded repo.
 * All diffs are pre-computed once at load time; every query afterwards is a
 * pure in-memory operation (no git calls).
 *
 * Author identity: an exact "Name <email>" pair (email compared
 * case-insensitively, name verbatim), matching the reference data. Manual
 * author merges (and .mailmap) collapse pairs into their canonical identity.
 */
const engines = new Map();

const DIFF_BATCH_SIZE = 50; // commits processed concurrently per batch

export function getEngine(repoId) {
  return engines.get(repoId) || null;
}

export function removeEngine(repoId) {
  engines.delete(repoId);
}

/** Identity key: lower-cased email + verbatim name. */
function pairKey(name, email) {
  return `${String(email || '').toLowerCase()}\u0000${String(name || '')}`;
}

/**
 * Build the engine for a repo: resolve ref, load commits (mailmap-resolved
 * authors), pre-compute every commit diff, and index records by file,
 * directory, author pair and author email.
 */
export async function buildEngine(repoId) {
  const repo = getRepo(repoId);
  if (!repo) return;
  try {
    updateRepo(repoId, { status: 'processing', error: null });

    const ref = await resolveRef(repo.path, repo.ref || 'HEAD');
    const countTarget = await getCommitCount(repo.path, ref);
    updateRepo(repoId, { ref, progress: { loaded: 0, total: countTarget } });

    const mailmapContent = await readMailmap(repo.path, ref);
    const mailmapDetected = Boolean(mailmapContent && mailmapContent.trim());
    const resolveMailmap = mailmapDetected ? parseMailmapContent(mailmapContent) : null;

    const rawCommits = await getRawCommits(repo.path, ref);
    const commits = rawCommits.map((c) => {
      const resolved = resolveMailmap
        ? resolveMailmap(c.authorName, c.authorEmail)
        : { name: c.authorName, email: c.authorEmail };
      return { ...c, authorName: resolved.name, authorEmail: resolved.email };
    });
    updateRepo(repoId, { progress: { loaded: 0, total: commits.length } });

    // String/author interning keeps memory flat on huge repos.
    const pathPool = new Map();
    const authorPool = new Map();
    const internPath = (p) => {
      let s = pathPool.get(p);
      if (s === undefined) {
        pathPool.set(p, p);
        s = p;
      }
      return s;
    };
    const internAuthor = (name, email) => {
      const key = pairKey(name, email);
      let a = authorPool.get(key);
      if (!a) {
        a = { name, email };
        authorPool.set(key, a);
      }
      return a;
    };

    // Step 1 — pre-compute the diff cache (batched for throughput).
    const diffs = [];
    for (let i = 0; i < commits.length; i += DIFF_BATCH_SIZE) {
      const batch = commits.slice(i, i + DIFF_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (c) => ({ c, rows: await getCommitDiff(repo.path, c.hash, c.parentHash) }))
      );
      for (const { c, rows } of results) {
        const author = internAuthor(c.authorName, c.authorEmail);
        for (const r of rows) {
          diffs.push({
            commitHash: c.hash,
            date: c.date,
            author,
            path: internPath(r.path),
            added: r.added,
            removed: r.removed,
          });
        }
      }
      updateRepo(repoId, {
        progress: { loaded: Math.min(i + DIFF_BATCH_SIZE, commits.length), total: commits.length },
      });
    }

    // Secondary indexes for fast filtered queries.
    const fileIndex = new Map(); // path -> records[]
    const dirIndex = new Map(); // dir path -> records[] of its whole subtree
    const recordsByPair = new Map(); // author pair key -> records[]
    const pairsByEmail = new Map(); // lower(email) -> Set(pair key)
    const fileChurnAll = new Map(); // path -> total churn (all commits)
    const dirChurnAll = new Map(); // dir path -> total subtree churn (all commits)
    let totalChurnAll = 0;
    const push = (map, key, val) => {
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(val);
    };
    const addChurn = (map, key, val) => map.set(key, (map.get(key) || 0) + val);

    for (const r of diffs) {
      const churn = r.added + r.removed;
      push(fileIndex, r.path, r);
      addChurn(fileChurnAll, r.path, churn);
      const parts = r.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        push(dirIndex, dir, r);
        addChurn(dirChurnAll, dir, churn);
      }
      const pk = pairKey(r.author.name, r.author.email);
      push(recordsByPair, pk, r);
      const emailLower = String(r.author.email || '').toLowerCase();
      let keySet = pairsByEmail.get(emailLower);
      if (!keySet) {
        keySet = new Set();
        pairsByEmail.set(emailLower, keySet);
      }
      keySet.add(pk);
      totalChurnAll += churn;
    }

    engines.set(repoId, {
      repoId,
      ref,
      commits,
      diffs,
      fileIndex,
      dirIndex,
      recordsByPair,
      pairsByEmail,
      fileChurnAll,
      dirChurnAll,
      totalChurnAll,
      mailmapDetected,
      fileTree: null,
    });
    updateRepo(repoId, { status: 'ready', progress: { loaded: commits.length, total: commits.length } });
  } catch (err) {
    updateRepo(repoId, { status: 'error', error: err.message });
  }
}

/* ------------------------------------------------------------------ */
/* Author identity / merge helpers                                     */
/* ------------------------------------------------------------------ */

/** lower(alias email) -> canonical { name, email } */
function buildMergeMap(merges) {
  const map = new Map();
  for (const group of merges || []) {
    if (!group || !group.canonical || !group.canonical.email) continue;
    const canon = { name: group.canonical.name || group.canonical.email, email: group.canonical.email };
    map.set(canon.email.toLowerCase(), canon);
    for (const alias of group.aliases || []) {
      if (alias && alias.email) map.set(String(alias.email).toLowerCase(), canon);
    }
  }
  return map;
}

/** Identity of an author after manual merges: { key, name, email }. */
function resolveIdentity(name, email, mergeMap) {
  const canon = mergeMap.get(String(email || '').toLowerCase());
  if (canon) return { key: pairKey(canon.name, canon.email), name: canon.name, email: canon.email };
  return { key: pairKey(name, email), name: String(name || ''), email: String(email || '') };
}

/**
 * Parse the ?author= query: either a full "Name <email>" (exact identity
 * match) or a bare email (matches all name variants of that email).
 */
function parseAuthorParam(value) {
  const s = String(value).trim();
  const m = s.match(/^(.*?)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim();
    return { name: name || null, email: m[2].trim().toLowerCase() };
  }
  return { name: null, email: s.toLowerCase() };
}

/** Does this author (commit or record) belong to the requested identity? */
function authorMatches(name, email, filter, mergeMap) {
  const rawEmail = String(email || '').toLowerCase();
  if (rawEmail === filter.email && filter.name == null) return true;
  const id = resolveIdentity(name, email, mergeMap);
  if (filter.name == null) {
    return id.email.toLowerCase() === filter.email;
  }
  if (rawEmail === filter.email && String(name || '') === filter.name) return true;
  return id.email.toLowerCase() === filter.email && id.name === filter.name;
}

/** All emails belonging to the merge group of the requested email. */
function groupEmailsFor(filterEmail, mergeMap) {
  const emails = new Set([filterEmail]);
  const canon = mergeMap.get(filterEmail);
  if (canon) {
    const canonLower = canon.email.toLowerCase();
    for (const [key, val] of mergeMap) {
      if (val.email.toLowerCase() === canonLower) emails.add(key);
    }
  }
  return emails;
}

/* ------------------------------------------------------------------ */
/* Metric computation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Merge commits with the time / hash / author filters applied
 * (path is NOT part of the commit set).
 */
function selectCommits(engine, { hashSet, since, until, authorFilter, mergeMap }) {
  let commits = engine.commits;
  if (hashSet) {
    commits = commits.filter((c) => hashSet.has(c.hash.toLowerCase()));
  } else if (since != null || until != null) {
    commits = commits.filter((c) => (since == null || c.date >= since) && (until == null || c.date <= until));
  }
  if (authorFilter) {
    commits = commits.filter((c) => authorMatches(c.authorName, c.authorEmail, authorFilter, mergeMap));
  }
  return commits;
}

/**
 * Core metrics for one object over a set of records.
 * modifications counts only commits whose churn on this object is > 0
 * (so pure renames — 0 added / 0 removed — don't count).
 */
function objMetrics(records, commitSetSize) {
  let added = 0;
  let removed = 0;
  const commitChurn = new Map();
  for (const r of records) {
    added += r.added;
    removed += r.removed;
    commitChurn.set(r.commitHash, (commitChurn.get(r.commitHash) || 0) + r.added + r.removed);
  }
  const churn = added + removed;
  let modifications = 0;
  for (const v of commitChurn.values()) if (v > 0) modifications += 1;
  return {
    addedLines: added,
    removedLines: removed,
    growth: added - removed,
    churn,
    modifications,
    modificationFrequency: commitSetSize ? modifications / commitSetSize : 0,
    churnRate: commitSetSize ? churn / commitSetSize : 0,
  };
}

/** Per-author metrics for the queried object (ownership vs all authors). */
function authorsFor(records, totalChurn, mergeMap) {
  const map = new Map();
  for (const r of records) {
    const id = resolveIdentity(r.author.name, r.author.email, mergeMap);
    let e = map.get(id.key);
    if (!e) {
      e = { name: id.name, email: id.email, commitChurn: new Map(), churn: 0 };
      map.set(id.key, e);
    }
    const churn = r.added + r.removed;
    e.commitChurn.set(r.commitHash, (e.commitChurn.get(r.commitHash) || 0) + churn);
    e.churn += churn;
  }
  return [...map.values()]
    .map((e) => {
      let modifications = 0;
      for (const v of e.commitChurn.values()) if (v > 0) modifications += 1;
      return {
        name: e.name,
        email: e.email,
        modifications,
        churn: e.churn,
        ownership: totalChurn ? e.churn / totalChurn : 0,
      };
    })
    .sort((a, b) => b.churn - a.churn);
}

/** Breakdown rows: immediate children of the queried object. */
function breakdownFor(records, baseDir, commitSetSize, mergeMap) {
  const map = new Map();
  for (const r of records) {
    const rel = baseDir ? r.path.slice(baseDir.length + 1) : r.path;
    const slash = rel.indexOf('/');
    const segment = slash === -1 ? rel : rel.slice(0, slash);
    const childPath = baseDir ? `${baseDir}/${segment}` : segment;
    const type = slash === -1 ? 'file' : 'directory';

    let e = map.get(segment);
    if (!e) {
      e = { path: childPath, type, added: 0, removed: 0, commitChurn: new Map(), authorChurn: new Map() };
      map.set(segment, e);
    }
    e.added += r.added;
    e.removed += r.removed;
    const churn = r.added + r.removed;
    e.commitChurn.set(r.commitHash, (e.commitChurn.get(r.commitHash) || 0) + churn);

    const id = resolveIdentity(r.author.name, r.author.email, mergeMap);
    const ac = e.authorChurn.get(id.key) || { name: id.name, email: id.email, churn: 0 };
    ac.churn += churn;
    e.authorChurn.set(id.key, ac);
  }

  return [...map.values()]
    .map((e) => {
      const churn = e.added + e.removed;
      let modifications = 0;
      for (const v of e.commitChurn.values()) if (v > 0) modifications += 1;
      let top = null;
      for (const ac of e.authorChurn.values()) {
        if (!top || ac.churn > top.churn) top = ac;
      }
      return {
        path: e.path,
        type: e.type,
        addedLines: e.added,
        removedLines: e.removed,
        growth: e.added - e.removed,
        churn,
        modifications,
        modificationFrequency: commitSetSize ? modifications / commitSetSize : 0,
        churnRate: commitSetSize ? churn / commitSetSize : 0,
        topAuthor: top
          ? { name: top.name, email: top.email, ownership: churn ? top.churn / churn : 0 }
          : { name: '', email: '', ownership: 0 },
      };
    })
    .sort((a, b) => b.churn - a.churn);
}

/** view=author: per-author rollup rows over the repo root. */
function authorRollupFor(records, totalChurn, commitSetSize, mergeMap) {
  const map = new Map();
  for (const r of records) {
    const id = resolveIdentity(r.author.name, r.author.email, mergeMap);
    let e = map.get(id.key);
    if (!e) {
      e = { name: id.name, email: id.email, added: 0, removed: 0, commitChurn: new Map() };
      map.set(id.key, e);
    }
    const churn = r.added + r.removed;
    e.added += r.added;
    e.removed += r.removed;
    e.commitChurn.set(r.commitHash, (e.commitChurn.get(r.commitHash) || 0) + churn);
  }
  return [...map.values()]
    .map((e) => {
      const churn = e.added + e.removed;
      let modifications = 0;
      for (const v of e.commitChurn.values()) if (v > 0) modifications += 1;
      return {
        path: e.name,
        email: e.email,
        type: 'author',
        addedLines: e.added,
        removedLines: e.removed,
        growth: e.added - e.removed,
        churn,
        modifications,
        modificationFrequency: commitSetSize ? modifications / commitSetSize : 0,
        churnRate: commitSetSize ? churn / commitSetSize : 0,
        topAuthor: { name: e.name, email: e.email, ownership: totalChurn ? churn / totalChurn : 0 },
      };
    })
    .sort((a, b) => b.churn - a.churn);
}

/**
 * Main query entry point.
 * params: { since, until, commitHashes[], author, path, view }
 */
export function queryMetrics(repoId, params = {}) {
  const engine = engines.get(repoId);
  if (!engine) {
    const err = new Error('Repo is not ready');
    err.statusCode = 409;
    throw err;
  }
  const repo = getRepo(repoId);
  const mergeMap = buildMergeMap(repo ? repo.authorMerges : []);

  // Normalise path ("", "/" => root) and view (accept "repository").
  let qPath = String(params.path ?? '').trim();
  qPath = qPath === '/' ? '' : qPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const viewRaw = String(params.view || 'repo').toLowerCase();
  const view = viewRaw === 'repository' ? 'repo' : ['repo', 'directory', 'file', 'author'].includes(viewRaw) ? viewRaw : 'repo';

  const since = Number.isFinite(params.since) ? params.since : null;
  const until = Number.isFinite(params.until) ? params.until : null;
  const commitHashes = Array.isArray(params.commitHashes) && params.commitHashes.length ? params.commitHashes : null;
  const authorFilter = params.author ? parseAuthorParam(params.author) : null;

  const hashSet = commitHashes ? new Set(commitHashes.map((h) => String(h).toLowerCase())) : null;
  const hCommits = selectCommits(engine, { hashSet, since, until, authorFilter, mergeMap });
  const commitSetSize = hCommits.length;

  // A hash/time filter means record membership must be checked against hSet;
  // with only an author filter the record arrays come from the pair index.
  const needHashCheck = Boolean(hashSet) || since != null || until != null;
  const hSet = needHashCheck ? new Set(hCommits.map((c) => c.hash)) : null;
  const inH = (r) => !needHashCheck || hSet.has(r.commitHash);

  const pathPredicate = (p) => {
    if (view === 'repo' || view === 'author' || qPath === '') return true;
    if (view === 'file') return p === qPath;
    return p === qPath || p.startsWith(qPath + '/');
  };

  const baseRecordsForObject = () => {
    if (view === 'file') return engine.fileIndex.get(qPath) || [];
    if (view === 'directory' && qPath !== '') return engine.dirIndex.get(qPath) || [];
    return engine.diffs;
  };

  let records; // records for the queried object, author filter applied
  let scopeAll = null; // records for the queried object, no author filter
  if (!authorFilter) {
    const base = baseRecordsForObject();
    scopeAll = needHashCheck ? base.filter(inH) : base;
    records = scopeAll;
  } else {
    const candidateKeys = new Set();
    for (const email of groupEmailsFor(authorFilter.email, mergeMap)) {
      const keySet = engine.pairsByEmail.get(email);
      if (keySet) for (const k of keySet) candidateKeys.add(k);
    }
    const out = [];
    for (const key of candidateKeys) {
      const arr = engine.recordsByPair.get(key);
      if (!arr) continue;
      for (const r of arr) {
        if (!authorMatches(r.author.name, r.author.email, authorFilter, mergeMap)) continue;
        if (!pathPredicate(r.path) || !inH(r)) continue;
        out.push(r);
      }
    }
    records = out;
    if (needHashCheck) scopeAll = baseRecordsForObject().filter(inH);
  }

  // Ownership denominator: churn of the object across ALL authors.
  // Without time/hash filters this is the pre-computed total; otherwise scan.
  let totalChurnForOwnership;
  if (!needHashCheck) {
    if (view === 'file') totalChurnForOwnership = engine.fileChurnAll.get(qPath) || 0;
    else if (view === 'directory' && qPath !== '') totalChurnForOwnership = engine.dirChurnAll.get(qPath) || 0;
    else totalChurnForOwnership = engine.totalChurnAll;
  } else {
    totalChurnForOwnership = 0;
    for (const r of scopeAll) totalChurnForOwnership += r.added + r.removed;
  }

  const metrics = objMetrics(records, commitSetSize);
  let breakdown = [];
  if (view === 'repo') breakdown = breakdownFor(records, '', commitSetSize, mergeMap);
  else if (view === 'directory') breakdown = breakdownFor(records, qPath, commitSetSize, mergeMap);
  else if (view === 'author') breakdown = authorRollupFor(records, totalChurnForOwnership, commitSetSize, mergeMap);

  const authors = authorsFor(records, totalChurnForOwnership, mergeMap);
  const displayPath = qPath === '' ? '/' : qPath;

  return {
    repoId,
    view,
    path: view === 'file' || view === 'directory' ? displayPath : '/',
    commitCount: commitSetSize,
    metrics,
    breakdown,
    authors,
  };
}

/* ------------------------------------------------------------------ */
/* Data access helpers for the routes                                  */
/* ------------------------------------------------------------------ */

/** All authors (after mailmap + manual merges) with commit counts. */
export function listAuthors(repoId) {
  const engine = engines.get(repoId);
  if (!engine) return null;
  const repo = getRepo(repoId);
  const mergeMap = buildMergeMap(repo ? repo.authorMerges : []);
  const map = new Map();
  for (const c of engine.commits) {
    const id = resolveIdentity(c.authorName, c.authorEmail, mergeMap);
    let e = map.get(id.key);
    if (!e) {
      e = { name: id.name, email: id.email, commits: 0 };
      map.set(id.key, e);
    }
    e.commits += 1;
  }
  return [...map.values()].sort((a, b) => b.commits - a.commits);
}

/** Paginated commit list (newest first, as git log returns them). */
export function listCommits(repoId, opts = {}) {
  const engine = engines.get(repoId);
  if (!engine) return null;
  const repo = getRepo(repoId);
  const mergeMap = buildMergeMap(repo ? repo.authorMerges : []);

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(opts.limit, 10) || 50));
  const since = opts.since != null && opts.since !== '' && Number.isFinite(Number(opts.since)) ? Number(opts.since) : null;
  const until = opts.until != null && opts.until !== '' && Number.isFinite(Number(opts.until)) ? Number(opts.until) : null;

  let list = engine.commits;
  if (since != null || until != null) {
    list = list.filter((c) => (since == null || c.date >= since) && (until == null || c.date <= until));
  }
  const total = list.length;
  const slice = list.slice((page - 1) * limit, page * limit);
  const commits = slice.map((c) => {
    const id = resolveIdentity(c.authorName, c.authorEmail, mergeMap);
    return {
      hash: c.hash,
      message: c.message,
      date: c.date,
      authorName: id.name,
      authorEmail: id.email,
    };
  });
  return { total, page, limit, commits };
}

/** Nested file tree at the repo's ref (cached after first build). */
export async function getRepoFileTree(repoId) {
  const engine = engines.get(repoId);
  const repo = getRepo(repoId);
  if (!engine || !repo) return null;
  if (!engine.fileTree) {
    const paths = await getFileTree(repo.path, engine.ref);
    engine.fileTree = buildNestedTree(paths);
  }
  return engine.fileTree;
}

function buildNestedTree(paths) {
  const root = { name: '/', path: '', type: 'directory', children: [] };
  const dirMap = new Map([['', root]]);
  for (const p of paths) {
    const parts = p.split('/');
    let parentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      const curPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
      if (isFile) {
        dirMap.get(parentPath).children.push({ name: parts[i], path: curPath, type: 'file' });
      } else {
        let dir = dirMap.get(curPath);
        if (!dir) {
          dir = { name: parts[i], path: curPath, type: 'directory', children: [] };
          dirMap.set(curPath, dir);
          dirMap.get(parentPath).children.push(dir);
        }
        parentPath = curPath;
      }
    }
  }
  const sortChildren = (node) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) if (child.type === 'directory') sortChildren(child);
  };
  sortChildren(root);
  return root;
}
