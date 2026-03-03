import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Wifi, ChevronDown, ChevronUp, Save, Database, FolderTree, HardDrive, Container } from 'lucide-react';
import { serversApi, type SnapshotConfig } from '../api/servers.js';
import { snapshotsApi } from '../api/snapshots.js';
import { storageApi } from '../api/storage.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { SnapshotTable } from '../components/SnapshotTable.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { ConfirmationModal } from '../components/ConfirmationModal.js';
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
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<Partial<SnapshotConfig>>({});
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  } | null>(null);
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

  const { data: snapshotConfig } = useQuery({
    queryKey: ['snapshot-config', id],
    queryFn: () => serversApi.getConfig(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (snapshotConfig) {
      setConfig(snapshotConfig);
    }
  }, [snapshotConfig]);

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

  const cancelMutation = useMutation({
    mutationFn: snapshotsApi.cancel,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['snapshots', { serverId: id }] }),
  });

  const configMutation = useMutation({
    mutationFn: (data: Partial<SnapshotConfig>) => serversApi.updateConfig(id!, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['snapshot-config', id] });
      alert('Configuration saved successfully!');
    },
  });

  const handleConfigChange = (field: keyof SnapshotConfig, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: keyof SnapshotConfig, value: string) => {
    try {
      const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
      handleConfigChange(field, JSON.stringify(arr));
    } catch {
      handleConfigChange(field, value);
    }
  };

  const parseArray = (jsonStr: string | undefined): string[] => {
    try {
      return jsonStr ? JSON.parse(jsonStr) : [];
    } catch {
      return [];
    }
  };

  const saveConfig = () => {
    configMutation.mutate(config);
  };

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
          onClick={() => {
            setConfirmation({
              title: 'Take Snapshot',
              message: `Take a manual snapshot of "${server.name}"? This will backup the selected filesystem paths and databases to the default storage remote.`,
              confirmLabel: 'Take Snapshot',
              variant: 'info',
              onConfirm: () => {
                defaultRemote && snapshotMutation.mutate(defaultRemote.id);
                setConfirmation(null);
              }
            });
          }}
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

      {/* Snapshot Configuration */}
      {snapshotConfig && (
        <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-[hsl(222,47%,22%)] cursor-pointer hover:bg-[hsl(222,47%,18%)] transition-colors"
            onClick={() => setShowConfig(!showConfig)}
          >
            <h2 className="font-medium text-sm">Snapshot Configuration</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(215,20%,55%)]">
                {[
                  config.includeFilesystem && 'Filesystem',
                  config.includeMysql && 'MySQL',
                  config.includePostgres && 'PostgreSQL',
                  config.includeMongo && 'MongoDB',
                  config.includeDockerVolumes && 'Docker',
                  parseArray(config.customDirs).length > 0 && 'Custom',
                ].filter(Boolean).join(', ') || 'No stages enabled'}
              </span>
              {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {showConfig && (
            <div className="p-5 space-y-4">
              {/* Filesystem */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.includeFilesystem ?? false}
                    onChange={(e) => handleConfigChange('includeFilesystem', e.target.checked)}
                    className="w-4 h-4 rounded border-[hsl(222,47%,28%)] bg-[hsl(222,47%,18%)]"
                  />
                  <FolderTree className="w-4 h-4 text-[hsl(217,91%,60%)]" />
                  <span className="font-medium text-sm">Filesystem Backup</span>
                </div>
                {config.includeFilesystem && (
                  <div className="ml-7 space-y-2">
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                        Paths to backup (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={parseArray(config.filesystemPaths).join(', ')}
                        onChange={(e) => handleArrayChange('filesystemPaths', e.target.value)}
                        placeholder="/etc, /var/www, /home, /opt"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                        Exclude paths (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={parseArray(config.excludePaths).join(', ')}
                        onChange={(e) => handleArrayChange('excludePaths', e.target.value)}
                        placeholder="/proc, /sys, /dev, /run, /tmp"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* MySQL */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.includeMysql ?? false}
                    onChange={(e) => handleConfigChange('includeMysql', e.target.checked)}
                    className="w-4 h-4 rounded border-[hsl(222,47%,28%)] bg-[hsl(222,47%,18%)]"
                  />
                  <Database className="w-4 h-4 text-orange-400" />
                  <span className="font-medium text-sm">MySQL Backup</span>
                </div>
                {config.includeMysql && (
                  <div className="ml-7 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Username</label>
                        <input
                          type="text"
                          value={config.mysqlUser ?? ''}
                          onChange={(e) => handleConfigChange('mysqlUser', e.target.value)}
                          placeholder="root"
                          className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Password</label>
                        <input
                          type="password"
                          value={config.encryptedMysqlPass ?? ''}
                          onChange={(e) => handleConfigChange('encryptedMysqlPass', e.target.value)}
                          placeholder="Optional"
                          className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                        Databases (comma-separated, or * for all)
                      </label>
                      <input
                        type="text"
                        value={parseArray(config.mysqlDatabases).join(', ')}
                        onChange={(e) => handleArrayChange('mysqlDatabases', e.target.value)}
                        placeholder="*"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* PostgreSQL */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.includePostgres ?? false}
                    onChange={(e) => handleConfigChange('includePostgres', e.target.checked)}
                    className="w-4 h-4 rounded border-[hsl(222,47%,28%)] bg-[hsl(222,47%,18%)]"
                  />
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-sm">PostgreSQL Backup</span>
                </div>
                {config.includePostgres && (
                  <div className="ml-7 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Username</label>
                        <input
                          type="text"
                          value={config.pgUser ?? ''}
                          onChange={(e) => handleConfigChange('pgUser', e.target.value)}
                          placeholder="postgres"
                          className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Password</label>
                        <input
                          type="password"
                          value={config.encryptedPgPass ?? ''}
                          onChange={(e) => handleConfigChange('encryptedPgPass', e.target.value)}
                          placeholder="Optional"
                          className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                        Databases (comma-separated, or * for all)
                      </label>
                      <input
                        type="text"
                        value={parseArray(config.pgDatabases).join(', ')}
                        onChange={(e) => handleArrayChange('pgDatabases', e.target.value)}
                        placeholder="*"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* MongoDB */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.includeMongo ?? false}
                    onChange={(e) => handleConfigChange('includeMongo', e.target.checked)}
                    className="w-4 h-4 rounded border-[hsl(222,47%,28%)] bg-[hsl(222,47%,18%)]"
                  />
                  <Database className="w-4 h-4 text-green-400" />
                  <span className="font-medium text-sm">MongoDB Backup</span>
                </div>
                {config.includeMongo && (
                  <div className="ml-7 space-y-2">
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Connection URI</label>
                      <input
                        type="text"
                        value={config.mongoUri ?? ''}
                        onChange={(e) => handleConfigChange('mongoUri', e.target.value)}
                        placeholder="mongodb://localhost:27017"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                        Databases (comma-separated, or * for all)
                      </label>
                      <input
                        type="text"
                        value={parseArray(config.mongoDatabases).join(', ')}
                        onChange={(e) => handleArrayChange('mongoDatabases', e.target.value)}
                        placeholder="*"
                        className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Docker Volumes */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.includeDockerVolumes ?? false}
                    onChange={(e) => handleConfigChange('includeDockerVolumes', e.target.checked)}
                    className="w-4 h-4 rounded border-[hsl(222,47%,28%)] bg-[hsl(222,47%,18%)]"
                  />
                  <Container className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-sm">Docker Volumes</span>
                </div>
                {config.includeDockerVolumes && (
                  <div className="ml-7">
                    <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                      Volumes (comma-separated, or * for all)
                    </label>
                    <input
                      type="text"
                      value={parseArray(config.dockerVolumes).join(', ')}
                      onChange={(e) => handleArrayChange('dockerVolumes', e.target.value)}
                      placeholder="*"
                      className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                    />
                  </div>
                )}
              </div>

              {/* Custom Directories */}
              <div className="bg-[hsl(222,47%,12%)] rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-4 h-4 text-yellow-400" />
                  <span className="font-medium text-sm">Custom Directories</span>
                </div>
                <div className="ml-7">
                  <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                    Additional directories (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={parseArray(config.customDirs).join(', ')}
                    onChange={(e) => handleArrayChange('customDirs', e.target.value)}
                    placeholder="/custom/path, /another/dir"
                    className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={saveConfig}
                  disabled={configMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {configMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          )}
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
          onSelect={(snapId) => setActiveSnapshotId(snapId)}
          onDelete={(snapId) => {
            setConfirmation({
              title: 'Delete Snapshot',
              message: 'Are you sure you want to delete this snapshot and its remote file?',
              confirmLabel: 'Delete',
              variant: 'danger',
              onConfirm: () => {
                deleteMutation.mutate(snapId);
                setConfirmation(null);
              }
            });
          }}
        />
      </div>

      {/* Progress Modal */}
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
    </div>
  );
}
