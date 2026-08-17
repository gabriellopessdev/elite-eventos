import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QrCamera } from './QrCamera';

describe('QrCamera', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra o fallback quando getUserMedia rejeita', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    render(<QrCamera enabled onCode={vi.fn()} />);

    expect(await screen.findByText('Câmera indisponível — cole o código.')).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });
    expect(document.querySelector('video')).toBeNull();
  });

  it('não pede câmera nem renderiza vídeo quando enabled é false', () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    render(<QrCamera enabled={false} onCode={vi.fn()} />);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByText('Câmera indisponível — cole o código.')).toBeNull();
  });
});
