import { useQuery } from '@tanstack/react-query';
import { serversApi } from '../api/servers.js';
import { snapshotsApi } from '../api/snapshots.js';
import { schedulesApi } from '../api/schedules.js';
import { Server, Archive, CheckCircle, AlertCircle } from 'lucide-react';
import { SnapshotTable } from '../components/SnapshotTable.js';
import { formatDistanceToNow } from 'date-fns';

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[hsl(215,20%,55%)] uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export function Dashboard() {
  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: serversApi.list });
  const { data: snapshotData } = useQuery({
    queryKey: ['snapshots', { limit: 10 }],
    queryFn: () => snapshotsApi.list({ limit: 10 }),
  });
  const { data: schedules = [] } = useQuery({ queryKey: ['schedules'], queryFn: schedulesApi.list });

  const snapshots = snapshotData?.items ?? [];
  const onlineCount = servers.filter((s) => s.status === 'online').length;
  const failedToday = snapshots.filter(
    (s) => s.status === 'failed' && s.createdAt * 1000 > Date.now() - 86400000,
  ).length;
  const serverNames = Object.fromEntries(servers.map((s) => [s.id, s.name]));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Total Servers"
          value={servers.length}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          icon={CheckCircle}
          label="Online"
          value={onlineCount}
          color="bg-green-500/20 text-green-400"
        />
        <StatCard
          icon={Archive}
          label="Snapshots (30d)"
          value={snapshotData?.total ?? 0}
          color="bg-purple-500/20 text-purple-400"
        />
        <StatCard
          icon={AlertCircle}
          label="Failed (24h)"
          value={failedToday}
          color={failedToday > 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Snapshots */}
        <div className="lg:col-span-2 bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(222,47%,22%)]">
            <h2 className="font-medium text-sm">Recent Snapshots</h2>
          </div>
          <SnapshotTable snapshots={snapshots} serverNames={serverNames} />
        </div>

        {/* Upcoming Schedules */}
        <div className="bg-[hsl(222,47%,15%)] border border-[hsl(222,47%,22%)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(222,47%,22%)]">
            <h2 className="font-medium text-sm">Upcoming Schedules</h2>
          </div>
          <div className="divide-y divide-[hsl(222,47%,18%)]">
            {schedules.filter((s) => s.isEnabled).slice(0, 6).map((schedule) => {
              const server = servers.find((s) => s.id === schedule.serverId);
              return (
                <div key={schedule.id} className="px-5 py-3">
                  <p className="text-sm font-medium">{server?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-[hsl(215,20%,50%)] font-mono mt-0.5">{schedule.cronExpression}</p>
                  {schedule.lastRunAt && (
                    <p className="text-xs text-[hsl(215,20%,40%)] mt-0.5">
                      Last run: {formatDistanceToNow(new Date(schedule.lastRunAt * 1000), { addSuffix: true })}
                    </p>
                  )}
                </div>
              );
            })}
            {schedules.filter((s) => s.isEnabled).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[hsl(215,20%,45%)]">
                No active schedules
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
