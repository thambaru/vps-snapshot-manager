import type { WebSocket } from '@fastify/websocket';

export type ProgressEventType =
  | 'snapshot:progress'
  | 'snapshot:stage_complete'
  | 'snapshot:done'
  | 'server:status';

export interface SnapshotProgressEvent {
  type: 'snapshot:progress';
  snapshotId: string;
  serverId: string;
  status: string;
  stage: string;
  progressPercent: number;
  message: string;
  timestamp: number;
}

export interface SnapshotStageCompleteEvent {
  type: 'snapshot:stage_complete';
  snapshotId: string;
  stage: string;
  sizeBytes: number;
  durationMs: number;
}

export interface SnapshotDoneEvent {
  type: 'snapshot:done';
  snapshotId: string;
  status: 'completed' | 'failed' | 'cancelled';
  totalSizeBytes: number;
  durationSeconds: number;
  error?: string;
}

export interface ServerStatusEvent {
  type: 'server:status';
  serverId: string;
  status: 'online' | 'offline';
}

export type WSEvent =
  | SnapshotProgressEvent
  | SnapshotStageCompleteEvent
  | SnapshotDoneEvent
  | ServerStatusEvent;

class ProgressService {
  private clients: Set<WebSocket> = new Set();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(event: WSEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        if (client.readyState === 1 /* OPEN */) {
          client.send(payload);
        }
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const progressService = new ProgressService();
