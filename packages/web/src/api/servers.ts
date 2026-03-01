import { api } from './client.js';

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  status: 'online' | 'offline' | 'unknown';
  lastPingAt: number | null;
  tags: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ServerInfo {
  hostname: string;
  os: string;
  uptime: string;
  cpuCores: number;
  loadAvg: string;
  memTotal: number;
  memUsed: number;
  memFree: number;
  diskSize: string;
  diskUsed: string;
  diskAvail: string;
  diskPercent: string;
  dockerVolumes: string[];
}

export interface CreateServerInput {
  name: string;
  host: string;
  port?: number;
  username: string;
  authType: 'password' | 'key';
  secret: string;
  keyPassphrase?: string;
  tags?: string[];
  notes?: string;
}

export const serversApi = {
  list: () => api.get<Server[]>('/servers').then((r) => r.data),
  get: (id: string) => api.get<Server>(`/servers/${id}`).then((r) => r.data),
  create: (data: CreateServerInput) => api.post<{ id: string }>('/servers', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateServerInput>) =>
    api.put(`/servers/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/servers/${id}`).then((r) => r.data),
  test: (id: string) =>
    api.post<{ success: boolean; latencyMs: number; error?: string }>(`/servers/${id}/test`).then((r) => r.data),
  info: (id: string) => api.get<ServerInfo>(`/servers/${id}/info`).then((r) => r.data),
  getConfig: (id: string) => api.get(`/servers/${id}/config`).then((r) => r.data),
  updateConfig: (id: string, data: unknown) =>
    api.put(`/servers/${id}/config`, data).then((r) => r.data),
};
