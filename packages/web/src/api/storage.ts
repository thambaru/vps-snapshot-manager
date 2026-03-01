import { api } from './client.js';

export interface StorageRemote {
  id: string;
  name: string;
  type: string;
  remotePath: string;
  isDefault: boolean;
  createdAt: number;
}

export interface CreateRemoteInput {
  name: string;
  type: string;
  config: Record<string, string>;
  remotePath?: string;
  isDefault?: boolean;
}

export const storageApi = {
  list: () => api.get<StorageRemote[]>('/storage').then((r) => r.data),
  get: (id: string) => api.get<StorageRemote>(`/storage/${id}`).then((r) => r.data),
  create: (data: CreateRemoteInput) => api.post<{ id: string }>('/storage', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateRemoteInput>) =>
    api.put(`/storage/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/storage/${id}`).then((r) => r.data),
  test: (id: string) =>
    api.post<{ success: boolean; error?: string }>(`/storage/${id}/test`).then((r) => r.data),
  setDefault: (id: string) => api.post(`/storage/${id}/set-default`).then((r) => r.data),
  browse: (id: string, path?: string) =>
    api.get(`/storage/${id}/browse`, { params: path ? { path } : undefined }).then((r) => r.data),
};
