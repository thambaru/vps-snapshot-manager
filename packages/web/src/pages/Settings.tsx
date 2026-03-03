import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star, Wifi, X, Terminal, Copy, Check } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { storageApi, type CreateRemoteInput } from '../api/storage.js';

const PROVIDER_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  drive: [
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'token', label: 'Token JSON (from rclone authorize)', type: 'textarea' },
  ],
  s3: [
    { key: 'provider', label: 'Provider (AWS, Minio, etc.)' },
    { key: 'access_key_id', label: 'Access Key ID' },
    { key: 'secret_access_key', label: 'Secret Access Key', type: 'password' },
    { key: 'region', label: 'Region' },
    { key: 'endpoint', label: 'Endpoint (for S3-compatible, optional)' },
    { key: 'bucket', label: 'Bucket Name' },
  ],
  onedrive: [
    { key: 'client_id', label: 'Client ID' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'token', label: 'Token JSON (from rclone authorize)', type: 'textarea' },
  ],
  sftp: [
    { key: 'host', label: 'Host' },
    { key: 'user', label: 'Username' },
    { key: 'key_pem', label: 'Private Key (PEM)', type: 'textarea' },
  ],
  b2: [
    { key: 'account', label: 'Account ID' },
    { key: 'key', label: 'Application Key', type: 'password' },
  ],
  dropbox: [
    { key: 'token', label: 'Token JSON (from rclone authorize)', type: 'textarea' },
  ],
};

