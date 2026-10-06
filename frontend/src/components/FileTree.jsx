import { useState } from 'react';

function TreeNode({ node, activePath, onSelect, depth }) {
  // Top-level directories start expanded; everything else collapsed.
  const [expanded, setExpanded] = useState(depth === 0 && node.type === 'directory');
  const isActive = activePath === node.path;
  const indent = depth * 14;

  if (node.type === 'file') {
    return (
      <button
        onClick={() => onSelect(node.path, 'file')}
        style={{ paddingLeft: 14 + indent }}
        title={node.path}
        className={`w-full text-left flex items-center gap-1.5 py-0.5 pr-3 rounded transition-colors text-xs ${
          isActive
            ? 'bg-indigo-700/50 text-indigo-200'
            : 'text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200'
        }`}
      >
        <span className="flex-shrink-0">📄</span>
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          setExpanded((e) => !e);
          if (node.path) onSelect(node.path, 'directory');
        }}
        style={{ paddingLeft: 10 + indent }}
        title={node.path}
        className={`w-full text-left flex items-center gap-1.5 py-0.5 pr-3 rounded transition-colors text-xs ${
          isActive
            ? 'bg-indigo-700/50 text-indigo-200'
            : 'text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100'
        }`}
      >
        <span className="flex-shrink-0">{expanded ? '📂' : '📁'}</span>
        <span className="truncate font-medium">{node.name}</span>
        <span className="ml-auto text-zinc-600 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path || child.name}
              node={child}
              activePath={activePath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ tree, activePath, onSelect }) {
  if (!tree) {
    return (
      <div className="p-4 space-y-2">
        {[80, 60, 90, 50, 70].map((w, i) => (
          <div key={i} className="h-3 bg-zinc-700 rounded animate-pulse" style={{ width: w }} />
        ))}
      </div>
    );
  }

  const children = tree.children || [];
  if (children.length === 0) {
    return <p className="px-4 py-3 text-xs text-zinc-500">No files found</p>;
  }

  return (
    <div className="py-1 pr-1 text-sm select-none">
      {children.map((node) => (
        <TreeNode
          key={node.path || node.name}
          node={node}
          activePath={activePath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}
