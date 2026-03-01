import { api } from './client.js';

export interface Snapshot {
  id: string;
  serverId: string;
  storageRemoteId: string | null;
  status: 'pending' | 'running' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  triggerType: 'manual' | 'scheduled';
  scheduleId: string | null;
  remotePath: string | null;
  sizeBytes: number | null;
  startedAt: number | null;
  completedAt: number | null;
  durationSeconds: number | null;
  currentStage: string | null;
  progressPercent: number;
  errorMessage: string | null;
  stagesLog: string;
  createdAt: number;
}

export interface SnapshotLog {
  id: number;
  snapshotId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  stage: string | null;
  createdAt: number;
}

export const snapshotsApi = {
  list: (params?: { serverId?: string; status?: string; page?: number; limit?: number }) =>
    api.get<{ items: Snapshot[]; total: number; page: number; limit: number }>('/snapshots', { params }).then((r) => r.data),
  get: (id: string) => api.get<Snapshot>(`/snapshots/${id}`).then((r) => r.data),
  logs: (id: string, since?: number) =>
    api.get<SnapshotLog[]>(`/snapshots/${id}/logs`, { params: since ? { since } : undefined }).then((r) => r.data),
  trigger: (serverId: string, storageRemoteId: string) =>
    api.post<{ snapshotId: string }>('/snapshots', { serverId, storageRemoteId }).then((r) => r.data),
  delete: (id: string) => api.delete(`/snapshots/${id}`).then((r) => r.data),
  cancel: (id: string) => api.post(`/snapshots/${id}/cancel`).then((r) => r.data),
};
