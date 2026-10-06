import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const getRepos = (signal) =>
  api.get('/repos', { signal }).then((r) => r.data);

export const getRepo = (id, signal) =>
  api.get(`/repos/${id}`, { signal }).then((r) => r.data);

export const deleteRepo = (id, signal) =>
  api.delete(`/repos/${id}`, { signal }).then((r) => r.data);

export const cloneRepo = (url, name, ref, signal) =>
  api
    .post('/repos/clone', { url, name: name || undefined, ref: ref || undefined }, { signal })
    .then((r) => r.data);

export const uploadRepo = (formData, signal) =>
  api.post('/repos/upload', formData, { signal }).then((r) => r.data);

export const getRepoStatus = (id, signal) =>
  api.get(`/repos/${id}/status`, { signal }).then((r) => r.data);

export const getAuthors = (id, signal) =>
  api.get(`/repos/${id}/authors`, { signal }).then((r) => r.data);

export const getCommits = (id, params, signal) =>
  api.get(`/repos/${id}/commits`, { params, signal }).then((r) => r.data);

export const getFiles = (id, signal) =>
  api.get(`/repos/${id}/files`, { signal }).then((r) => r.data);

export const mergeAuthors = (id, payload, signal) =>
  api.post(`/repos/${id}/merge-authors`, payload, { signal }).then((r) => r.data);

export const removeMerge = (id, canonicalEmail, signal) =>
  api
    .delete(`/repos/${id}/merge-authors/${encodeURIComponent(canonicalEmail)}`, { signal })
    .then((r) => r.data);

export const getMetrics = (repoId, params, signal) =>
  api.get(`/metrics/${repoId}`, { params, signal }).then((r) => r.data);
