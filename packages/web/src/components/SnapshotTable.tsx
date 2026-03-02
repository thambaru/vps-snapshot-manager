import { useState } from 'react';
import { Trash2, XCircle, X } from 'lucide-react';
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
  const [errorModal, setErrorModal] = useState<{ message: string } | null>(null);

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-12 text-[hsl(215,20%,45%)] text-sm">
        No snapshots yet.
      </div>
    );
  }

  return (
    <>
    {errorModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => setErrorModal(null)}
      >
        <div
          className="relative w-full max-w-lg mx-4 bg-[hsl(222,47%,13%)] border border-red-500/40 rounded-xl shadow-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-red-400">Snapshot Failed</h3>
            <button onClick={() => setErrorModal(null)} className="text-[hsl(215,20%,50%)] hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="text-xs text-[hsl(215,20%,75%)] whitespace-pre-wrap wrap-break-word font-mono bg-[hsl(222,47%,10%)] rounded-lg p-4 max-h-64 overflow-y-auto">
            {errorModal.message}
          </pre>
        </div>
      </div>
    )}
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
                {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
              </td>
              <td className="py-3 px-4">
                {snap.status === 'failed' && snap.errorMessage ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setErrorModal({ message: snap.errorMessage! }); }}
                    className="cursor-pointer"
                    title="Click to see error"
                  >
                    <StatusBadge status={snap.status} pulse />
                  </button>
                ) : (
                  <StatusBadge status={snap.status} pulse />
                )}
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
    </>
  );
}
