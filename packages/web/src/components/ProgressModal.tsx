import { X, CheckCircle2, Loader2, Circle, AlertCircle, Terminal, ChevronDown } from 'lucide-react';
import { useProgressStore } from '../store/snapshotProgress.js';
import { useEffect, useRef, useState } from 'react';
import { snapshotsApi, type SnapshotLog } from '../api/snapshots.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

const STAGE_LABELS: Record<string, string> = {
  prepare: 'Connecting',
  filesystem: 'Filesystem',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  mongo: 'MongoDB',
  docker: 'Docker Volumes',
  custom: 'Custom Dirs',
  bundle: 'Bundling',
  upload: 'Uploading',
};

const LOG_LEVEL_COLOR: Record<string, string> = {
  info: 'text-[hsl(215,20%,70%)]',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface StageRowProps {
  name: string;
  isDone: boolean;
  isCurrent: boolean;
  sizeBytes?: number;
  durationMs?: number;
}

function StageRow({ name, isDone, isCurrent, sizeBytes, durationMs }: StageRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 flex-shrink-0">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : isCurrent ? (
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        ) : (
          <Circle className="w-5 h-5 text-[hsl(215,20%,35%)]" />
        )}
      </div>
      <span className={`text-sm flex-1 ${isDone ? 'text-[hsl(210,40%,85%)]' : isCurrent ? 'text-blue-300' : 'text-[hsl(215,20%,45%)]'}`}>
        {STAGE_LABELS[name] ?? name}
      </span>
      {isDone && sizeBytes !== undefined && (
        <span className="text-xs text-[hsl(215,20%,55%)]">{formatBytes(sizeBytes)}</span>
      )}
      {isDone && durationMs !== undefined && (
        <span className="text-xs text-[hsl(215,20%,45%)]">{(durationMs / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

interface Props {
  snapshotId: string;
  onClose?: () => void;
}

export function ProgressModal({ snapshotId, onClose }: Props) {
  const progress = useProgressStore((s) => s.active.get(snapshotId));
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<SnapshotLog[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isDone = progress?.status === 'failed' || progress?.status === 'completed';
  const { subscribe } = useWebSocket();

  // Fetch initial logs on mount
  useEffect(() => {
    let cancelled = false;
    
    async function fetchInitialLogs() {
      try {
        const initialLogs = await snapshotsApi.logs(snapshotId);
        if (!cancelled) {
          setLogs(initialLogs);
        }
      } catch {
        // ignore errors
      }
    }
    
    fetchInitialLogs();
    
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  // Subscribe to new logs via WebSocket
  useEffect(() => {
    const unsubscribe = subscribe('snapshot:log', (data) => {
      const event = data as { type: 'snapshot:log'; snapshotId: string; log: SnapshotLog };
      if (event.snapshotId === snapshotId) {
        setLogs((prev) => [...prev, event.log]);
      }
    });

    return unsubscribe;
  }, [snapshotId, subscribe]);

  // Auto-scroll log panel to bottom when new lines arrive
  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  if (!progress) return null;

  const allStages = ['prepare', 'filesystem', 'mysql', 'postgres', 'mongo', 'docker', 'custom', 'bundle', 'upload'];
  const doneStageNames = new Set(progress.stagesDone.map((s) => s.stage));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)] shrink-0">
          <h2 className="font-semibold text-sm">Snapshot in progress</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogs((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                showLogs
                  ? 'bg-[hsl(222,47%,22%)] border-[hsl(222,47%,35%)] text-[hsl(210,40%,85%)]'
                  : 'border-[hsl(222,47%,28%)] text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,85%)] hover:border-[hsl(222,47%,38%)]'
              }`}
              title="Toggle terminal output"
            >
              <Terminal className="w-3.5 h-3.5" />
              Logs
            </button>
            {onClose && (
              <button onClick={onClose} className="text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,98%)]">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Log panel */}
        {showLogs && (
          <div className="border-b border-[hsl(222,47%,22%)] shrink-0">
            <div className="h-52 overflow-y-auto bg-[hsl(222,47%,9%)] px-4 py-3 font-mono text-xs leading-5">
              {logs.length === 0 ? (
                <span className="text-[hsl(215,20%,40%)]">Waiting for output…</span>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-[hsl(215,20%,35%)] shrink-0 select-none">
                      {log.stage ? `[${log.stage}]` : '[—]'}
                    </span>
                    <span className={LOG_LEVEL_COLOR[log.level] ?? 'text-[hsl(215,20%,70%)]'}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
            {/* Scroll-to-bottom hint */}
            <button
              className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-[hsl(215,20%,40%)] hover:text-[hsl(215,20%,65%)] transition-colors"
              onClick={() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ChevronDown className="w-3 h-3" /> scroll to bottom
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto">
          {progress.status === 'failed' ? (
            /* Error state */
            <div className="px-6 py-6">
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400 mb-1">Snapshot failed</p>
                  <p className="text-xs text-[hsl(215,20%,65%)] leading-relaxed wrap-break-word">
                    {progress.error ?? 'An unexpected error occurred.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="px-6 pt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[hsl(215,20%,55%)]">{progress.message}</span>
                  <span className="text-xs font-mono text-[hsl(217,91%,65%)]">{progress.progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-[hsl(222,47%,22%)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[hsl(217,91%,60%)] rounded-full transition-all duration-500"
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Stages */}
              <div className="px-6 py-4 divide-y divide-[hsl(222,47%,22%)]">
                {allStages.map((stage) => {
                  const doneInfo = progress.stagesDone.find((s) => s.stage === stage);
                  return (
                    <StageRow
                      key={stage}
                      name={stage}
                      isDone={doneStageNames.has(stage)}
                      isCurrent={progress.stage === stage && !doneStageNames.has(stage)}
                      sizeBytes={doneInfo?.sizeBytes}
                      durationMs={doneInfo?.durationMs}
                    />
                  );
                })}
              </div>

              {/* Status */}
              <div className="px-6 pb-5">
                <div className="text-xs text-center text-[hsl(215,20%,50%)] capitalize">
                  {progress.status}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
