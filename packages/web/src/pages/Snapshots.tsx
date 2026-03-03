import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { snapshotsApi } from '../api/snapshots.js';
import { serversApi } from '../api/servers.js';
import { SnapshotTable } from '../components/SnapshotTable.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { ConfirmationModal } from '../components/ConfirmationModal.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Snapshots() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  } | null>(null);
  const qc = useQueryClient();

  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const { data, isLoading } = useQuery({
    queryKey: ['snapshots', { page, status: statusFilter }],
    queryFn: () => snapshotsApi.list({ page, limit: 20, status: statusFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: snapshotsApi.delete,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['snapshots'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: snapshotsApi.cancel,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['snapshots'] }),
  });

  const snapshots = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const serverNames = Object.fromEntries(servers.map((s) => [s.id, s.name]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Snapshots</h1>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,25%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-[hsl(215,20%,45%)]">Loading...</div>
        ) : (
          <SnapshotTable
            snapshots={snapshots}
            serverNames={serverNames}
            onSelect={(id) => setActiveSnapshotId(id)}
            onDelete={(id) => {
              setConfirmation({
                title: 'Delete Snapshot',
                message: 'Are you sure you want to delete this snapshot and its remote file?',
                confirmLabel: 'Delete',
                variant: 'danger',
                onConfirm: () => {
                  deleteMutation.mutate(id);
                  setConfirmation(null);
                }
              });
            }}
            onCancel={(id) => {
              setConfirmation({
                title: 'Cancel Snapshot',
                message: 'Are you sure you want to cancel the running snapshot? This will stop the backup and upload process.',
                confirmLabel: 'Cancel Snapshot',
                variant: 'danger',
                onConfirm: () => {
                  cancelMutation.mutate(id);
                  setConfirmation(null);
                }
              });
            }}
          />
        )}
      </div>

      {activeSnapshotId && (
        <ProgressModal
          snapshotId={activeSnapshotId}
          onClose={() => setActiveSnapshotId(null)}
          onCancel={(id) => {
            setConfirmation({
              title: 'Cancel Snapshot',
              message: 'Are you sure you want to cancel the running snapshot? This will stop the backup and upload process.',
              confirmLabel: 'Cancel Snapshot',
              variant: 'danger',
              onConfirm: () => {
                cancelMutation.mutate(id);
                setConfirmation(null);
              }
            });
          }}
        />
      )}

      {confirmation && (
        <ConfirmationModal
          isOpen={!!confirmation}
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          variant={confirmation.variant}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[hsl(215,20%,50%)]">
            {total} snapshots · Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-[hsl(222,47%,25%)] disabled:opacity-40 hover:bg-[hsl(222,47%,20%)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-[hsl(222,47%,25%)] disabled:opacity-40 hover:bg-[hsl(222,47%,20%)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
