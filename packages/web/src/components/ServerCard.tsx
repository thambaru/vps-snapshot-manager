import { Server, Wifi, WifiOff, Play, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Server as ServerType } from '../api/servers.js';
import { StatusBadge } from './StatusBadge.js';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  server: ServerType;
  onTest?: (id: string) => void;
  onSnapshot?: (id: string) => void;
  onHistory?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ServerCard({ server, onTest, onSnapshot, onHistory, onDelete }: Props) {
  const tags: string[] = JSON.parse(server.tags || '[]') as string[];

  return (
    <div
      onClick={(e) => {
        // Prevent navigation if clicking on buttons
        if ((e.target as HTMLElement).closest('button')) {
          e.preventDefault();
        } else {
          onHistory?.(server.id);
        }
      }}
      className="block bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl p-5 hover:border-[hsl(222,47%,30%)] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[hsl(217,91%,60%,0.15)] rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-[hsl(217,91%,60%)]" />
          </div>
          <div>
            <p className="font-semibold text-sm hover:text-[hsl(217,91%,70%)] transition-colors">
              {server.name}
            </p>
            <p className="text-xs text-[hsl(215,20%,55%)] font-mono">
              {server.username}@{server.host}:{server.port}
            </p>
          </div>
        </div>
        <div className="shrink-0"><StatusBadge status={server.status} /></div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-[hsl(222,47%,22%)] rounded text-xs text-[hsl(215,20%,60%)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {server.lastPingAt && (
        <p className="text-xs text-[hsl(215,20%,50%)] mb-3">
          Last ping: {formatDistanceToNow(new Date(server.lastPingAt), { addSuffix: true })}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            onTest?.(server.id);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[hsl(222,47%,22%)] hover:bg-[hsl(222,47%,27%)] transition-colors"
        >
          {server.status === 'online' ? (
            <Wifi className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
          )}
          Test
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            onSnapshot?.(server.id);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[hsl(217,91%,60%,0.15)] hover:bg-[hsl(217,91%,60%,0.25)] text-[hsl(217,91%,70%)] transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Snapshot
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete?.(server.id);
          }}
          className="flex items-center justify-center px-2.5 py-1.5 text-xs rounded-md bg-[hsl(222,47%,22%)] hover:bg-red-500/20 hover:text-red-400 text-[hsl(215,20%,55%)] transition-colors"
          title="Remove server"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
