# RAT — Repo Analysis Tool

A web-app dashboard that ingests Git repositories and computes detailed metrics across files, directories, commit sets, and authors. Built as a COMS3011A (Wits) submission.

## Features

- **Two ingestion methods** — clone from a remote URL or upload a zip file containing the `.git` directory
- **Multi-repo support** — load and switch between multiple repositories simultaneously
- **Metrics computed** — added/removed lines, growth, churn, modification count, modification frequency, churn rate, and author ownership
- **Four views** — Repository root, Directory, File, Author rollup
- **Filtering** — time range (from/to), manual commit selection, author, and path
- **Author merging** — automatic via `.mailmap`, or manual via the Author Management panel
- **Interactive dashboard** — sortable/paginated metrics table, stacked bar chart (top 10 by churn), author ownership pie chart, churn-over-time area chart with drill-down
- **Export CSV** — download the full breakdown as a CSV file
- **Keyboard shortcut** — press `/` anywhere to focus the path filter

## Run with Docker (quickest)

```bash
git clone https://github.com/gabrielraz2002-sketch/SDP_RAT_Test.git
cd SDP_RAT_Test
docker compose up --build
```

Open **http://localhost** in your browser.

## Run in dev mode

**Terminal 1 — backend**
```bash
cd backend
npm install
npm run dev          # API on http://localhost:3001
```

**Terminal 2 — frontend**
```bash
cd frontend
npm install
npm run dev          # UI  on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

## Test repositories

| Repo | Clone URL | Reference SHA | Commits |
|------|-----------|---------------|---------|
| cJSON | https://github.com/DaveGamble/cJSON.git | `6d9f2443ab071f86e5d9b43025a40929ec41c46c` | 955 |
| Redis | https://github.com/redis/redis.git | `b540ca49cba815f3fbe634363c3df68d4f4f127a` | 11,874 |
| Git | https://github.com/git/git.git | `5a7d1e8045ce66c908f62598e26cbb8df7b39a90` | 61,101 |

Use the Reference SHA as the optional "Ref SHA" field when cloning via the UI to match the reference data exactly.

## Reference validation

With the backend running and a repo loaded at its reference SHA:

```bash
cd backend
node src/utils/validate.js cJSON   # ✓ 983 rows matched  — PASSED
node src/utils/validate.js redis   # ✓ 18301 rows matched — PASSED
node src/utils/validate.js git     # ✓ 62601 rows matched — PASSED
```

## Metric definitions

| Metric | Definition |
|--------|-----------|
| Added Lines | Sum of lines added across all diff records |
| Removed Lines | Sum of lines removed across all diff records |
| Growth | Added − Removed |
| Churn | Added + Removed |
| Modifications | Distinct commits where churn on the object > 0 |
| Modification Frequency | Modifications ÷ \|H\| |
| Churn Rate | Churn ÷ \|H\| |
| Ownership | Author churn ÷ total object churn |

> **\|H\|** is the number of distinct commits after time/hash/author filters, *before* path filtering.

## Architecture

```
backend/          Node.js + Express API
  src/
    services/
      repoStore.js      In-memory repo registry
      gitService.js     All git shell-outs (execFile, batched numstat)
      metricService.js  Pre-computed diff cache + metric engine
    routes/
      repos.js          Repo CRUD, clone, upload, authors, commits, files
      metrics.js        Metric query endpoint
    utils/
      mailmap.js        .mailmap parser + author merge logic
      zipExtract.js     Zip extraction helper
      validate.js       CLI validation against reference CSVs

frontend/         React + Vite + Tailwind CSS
  src/
    components/         Layout, Sidebar, FilterBar, FileTree,
                        MetricsTable, MetricsCharts, AuthorMergePanel
    pages/              HomePage, RepoDashboard
    hooks/              useMetrics (debounced + AbortController)
    utils/              api.js (Axios wrapper)

references/       Reference CSVs for cJSON, Redis, and Git repos
docker-compose.yml
```
