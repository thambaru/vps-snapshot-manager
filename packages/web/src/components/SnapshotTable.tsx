import { Trash2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Snapshot } from '../api/snapshots.js';
import { StatusBadge } from './StatusBadge.js';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

interface Props {
  snapshots: Snapshot[];
  serverNames?: Record<string, string>;
  showServer?: boolean;
  onDelete?: (id: string) => void;
  onCancel?: (id: string) => void;
  onSelect?: (id: string) => void;
}

export function SnapshotTable({
  snapshots,
  serverNames = {},
  showServer = true,
  onDelete,
  onCancel,
  onSelect,
}: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="text-center py-12 text-[hsl(215,20%,45%)] text-sm">
        No snapshots yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[hsl(222,47%,22%)]">
            {showServer && (
              <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
                Server
              </th>
            )}
            <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
              Date
            </th>
            <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
              Status
            </th>
            <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
              Size
            </th>
            <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
              Duration
            </th>
            <th className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
              Trigger
            </th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(222,47%,18%)]">
          {snapshots.map((snap) => (
            <tr
              key={snap.id}
              className="hover:bg-[hsl(222,47%,16%)] transition-colors cursor-pointer"
              onClick={() => onSelect?.(snap.id)}
            >
              {showServer && (
                <td className="py-3 px-4 font-mono text-xs text-[hsl(215,20%,65%)]">
                  {serverNames[snap.serverId] ?? snap.serverId.slice(0, 8)}
                </td>
              )}
              <td className="py-3 px-4 text-[hsl(215,20%,65%)] text-xs">
                {formatDistanceToNow(new Date(snap.createdAt * 1000), { addSuffix: true })}
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={snap.status} pulse />
                {(snap.status === 'running' || snap.status === 'uploading') && (
                  <span className="ml-2 text-xs text-blue-400">{snap.progressPercent}%</span>
                )}
              </td>
              <td className="py-3 px-4 text-[hsl(215,20%,65%)]">{formatBytes(snap.sizeBytes)}</td>
              <td className="py-3 px-4 text-[hsl(215,20%,65%)]">{formatDuration(snap.durationSeconds)}</td>
              <td className="py-3 px-4">
                <span className="text-xs text-[hsl(215,20%,50%)] capitalize">{snap.triggerType}</span>
              </td>
              <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 justify-end">
                  {(snap.status === 'running' || snap.status === 'uploading') && onCancel && (
                    <button
                      onClick={() => onCancel(snap.id)}
                      className="p-1 text-[hsl(215,20%,50%)] hover:text-yellow-400 transition-colors"
                      title="Cancel"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {snap.status !== 'running' && snap.status !== 'uploading' && onDelete && (
                    <button
                      onClick={() => onDelete(snap.id)}
                      className="p-1 text-[hsl(215,20%,50%)] hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
