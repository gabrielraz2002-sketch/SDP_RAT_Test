import fs from 'fs';
import path from 'path';

/**
 * Git .mailmap parser supporting all four variants:
 *   Proper Name <proper@email> Bad Name <bad@email>
 *   Proper Name <proper@email> <bad@email>
 *   <proper@email> Bad Name <bad@email>
 *   <proper@email> <bad@email>
 * (plus a lone "Proper Name <proper@email>" line, which renames that email).
 * Comments (# to end of line) and blank lines are ignored.
 */

/** Parse raw mailmap text into a resolver function. */
export function parseMailmapContent(content) {
  const map = new Map(); // lower(commit email) -> { name, email }
  for (let line of String(content).split('\n')) {
    const hashIdx = line.indexOf('#');
    if (hashIdx !== -1) line = line.slice(0, hashIdx);
    line = line.trim();
    if (!line) continue;

    const pairs = [];
    const re = /([^<]*?)\s*<([^>]+)>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      pairs.push({ name: m[1].trim() || null, email: m[2].trim() });
    }
    if (pairs.length === 0) continue;

    const proper = pairs[0];
    const commit = pairs.length > 1 ? pairs[1] : { name: null, email: proper.email };
    map.set(commit.email.toLowerCase(), { name: proper.name, email: proper.email });
  }

  return function resolveAuthor(name, email) {
    const entry = map.get(String(email || '').toLowerCase());
    if (!entry) return { name, email };
    // A missing proper name keeps the commit name (git behaviour).
    return { name: entry.name || name, email: entry.email || email };
  };
}

/** Read <repoPath>/.mailmap from disk and return a resolver (identity if absent). */
export function parseMailmap(repoPath) {
  try {
    const content = fs.readFileSync(path.join(repoPath, '.mailmap'), 'utf8');
    return parseMailmapContent(content);
  } catch {
    return (name, email) => ({ name, email });
  }
}

/**
 * Remap commits' authors to canonical identities according to manual merge
 * rules: [{ canonical: {name,email}, aliases: [{name,email}] }].
 * Aliases are matched by email, case-insensitively.
 */
export function mergeAuthors(commits, merges) {
  if (!merges || merges.length === 0) return commits;
  const aliasMap = new Map(); // lower(email) -> canonical {name,email}
  for (const group of merges) {
    if (!group || !group.canonical || !group.canonical.email) continue;
    const canon = { name: group.canonical.name || group.canonical.email, email: group.canonical.email };
    aliasMap.set(canon.email.toLowerCase(), canon);
    for (const alias of group.aliases || []) {
      if (alias && alias.email) aliasMap.set(alias.email.toLowerCase(), canon);
    }
  }
  return commits.map((c) => {
    const email = c.authorEmail || (c.author && c.author.email) || '';
    const canon = aliasMap.get(String(email).toLowerCase());
    if (!canon) return c;
    if ('authorEmail' in c) return { ...c, authorEmail: canon.email, authorName: canon.name };
    return { ...c, author: { name: canon.name, email: canon.email } };
  });
}
