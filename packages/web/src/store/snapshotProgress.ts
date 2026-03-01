import { create } from 'zustand';

export interface SnapshotProgress {
  snapshotId: string;
  serverId: string;
  status: string;
  stage: string;
  progressPercent: number;
  message: string;
  stagesDone: { stage: string; sizeBytes: number; durationMs: number }[];
}

interface ProgressStore {
  active: Map<string, SnapshotProgress>;
  update: (snapshotId: string, update: Partial<SnapshotProgress>) => void;
  addStage: (snapshotId: string, stage: string, sizeBytes: number, durationMs: number) => void;
  complete: (snapshotId: string) => void;
}

export const useProgressStore = create<ProgressStore>((set) => ({
  active: new Map(),

  update: (snapshotId, update) =>
    set((state) => {
      const next = new Map(state.active);
      const existing = next.get(snapshotId) ?? {
        snapshotId,
        serverId: '',
        status: 'pending',
        stage: '',
        progressPercent: 0,
        message: '',
        stagesDone: [],
      };
      next.set(snapshotId, { ...existing, ...update });
      return { active: next };
    }),

  addStage: (snapshotId, stage, sizeBytes, durationMs) =>
    set((state) => {
      const next = new Map(state.active);
      const existing = next.get(snapshotId);
      if (existing) {
        next.set(snapshotId, {
          ...existing,
          stagesDone: [...existing.stagesDone, { stage, sizeBytes, durationMs }],
        });
      }
      return { active: next };
    }),

  complete: (snapshotId) =>
    set((state) => {
      // Keep for a few seconds so UI can show completion, then let the snapshot list refresh remove it
      const next = new Map(state.active);
      next.delete(snapshotId);
      return { active: next };
    }),
}));
