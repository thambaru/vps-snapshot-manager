import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  serverName: string;
  isPending: boolean;
  result?: { success: boolean; latencyMs: number; error?: string };
  onClose: () => void;
}

export function TestConnectionModal({ serverName, isPending, result, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)]">
          <h2 className="font-semibold text-sm">Test Connection</h2>
          {!isPending && (
            <button onClick={onClose} className="text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,98%)]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Terminal body */}
        <div className="px-6 py-5">
          <div className="bg-[hsl(222,47%,9%)] rounded-lg p-4 font-mono text-xs leading-6 min-h-[96px] space-y-1">
            <div className="text-[hsl(215,20%,55%)]">
              <span className="text-green-400">$</span> ssh {serverName}
            </div>

            {isPending && (
              <div className="flex items-center gap-2 text-[hsl(215,20%,60%)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                Connecting…
              </div>
            )}

            {result && (
              <>
                {result.success ? (
                  <>
                    <div className="text-green-400">Connection established.</div>
                    <div className="text-[hsl(215,20%,55%)]">
                      Round-trip latency:{' '}
                      <span className="text-[hsl(210,40%,85%)]">{result.latencyMs} ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-green-400 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      SSH ping OK
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-red-400">Connection failed.</div>
                    {result.error && (
                      <div className="text-[hsl(215,20%,55%)] wrap-break-word whitespace-pre-wrap">
                        {result.error}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-red-400 pt-1">
                      <XCircle className="w-3.5 h-3.5" />
                      SSH ping failed ({result.latencyMs} ms)
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {!isPending && result && (
          <div className="px-6 pb-5">
            <button
              onClick={onClose}
              className="w-full py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] hover:bg-[hsl(222,47%,20%)] transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
