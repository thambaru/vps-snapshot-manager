import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Play, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { schedulesApi, type CreateScheduleInput } from '../api/schedules.js';
import { serversApi } from '../api/servers.js';
import { storageApi } from '../api/storage.js';
import { formatDistanceToNow } from 'date-fns';

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 2am', value: '0 2 * * *' },
  { label: 'Weekly (Sun 2am)', value: '0 2 * * 0' },
  { label: 'Monthly (1st, 2am)', value: '0 2 1 * *' },
];

const schema = z.object({
  serverId: z.string().uuid('Select a server'),
  storageRemoteId: z.string().uuid('Select a storage remote'),
  cronExpression: z.string().min(1, 'Required'),
  label: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

export function Schedules() {
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: schedulesApi.list,
  });
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const { data: remotes = [] } = useQuery({ queryKey: ['storage'], queryFn: storageApi.list });

  const createMutation = useMutation({
    mutationFn: (data: CreateScheduleInput) => schedulesApi.create(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedules'] });
      setShowForm(false);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: schedulesApi.delete,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: schedulesApi.toggle,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const runNowMutation = useMutation({
    mutationFn: schedulesApi.runNow,
  });

  const serverMap = Object.fromEntries(servers.map((s) => [s.id, s.name]));
  const remoteMap = Object.fromEntries(remotes.map((r) => [r.id, r.name]));

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isEnabled: true },
  });

  const cronValue = watch('cronExpression');

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Schedule
        </button>
      </div>

      <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-[hsl(215,20%,45%)]">Loading...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-12 text-[hsl(215,20%,45%)] text-sm">
            No schedules yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(222,47%,22%)]">
                {['Server', 'Schedule', 'Storage', 'Last Run', 'Status', ''].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs text-[hsl(215,20%,50%)] font-medium uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(222,47%,18%)]">
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-[hsl(222,47%,16%)] transition-colors">
                  <td className="py-3 px-4 font-medium">{serverMap[schedule.serverId] ?? '—'}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs text-[hsl(217,91%,65%)]">{schedule.cronExpression}</span>
                    {schedule.label && (
                      <p className="text-xs text-[hsl(215,20%,50%)] mt-0.5">{schedule.label}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[hsl(215,20%,65%)] text-xs">{remoteMap[schedule.storageRemoteId] ?? '—'}</td>
                  <td className="py-3 px-4 text-xs text-[hsl(215,20%,55%)]">
                    {schedule.lastRunAt
                      ? formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true })
                      : 'Never'}
                    {schedule.lastRunStatus && (
                      <span className={`ml-1 ${schedule.lastRunStatus === 'failed' ? 'text-red-400' : 'text-green-400'}`}>
                        ({schedule.lastRunStatus})
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleMutation.mutate(schedule.id)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      {schedule.isEnabled ? (
                        <ToggleRight className="w-5 h-5 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-[hsl(215,20%,40%)]" />
                      )}
                      <span className={schedule.isEnabled ? 'text-green-400' : 'text-[hsl(215,20%,45%)]'}>
                        {schedule.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => runNowMutation.mutate(schedule.id)}
                        className="p-1 text-[hsl(215,20%,50%)] hover:text-blue-400 transition-colors"
                        title="Run now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this schedule?')) deleteMutation.mutate(schedule.id);
                        }}
                        className="p-1 text-[hsl(215,20%,50%)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Schedule Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)]">
              <h2 className="font-semibold text-sm">Add Schedule</h2>
              <button onClick={() => setShowForm(false)} className="text-[hsl(215,20%,55%)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Server</label>
                <select
                  {...register('serverId')}
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                >
                  <option value="">Select server...</option>
                  {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.serverId && <p className="text-xs text-red-400 mt-1">{errors.serverId.message}</p>}
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Storage Remote</label>
                <select
                  {...register('storageRemoteId')}
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                >
                  <option value="">Select remote...</option>
                  {remotes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
                </select>
                {errors.storageRemoteId && <p className="text-xs text-red-400 mt-1">{errors.storageRemoteId.message}</p>}
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Schedule</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setValue('cronExpression', p.value)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${cronValue === p.value ? 'border-[hsl(217,91%,60%)] text-[hsl(217,91%,70%)] bg-[hsl(217,91%,60%,0.1)]' : 'border-[hsl(222,47%,28%)] text-[hsl(215,20%,55%)] hover:border-[hsl(222,47%,38%)]'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  {...register('cronExpression')}
                  placeholder="0 2 * * *"
                  className="w-full px-3 py-2 text-sm font-mono bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
                {errors.cronExpression && <p className="text-xs text-red-400 mt-1">{errors.cronExpression.message}</p>}
              </div>

              <div>
                <label className="block text-xs text-[hsl(215,20%,55%)] mb-1">Label (optional)</label>
                <input
                  {...register('label')}
                  placeholder="Daily backup"
                  className="w-full px-3 py-2 text-sm bg-[hsl(222,47%,18%)] border border-[hsl(222,47%,28%)] rounded-lg focus:outline-none focus:border-[hsl(217,91%,60%)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); reset(); }}
                  className="flex-1 px-4 py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] hover:bg-[hsl(222,47%,20%)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] text-white font-medium transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
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
