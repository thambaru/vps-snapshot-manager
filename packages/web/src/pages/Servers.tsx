import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { serversApi, type CreateServerInput, type Server as ServerType } from '../api/servers.js';
import { storageApi } from '../api/storage.js';
import { snapshotsApi } from '../api/snapshots.js';
import { ServerCard } from '../components/ServerCard.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { TestConnectionModal } from '../components/TestConnectionModal.js';
import { useProgressStore } from '../store/snapshotProgress.js';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  host: z.string().min(1, 'Required'),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1, 'Required'),
  authType: z.enum(['password', 'key']),
  secret: z.string().min(1, 'Required'),
  keyPassphrase: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function Servers() {
  const [showForm, setShowForm] = useState(false);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [snapshotServerId, setSnapshotServerId] = useState<string | null>(null);
  const [testingServer, setTestingServer] = useState<ServerType | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; error?: string } | undefined>();
  const qc = useQueryClient();
  const activeSnapshots = useProgressStore((s) => s.active);

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: serversApi.list,
  });

  const { data: storageRemotes = [] } = useQuery({
    queryKey: ['storage'],
    queryFn: storageApi.list,
  });

  const createMutation = useMutation({
    mutationFn: serversApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['servers'] });
      setShowForm(false);
    },
  });

  const testMutation = useMutation({
    mutationFn: serversApi.test,
    onSuccess: (data) => {
      setTestResult(data);
      void qc.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const handleTest = (id: string) => {
    const server = servers.find((s) => s.id === id);
    if (!server) return;
    setTestingServer(server);
    setTestResult(undefined);
    testMutation.mutate(id);
  };

  const snapshotMutation = useMutation({
    mutationFn: ({ serverId, remoteId }: { serverId: string; remoteId: string }) =>
      snapshotsApi.trigger(serverId, remoteId),
    onSuccess: (data) => {
      setActiveSnapshotId(data.snapshotId);
    },
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { authType: 'password', port: 22 },
  });

  const authType = watch('authType');

  const onSubmit = (data: FormData) => {
    const tags = data.tags ? data.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    createMutation.mutate({ ...data, tags } as CreateServerInput);
  };

  const handleSnapshot = (serverId: string) => {
    if (storageRemotes.length === 0) {
      alert('Please add a storage remote in Settings first.');
      return;
    }
    const defaultRemote = storageRemotes.find((r) => r.isDefault) ?? storageRemotes[0];
    setSnapshotServerId(serverId);
    snapshotMutation.mutate({ serverId, remoteId: defaultRemote.id });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Servers</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[hsl(215,20%,45%)]">Loading...</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-12 text-[hsl(215,20%,45%)] text-sm">
          No servers yet. Add your first server to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onTest={handleTest}
              onSnapshot={handleSnapshot}
            />
          ))}
        </div>
      )}

      {/* Add Server Drawer */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)]">
              <h2 className="font-semibold text-sm">Add Server</h2>
              <button onClick={() => setShowForm(false)} className="text-[hsl(215,20%,55%)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Name</label>
                <input
                  {...register('name')}
                  placeholder="Production Web"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Host / IP</label>
                  <input
                    {...register('host')}
                    placeholder="192.168.1.1"
                    className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                  {errors.host && <p className="text-xs text-red-400 mt-1">{errors.host.message}</p>}
                </div>
                <div>
                  <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Port</label>
                  <input
                    {...register('port')}
                    type="number"
                    className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Username</label>
                <input
                  {...register('username')}
                  placeholder="root"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Auth Type</label>
                <select
                  {...register('authType')}
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                >
                  <option value="password">Password</option>
                  <option value="key">Private Key</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                  {authType === 'password' ? 'Password' : 'Private Key (PEM)'}
                </label>
                {authType === 'password' ? (
                  <input
                    {...register('secret')}
                    type="password"
                    className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                ) : (
                  <textarea
                    {...register('secret')}
                    rows={5}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                    className="w-full px-3 py-2 text-sm font-mono bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)] resize-none"
                  />
                )}
                {errors.secret && <p className="text-xs text-red-400 mt-1">{errors.secret.message}</p>}
              </div>

              {authType === 'key' && (
                <div>
                  <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                    Key Passphrase <span className="text-[hsl(215,20%,40%)]">(optional)</span>
                  </label>
                  <input
                    {...register('keyPassphrase')}
                    type="password"
                    className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">
                  Tags <span className="text-[hsl(215,20%,40%)]">(comma-separated)</span>
                </label>
                <input
                  {...register('tags')}
                  placeholder="prod, web, nginx"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] hover:bg-[hsl(222,47%,20%)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white font-medium transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding...' : 'Add Server'}
                </button>
              </div>

              {createMutation.isError && (
                <p className="text-xs text-red-400">{(createMutation.error as Error).message}</p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Test Connection Modal */}
      {testingServer && (
        <TestConnectionModal
          serverName={`${testingServer.username}@${testingServer.host}`}
          isPending={testMutation.isPending}
          result={testResult}
          onClose={() => { setTestingServer(null); setTestResult(undefined); }}
        />
      )}

      {/* Snapshot Progress Modals */}
      {activeSnapshotId && activeSnapshots.has(activeSnapshotId) && (
        <ProgressModal
          snapshotId={activeSnapshotId}
          onClose={() => setActiveSnapshotId(null)}
        />
      )}
    </div>
  );
}
