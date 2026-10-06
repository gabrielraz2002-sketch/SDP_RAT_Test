import { useState, useRef, useCallback } from 'react';
import { cloneRepo, uploadRepo, getRepoStatus } from '../utils/api.js';

async function pollUntilReady(id, onProgress) {
  for (let i = 0; i < 720; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await getRepoStatus(id);
    if (onProgress) onProgress(s.progress || { loaded: 0, total: 0 });
    if (s.status === 'ready') return;
    if (s.status === 'error') throw new Error(s.error || 'Processing failed');
  }
  throw new Error('Timed out waiting for repo to process');
}

const inputCls =
  'w-full bg-zinc-700 border border-zinc-600 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function ProgressRow({ busy, progress, verb }) {
  if (!busy || !progress) return null;
  const pct =
    progress.total > 0 ? Math.min(100, (progress.loaded / progress.total) * 100) : null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400">
        {verb}…{progress.total > 0 ? ` (${progress.loaded} / ${progress.total})` : ''}
      </p>
      {pct !== null && (
        <div className="w-full bg-zinc-700 rounded-full h-1.5">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function AddRepoModal({ onClose, onAdded }) {
  const [tab, setTab] = useState('clone');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneRef, setCloneRef] = useState('');

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadRef, setUploadRef] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef();

  const handleClone = useCallback(
    async (e) => {
      e.preventDefault();
      if (!cloneUrl.trim()) return;
      setError('');
      setBusy(true);
      setProgress({ loaded: 0, total: 0 });
      try {
        const { id } = await cloneRepo(
          cloneUrl.trim(),
          cloneName.trim() || undefined,
          cloneRef.trim() || undefined
        );
        await pollUntilReady(id, setProgress);
        onAdded(id);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        setBusy(false);
      }
    },
    [cloneUrl, cloneName, cloneRef, onAdded]
  );

  const handleUpload = useCallback(
    async (e) => {
      e.preventDefault();
      if (!uploadFile) return;
      setError('');
      setBusy(true);
      setProgress({ loaded: 0, total: 0 });
      try {
        const fd = new FormData();
        fd.append('repo', uploadFile);
        if (uploadName.trim()) fd.append('name', uploadName.trim());
        if (uploadRef.trim()) fd.append('ref', uploadRef.trim());
        const { id } = await uploadRepo(fd);
        await pollUntilReady(id, setProgress);
        onAdded(id);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        setBusy(false);
      }
    },
    [uploadFile, uploadName, uploadRef, onAdded]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      setUploadFile(file);
      if (!uploadName) setUploadName(file.name.replace(/\.zip$/i, ''));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-base font-semibold text-zinc-100">Add Repository</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700">
          {[
            { id: 'clone', label: 'Clone URL' },
            { id: 'upload', label: 'Upload Zip' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => !busy && setTab(t.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === 'clone' ? (
            <form onSubmit={handleClone} className="space-y-3">
              <Field label="Git Repository URL" required>
                <input
                  type="url"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  disabled={busy}
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Display Name">
                <input
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="Auto-detected from URL"
                  disabled={busy}
                  className={inputCls}
                />
              </Field>
              <Field label="Reference SHA / Branch (optional)">
                <input
                  value={cloneRef}
                  onChange={(e) => setCloneRef(e.target.value)}
                  placeholder="HEAD"
                  disabled={busy}
                  className={inputCls}
                />
              </Field>
              <ProgressRow busy={busy} progress={progress} verb="Cloning" />
              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-md transition-colors"
              >
                {busy ? 'Working…' : 'Clone'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUpload} className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  drag
                    ? 'border-indigo-400 bg-indigo-900/20'
                    : 'border-zinc-600 hover:border-zinc-400'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => !busy && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadName) setUploadName(f.name.replace(/\.zip$/i, ''));
                    }
                  }}
                />
                {uploadFile ? (
                  <p className="text-sm text-zinc-200 font-medium">{uploadFile.name}</p>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Drag &amp; drop a{' '}
                    <span className="text-zinc-200 font-medium">.zip</span> here, or{' '}
                    <span className="text-indigo-400">click to browse</span>
                  </p>
                )}
              </div>
              <Field label="Display Name">
                <input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Repo name"
                  disabled={busy}
                  className={inputCls}
                />
              </Field>
              <Field label="Reference SHA (optional)">
                <input
                  value={uploadRef}
                  onChange={(e) => setUploadRef(e.target.value)}
                  placeholder="HEAD"
                  disabled={busy}
                  className={inputCls}
                />
              </Field>
              <ProgressRow busy={busy} progress={progress} verb="Processing" />
              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !uploadFile}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-md transition-colors"
              >
                {busy ? 'Working…' : 'Upload'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
