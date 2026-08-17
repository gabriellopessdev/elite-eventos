import type { ReactNode } from 'react';
import { AlertIcon } from '../icons';
import { btnGhost, skeleton, surface } from '../ui';

/**
 * Carregando, vazio e erro — os três estados que faltavam. O erro em especial:
 * antes era uma frase solta, sem nada para a pessoa fazer além de recarregar a
 * página na mão.
 */

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className={`${surface} grid justify-items-center gap-3 border-danger/40 px-6 py-8 text-center`}
      role="alert"
    >
      <p className="m-0 flex items-center gap-2 font-semibold text-danger">
        <AlertIcon size={18} />
        {message}
      </p>
      {onRetry ? (
        <button type="button" className={`${btnGhost} min-h-10`} onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function EmptyNotice({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${surface} grid justify-items-center gap-3 px-6 py-10 text-center`}>
      <h1 className="m-0 max-w-[18ch] text-[clamp(1.6rem,4.5vw,2.4rem)] font-extrabold tracking-tight">
        {title}
      </h1>
      {description ? <p className="m-0 max-w-md text-muted">{description}</p> : null}
      {children}
    </div>
  );
}

/** Esqueleto de um card de pôster, na mesma proporção 2/3 do card real. */
export function PosterSkeleton() {
  return (
    <div className="grid gap-2.5" aria-hidden="true">
      <div className={`${skeleton} aspect-2/3 w-full rounded-xl`} />
      <div className="grid gap-1.5">
        <div className={`${skeleton} h-3.5 w-4/5`} />
        <div className={`${skeleton} h-3 w-1/2`} />
        <div className={`${skeleton} h-3.5 w-2/5`} />
      </div>
    </div>
  );
}

export function PosterSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="m-0 grid w-full list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      aria-label="Carregando sessões"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <PosterSkeleton />
        </li>
      ))}
    </ul>
  );
}
