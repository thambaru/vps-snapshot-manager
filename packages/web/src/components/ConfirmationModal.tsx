import { X, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning'
}: Props) {
  if (!isOpen) return null;

  const colors = {
    danger: 'bg-red-500 hover:bg-red-600 focus:ring-red-500',
    warning: 'bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] focus:ring-[hsl(217,91%,60%)]',
    info: 'bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,55%)] focus:ring-[hsl(217,91%,60%)]',
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-[hsl(222,47%,13%)] border border-[hsl(222,47%,25%)] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(222,47%,22%)]">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            {variant === 'danger' && <AlertTriangle className="w-4 h-4 text-red-400" />}
            {title}
          </h2>
          <button onClick={onCancel} className="text-[hsl(215,20%,55%)] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="px-6 py-6">
          <p className="text-sm text-[hsl(215,20%,70%)] leading-relaxed">
            {message}
          </p>
        </div>

        <div className="px-6 py-4 bg-[hsl(222,47%,11%)] flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-[hsl(222,47%,28%)] text-[hsl(215,20%,70%)] hover:bg-[hsl(222,47%,18%)] hover:text-white transition-colors font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[hsl(222,47%,13%)] ${colors[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
