import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { btn, btnGhost } from '../ui';
import { AlertIcon } from '../icons';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmação de ação destrutiva. Substitui window.confirm, que ignora o tema,
 * não diz consequência nenhuma e trava a aba enquanto está aberto.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  /* Portal para o body: o CinemaStage é `isolate`, então um z-50 dentro dele
     fica preso naquele contexto de empilhamento e a tab bar (z-10, fora)
     pintava por cima do diálogo. */
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="grid w-full max-w-sm gap-5 rounded-t-3xl border border-line-strong bg-surface-high p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-elev-2 sm:rounded-2xl sm:pb-6"
      >
        <div className="grid justify-items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-warn/20 text-warn">
            <AlertIcon size={22} />
          </span>
          <h2 id="confirm-title" className="m-0 text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <p id="confirm-description" className="m-0 text-muted">
            {description}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-flow-col sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className={`${btnGhost} w-full sm:w-auto`}
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${btn} w-full sm:w-auto`}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
