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
    return <p className="m-0 text-sm text-white/80">Câmera indisponível — cole o código.</p>;
  }

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded-xl border border-[#c4b5ff]/50 bg-black object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}
