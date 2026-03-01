import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Wifi } from 'lucide-react';
import { serversApi } from '../api/servers.js';
import { snapshotsApi } from '../api/snapshots.js';
import { storageApi } from '../api/storage.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { SnapshotTable } from '../components/SnapshotTable.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { useProgressStore } from '../store/snapshotProgress.js';

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[hsl(222,47%,18%)] rounded-lg px-4 py-3">
      <p className="text-xs text-[hsl(215,20%,50%)] mb-1">{label}</p>
      <p className="text-sm font-mono">{value}</p>
    </div>
  );
}

export function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const qc = useQueryClient();
  const activeSnapshots = useProgressStore((s) => s.active);

  const { data: server } = useQuery({
    queryKey: ['servers', id],
    queryFn: () => serversApi.get(id!),
    enabled: !!id,
  });

  const { data: info } = useQuery({
    queryKey: ['server-info', id],
    queryFn: () => serversApi.info(id!),
    enabled: !!id && server?.status === 'online',
    staleTime: 60_000,
  });

  const { data: snapshotData } = useQuery({
    queryKey: ['snapshots', { serverId: id }],
    queryFn: () => snapshotsApi.list({ serverId: id, limit: 10 }),
    enabled: !!id,
  });

  const { data: remotes = [] } = useQuery({
    queryKey: ['storage'],
    queryFn: storageApi.list,
  });

  const testMutation = useMutation({
    mutationFn: () => serversApi.test(id!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['servers', id] }),
  });

  const snapshotMutation = useMutation({
    mutationFn: (remoteId: string) => snapshotsApi.trigger(id!, remoteId),
    onSuccess: (data) => setActiveSnapshotId(data.snapshotId),
  });

  const deleteMutation = useMutation({
    mutationFn: snapshotsApi.delete,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['snapshots'] }),
  });

  if (!server) return <div className="p-6 text-[hsl(215,20%,45%)]">Loading...</div>;

  const defaultRemote = remotes.find((r) => r.isDefault) ?? remotes[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/servers" className="text-[hsl(215,20%,50%)] hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{server.name}</h1>
          <p className="text-sm text-[hsl(215,20%,50%)] font-mono">{server.username}@{server.host}:{server.port}</p>
        </div>
        <StatusBadge status={server.status} />
        <button
          onClick={() => testMutation.mutate()}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] hover:bg-[hsl(222,47%,20%)] transition-colors"
        >
          <Wifi className="w-4 h-4" />
          Test SSH
        </button>
        <button
          onClick={() => defaultRemote && snapshotMutation.mutate(defaultRemote.id)}
          disabled={!defaultRemote}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white font-medium transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          Take Snapshot
        </button>
      </div>

      {/* Server Stats */}
      {info && (
        <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl p-5">
          <h2 className="font-medium text-sm mb-4">Server Info</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <InfoCard label="Hostname" value={info.hostname} />
            <InfoCard label="OS" value={info.os} />
            <InfoCard label="Uptime" value={info.uptime} />
            <InfoCard label="CPU Cores" value={info.cpuCores} />
            <InfoCard label="Load Average" value={info.loadAvg.split(' ').slice(0, 3).join(' ')} />
            <InfoCard label="Memory" value={`${(info.memUsed / 1e9).toFixed(1)} / ${(info.memTotal / 1e9).toFixed(1)} GB`} />
            <InfoCard label="Disk" value={`${info.diskUsed} / ${info.diskSize} (${info.diskPercent})`} />
            <InfoCard label="Docker Volumes" value={info.dockerVolumes.length.toString()} />
          </div>
        </div>
      )}

      {/* Snapshot History */}
      <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(222,47%,22%)]">
          <h2 className="font-medium text-sm">Snapshot History</h2>
        </div>
        <SnapshotTable
          snapshots={snapshotData?.items ?? []}
          showServer={false}
          onDelete={(snapId) => {
            if (confirm('Delete this snapshot?')) deleteMutation.mutate(snapId);
          }}
        />
      </div>

      {/* Progress Modal */}
      {activeSnapshotId && activeSnapshots.has(activeSnapshotId) && (
        <ProgressModal
          snapshotId={activeSnapshotId}
          onClose={() => setActiveSnapshotId(null)}
        />
      )}
    </div>
  );
}
