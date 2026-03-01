import { clsx } from 'clsx';

interface Props {
  status: string;
  pulse?: boolean;
}

const statusStyles: Record<string, string> = {
  online: 'bg-green-500/20 text-green-400',
  offline: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
  pending: 'bg-gray-500/20 text-gray-400',
  running: 'bg-blue-500/20 text-blue-400',
  uploading: 'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

export function StatusBadge({ status, pulse }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        statusStyles[status] ?? 'bg-gray-500/20 text-gray-400',
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          status === 'online' && 'bg-green-400',
          status === 'offline' && 'bg-red-400',
          status === 'unknown' && 'bg-gray-400',
          status === 'pending' && 'bg-gray-400',
          status === 'running' && 'bg-blue-400',
          status === 'uploading' && 'bg-yellow-400',
          status === 'completed' && 'bg-green-400',
          status === 'failed' && 'bg-red-400',
          status === 'cancelled' && 'bg-gray-400',
          (pulse && (status === 'running' || status === 'uploading')) && 'animate-pulse',
        )}
      />
      {status}
    </span>
  );
}
