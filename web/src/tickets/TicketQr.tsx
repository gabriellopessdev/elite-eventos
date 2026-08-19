import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { skeleton } from '../ui';

export function TicketQr({ code, used }: { code: string; used: boolean }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(code, { margin: 1, width: 280 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!src) {
    return (
      <div className={`${skeleton} size-44`} aria-hidden="true" data-testid="qr-placeholder" />
    );
  }

  return (
    <div className="relative flex">
      <img src={src} alt="" className="size-44 rounded-xl bg-white p-2" width={176} height={176} />
      {used ? <div className="absolute inset-0 rounded-xl bg-surface-high/65" /> : null}
    </div>
  );
}
