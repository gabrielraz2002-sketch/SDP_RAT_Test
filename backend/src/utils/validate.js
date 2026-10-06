#!/usr/bin/env node
/**
 * Reference validation CLI.
 * Usage: node src/utils/validate.js <repoName>   (cJSON | redis | git)
 *
 * Requires the backend (default http://localhost:3001) to be running with the
 * repo already loaded at its reference SHA. Compares every unique
 * (object_type, path, author) combination from the reference CSV against the
 * live API.
 *
 * Tolerances: added/removed/growth/churn/modifications exact;
 * modification_frequency, churn_rate, ownership within 0.0001.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCES_DIR = path.resolve(__dirname, '../../../references');
const BASE_URL = process.env.RAT_BASE_URL || 'http://localhost:3001';

const EXACT_FIELDS = ['added', 'removed', 'growth', 'churn', 'modifications'];
const RATIO_FIELDS = ['modification_frequency', 'churn_rate'];
const TOLERANCE = 0.0001;
const OBJECT_TYPE_TO_VIEW = { repository: 'repo', repo: 'repo', directory: 'directory', file: 'file' };
const CONCURRENCY = 12;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function parseAuthorField(authorField) {
  const s = String(authorField);
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim();
    return { name: name || null, email: m[2].trim() };
  }
  return { name: null, email: s.trim() };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && body.error ? body.error : `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function runPool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function waitForReady(initialRepo) {
  let repo = initialRepo;
  let waitedSeconds = 0;
  while (repo.status !== 'ready') {
    if (repo.status === 'error') {
      fail(`Repo "${repo.name}" failed to load: ${repo.error || 'unknown error'}`);
    }
    const p = repo.progress || { loaded: 0, total: 0 };
    process.stdout.write(`\rWaiting for "${repo.name}" to finish processing (${p.loaded}/${p.total})...   `);
    await new Promise((r) => setTimeout(r, 5000));
    waitedSeconds += 5;
    if (waitedSeconds > 4 * 60 * 60) fail('Timed out waiting for repo processing');
    repo = await fetchJson(`${BASE_URL}/api/repos/${repo.id}`);
  }
  if (waitedSeconds > 0) process.stdout.write('\r');
  return repo;
}

async function main() {
  const repoName = process.argv[2];
  if (!repoName) {
    fail('Usage: node src/utils/validate.js <cJSON|redis|git>');
  }

  let csvName;
  try {
    csvName = fs
      .readdirSync(REFERENCES_DIR)
      .find((f) => f.toLowerCase().startsWith(repoName.toLowerCase() + '_') && f.toLowerCase().endsWith('.csv'));
  } catch {
    fail(`References directory not found: ${REFERENCES_DIR}`);
  }
  if (!csvName) fail(`No reference CSV found in ${REFERENCES_DIR} for repo "${repoName}"`);
  const csvPath = path.join(REFERENCES_DIR, csvName);

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0];
  const dataRows = rows.slice(1);
  const col = (name) => header.indexOf(name);
  const idx = {};
  for (const name of [
    'object_type',
    'path',
    'author',
    'added',
    'removed',
    'growth',
    'churn',
    'modifications',
    'modification_frequency',
    'churn_rate',
    'ownership',
    'ref_sha',
  ]) {
    idx[name] = col(name);
  }
  if (idx.object_type === -1 || idx.path === -1 || idx.author === -1) {
    fail(`Unexpected CSV header in ${csvName}`);
  }

  let repos;
  try {
    repos = await fetchJson(`${BASE_URL}/api/repos`);
  } catch (err) {
    fail(`Could not reach the backend at ${BASE_URL} (is it running?): ${err.message}`);
  }
  let repo = repos.find((r) => String(r.name).toLowerCase() === repoName.toLowerCase());
  if (!repo) fail(`Repo "${repoName}" is not loaded in the backend. Add it at the reference SHA first.`);
  repo = await waitForReady(repo);

  const refShort = String(dataRows[0] ? dataRows[0][idx.ref_sha] : '').slice(0, 12);
  console.log(`Validating ${repoName} against ref ${refShort}...`);

  // Unique (object_type, path, author) combos (commit_set is "all" in the references).
  const seen = new Set();
  const combos = [];
  for (const row of dataRows) {
    const key = `${row[idx.object_type]}\u0000${row[idx.path]}\u0000${row[idx.author]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push(row);
  }

  const results = await runPool(
    combos,
    async (row) => {
      const objectType = row[idx.object_type];
      const authorField = row[idx.author];
      const author = authorField && authorField !== 'ALL' ? parseAuthorField(authorField) : null;

      const params = new URLSearchParams();
      params.set('view', OBJECT_TYPE_TO_VIEW[objectType] || 'repo');
      params.set('path', row[idx.path]);
      // Reference author identities are exact (name, email) pairs — pass the full
      // field so the API can distinguish name variants that share one email.
      if (author) params.set('author', authorField);

      let resp;
      try {
        resp = await fetchJson(`${BASE_URL}/api/metrics/${repo.id}?${params.toString()}`);
      } catch (err) {
        return { row, fields: [{ field: 'request', expected: 'HTTP 200', actual: err.message }] };
      }

      const m = resp.metrics || {};
      const actualByField = {
        added: m.addedLines,
        removed: m.removedLines,
        growth: m.growth,
        churn: m.churn,
        modifications: m.modifications,
        modification_frequency: m.modificationFrequency,
        churn_rate: m.churnRate,
      };

      const fields = [];
      for (const fieldName of [...EXACT_FIELDS, ...RATIO_FIELDS]) {
        const raw = row[idx[fieldName]];
        if (raw === '' || raw === undefined || raw === null) continue;
        const expected = Number(raw);
        const actual = actualByField[fieldName];
        const tol = EXACT_FIELDS.includes(fieldName) ? 0 : TOLERANCE;
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
          fields.push({ field: fieldName, expected, actual });
        }
      }

      // Author rows: ownership comes from the response authors array.
      const rawOwnership = row[idx.ownership];
      if (author && rawOwnership !== '' && rawOwnership !== undefined && rawOwnership !== null) {
        const expected = Number(rawOwnership);
        const emailLower = author.email.toLowerCase();
        const authors = resp.authors || [];
        // Match the exact (name, email) identity first, then fall back to email only.
        const entry =
          (author.name != null &&
            authors.find(
              (a) => String(a.email).toLowerCase() === emailLower && String(a.name) === author.name
            )) ||
          authors.find((a) => String(a.email).toLowerCase() === emailLower);
        const actual = entry ? entry.ownership : 0;
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > TOLERANCE) {
          fields.push({ field: 'ownership', expected, actual: entry ? entry.ownership : null });
        }
      }

      return { row, fields };
    },
    CONCURRENCY
  );

  let matched = 0;
  const mismatches = [];
  for (const { row, fields } of results) {
    if (fields.length === 0) matched += 1;
    else mismatches.push({ row, fields });
  }

  console.log(`✓ ${matched} rows matched`);
  console.log(`✗ ${mismatches.length} rows mismatched`);
  if (mismatches.length > 0) {
    console.log('\nMismatches:');
    for (const { row, fields } of mismatches.slice(0, 25)) {
      const label = `${row[idx.object_type]} ${row[idx.path] || '/'} ${row[idx.author]}`;
      for (const f of fields) {
        console.log(`  [${label}] ${f.field}: expected=${f.expected} actual=${f.actual}`);
      }
    }
    if (mismatches.length > 25) console.log(`  ... and ${mismatches.length - 25} more mismatched rows`);
    console.log('\nValidation FAILED');
    process.exitCode = 1;
  } else {
    console.log('\nValidation PASSED');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
