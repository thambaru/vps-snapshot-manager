import { api } from './client.js';

export interface Schedule {
  id: string;
  serverId: string;
  storageRemoteId: string;
  cronExpression: string;
  label: string | null;
  isEnabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: string | null;
  lastSnapshotId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateScheduleInput {
  serverId: string;
  storageRemoteId: string;
  cronExpression: string;
  label?: string;
  isEnabled?: boolean;
}

export const schedulesApi = {
  list: () => api.get<Schedule[]>('/schedules').then((r) => r.data),
  get: (id: string) => api.get<Schedule>(`/schedules/${id}`).then((r) => r.data),
  create: (data: CreateScheduleInput) =>
    api.post<{ id: string }>('/schedules', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateScheduleInput>) =>
    api.put(`/schedules/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/schedules/${id}`).then((r) => r.data),
  toggle: (id: string) =>
    api.post<{ isEnabled: boolean }>(`/schedules/${id}/toggle`).then((r) => r.data),
  runNow: (id: string) =>
    api.post<{ snapshotId: string }>(`/schedules/${id}/run-now`).then((r) => r.data),
};
