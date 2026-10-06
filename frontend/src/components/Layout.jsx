import RepoSidebar from './RepoSidebar.jsx';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      <RepoSidebar />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
