import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import repoRoutes from './routes/repos.js';
import metricRoutes from './routes/metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Runtime directories (git-ignored): cloned/extracted repos + temp uploads
fs.mkdirSync(path.join(__dirname, '../repos'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/repos', repoRoutes);
app.use('/api/metrics', metricRoutes);

// Global error handler (must be registered last)
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`RAT backend listening on port ${PORT}`);
});
