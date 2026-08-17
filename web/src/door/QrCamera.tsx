import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type QrCameraProps = {
  enabled: boolean;
  ignoreCode?: string | null;
  onCode: (code: string) => void;
};

export function QrCamera({ enabled, ignoreCode, onCode }: QrCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ignoreRef = useRef(ignoreCode);
  const onCodeRef = useRef(onCode);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    ignoreRef.current = ignoreCode;
  }, [ignoreCode]);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!enabled) return;

    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getUserMedia) return;

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement('canvas');

    function tick() {
      const video = videoRef.current;
      if (cancelled) return;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const result = jsQR(imageData.data, width, height);
            if (result?.data && result.data !== ignoreRef.current) {
              onCodeRef.current(result.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((nextStream) => {
        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = nextStream;
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  if (!enabled) return null;

  const noMediaApi = typeof navigator.mediaDevices?.getUserMedia !== 'function';
  if (unavailable || noMediaApi) {
    return (
      <p className="m-0 rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
        Câmera indisponível — cole o código abaixo.
      </p>
    );
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-black">
      <video ref={videoRef} className="size-full object-cover" playsInline muted autoPlay />
      {/* Mira: diz onde encostar o QR sem cobrir a imagem. */}
      <div className="pointer-events-none absolute inset-x-14 inset-y-12" aria-hidden="true">
        <span className="absolute top-0 left-0 size-8 rounded-tl-xl border-t-[3px] border-l-[3px] border-lavender" />
        <span className="absolute top-0 right-0 size-8 rounded-tr-xl border-t-[3px] border-r-[3px] border-lavender" />
        <span className="absolute bottom-0 left-0 size-8 rounded-bl-xl border-b-[3px] border-l-[3px] border-lavender" />
        <span className="absolute right-0 bottom-0 size-8 rounded-br-xl border-r-[3px] border-b-[3px] border-lavender" />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 m-0 text-center text-[13px] font-semibold text-white/75">
        Aponte para o QR do ingresso
      </p>
    </div>
  );
}