const schema = z.object({
  name: z.string().min(1, 'Required').regex(/^[a-zA-Z0-9_-]+$/, 'Only alphanumeric, dashes, underscores'),
  type: z.string().min(1, 'Required'),
  remotePath: z.string().default('VPS-Snapshots/'),
  isDefault: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

export function Settings() {
  const [showForm, setShowForm] = useState(false);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const { data: remotes = [], isLoading } = useQuery({
    queryKey: ['storage'],
    queryFn: storageApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateRemoteInput) => storageApi.create(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['storage'] });
      setShowForm(false);
      setConfigFields({});
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: storageApi.delete,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['storage'] }),
  });

  const defaultMutation = useMutation({
    mutationFn: storageApi.setDefault,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['storage'] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => storageApi.test(id),
    onSuccess: (result, id) => setTestResults((prev) => ({ ...prev, [id]: result })),
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remotePath: 'VPS-Snapshots/', isDefault: false },
  });

  const selectedType = watch('type');
  const fields = PROVIDER_FIELDS[selectedType] ?? [];

  const onSubmit = (data: FormData) => {
    const config: Record<string, string> = { type: data.type, ...configFields };
    createMutation.mutate({
      name: data.name,
      type: data.type,
      config,
      remotePath: data.remotePath,
      isDefault: data.isDefault,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(222,47%,22%)]">
          <h2 className="font-medium text-sm">Storage Remotes</h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[hsl(217,91%,60%,0.15)] hover:bg-[hsl(217,91%,60%,0.25)] text-[hsl(217,91%,70%)] rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Remote
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-[hsl(215,20%,45%)]">Loading...</div>
        ) : (
          <div className="divide-y divide-[hsl(222,47%,18%)]">
            {remotes.map((remote) => {
              const isBuiltIn = remote.name === 'local-storage';
              return (
                <div key={remote.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[hsl(222,47%,22%)] rounded-lg flex items-center justify-center text-xs font-mono text-[hsl(215,20%,60%)]">
                      {remote.type.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{remote.name}</span>
                        {isBuiltIn && (
                          <span className="px-1.5 py-0.5 text-xs bg-[hsl(215,20%,30%)] text-[hsl(215,20%,65%)] rounded">built-in</span>
                        )}
                        {remote.isDefault && (
                          <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">default</span>
                        )}
                      </div>
                      <p className="text-xs text-[hsl(215,20%,50%)] break-all">{remote.type} · {remote.name}:{remote.remotePath}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {testResults[remote.id] && (
                      <span className={`text-xs ${testResults[remote.id].success ? 'text-green-400' : 'text-red-400'}`}>
                        {testResults[remote.id].success ? '✓ Connected' : '✗ Failed'}
                      </span>
                    )}
                    <button
                      onClick={() => testMutation.mutate(remote.id)}
                      className="p-1.5 text-[hsl(215,20%,50%)] hover:text-blue-400 transition-colors"
                      title="Test connection"
                    >
                      <Wifi className="w-4 h-4" />
                    </button>
                    {!remote.isDefault && (
                      <button
                        onClick={() => defaultMutation.mutate(remote.id)}
                        className="p-1.5 text-[hsl(215,20%,50%)] hover:text-yellow-400 transition-colors"
                        title="Set as default"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {!isBuiltIn && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this remote?')) deleteMutation.mutate(remote.id);
                        }}
                        className="p-1.5 text-[hsl(215,20%,50%)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Remote Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)] sticky top-0 bg-[hsl(222,47%,13%)]">
              <h2 className="font-semibold text-sm">Add Storage Remote</h2>
              <button onClick={() => { setShowForm(false); reset(); setConfigFields({}); }} className="text-[hsl(215,20%,55%)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Remote Name</label>
                <input
                  {...register('name')}
                  placeholder="my-gdrive"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Provider Type</label>
                <select
                  {...register('type')}
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                >
                  <option value="">Select provider...</option>
                  <option value="drive">Google Drive</option>
                  <option value="s3">Amazon S3 / S3-compatible</option>
                  <option value="onedrive">Microsoft OneDrive</option>
                  <option value="sftp">SFTP</option>
                  <option value="b2">Backblaze B2</option>
                  <option value="dropbox">Dropbox</option>
                </select>
                {errors.type && <p className="text-xs text-red-400 mt-1">{errors.type.message}</p>}
              </div>

              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={configFields[field.key] ?? ''}
                      onChange={(e) => setConfigFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 text-xs font-mono bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)] resize-none"
                    />
                  ) : (
                    <input
                      type={field.type ?? 'text'}
                      value={configFields[field.key] ?? ''}
                      onChange={(e) => setConfigFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                    />
                  )}
                </div>
              ))}

              {['drive', 'onedrive', 'dropbox'].includes(selectedType) && (() => {
                const cmd = `rclone authorize "${selectedType}"`;
                return (
                  <div className="bg-[hsl(217,91%,60%,0.08)] border border-[hsl(217,91%,60%,0.2)] rounded-lg p-3 text-xs text-[hsl(215,20%,65%)]">
                    <p className="font-medium text-[hsl(217,91%,70%)] mb-2">Run this on your local machine to get the token JSON:</p>
                    <div className="flex items-center gap-2 bg-[hsl(222,47%,10%)] border border-[hsl(222,47%,22%)] rounded-lg px-3 py-2">
                      <Terminal className="w-3.5 h-3.5 text-[hsl(215,20%,45%)] shrink-0" />
                      <code className="font-mono text-[hsl(142,70%,60%)] flex-1 select-all">{cmd}</code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(cmd).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          });
                        }}
                        className="text-[hsl(215,20%,45%)] hover:text-white transition-colors"
                        title="Copy command"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[hsl(142,70%,60%)]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="mt-2">Paste the output JSON into the Token field above.</p>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Remote Path</label>
                <input
                  {...register('remotePath')}
                  placeholder="VPS-Snapshots/"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('isDefault')} className="rounded" />
                Set as default remote
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); reset(); setConfigFields({}); }}
                  className="flex-1 px-4 py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] hover:bg-[hsl(222,47%,20%)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white font-medium transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding...' : 'Add Remote'}
                </button>
              </div>

              {createMutation.isError && (
                <p className="text-xs text-red-400">{(createMutation.error as Error).message}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
