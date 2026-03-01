import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import { useProgressStore } from '../../store/snapshotProgress.js';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function Layout() {
  const { subscribe } = useWebSocket();
  const { update, addStage, complete } = useProgressStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub1 = subscribe('snapshot:progress', (data) => {
      const d = data as { snapshotId: string; serverId: string; status: string; stage: string; progressPercent: number; message: string };
      update(d.snapshotId, {
        snapshotId: d.snapshotId,
        serverId: d.serverId,
        status: d.status,
        stage: d.stage,
        progressPercent: d.progressPercent,
        message: d.message,
      });
    });

    const unsub2 = subscribe('snapshot:stage_complete', (data) => {
      const d = data as { snapshotId: string; stage: string; sizeBytes: number; durationMs: number };
      addStage(d.snapshotId, d.stage, d.sizeBytes, d.durationMs);
    });

    const unsub3 = subscribe('snapshot:done', (data) => {
      const d = data as { snapshotId: string; status: string };
      setTimeout(() => {
        complete(d.snapshotId);
        void queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      }, 2000);
    });

    const unsub4 = subscribe('server:status', () => {
      void queryClient.invalidateQueries({ queryKey: ['servers'] });
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [subscribe, update, addStage, complete, queryClient]);

  return (
    <div className="flex h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
