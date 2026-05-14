import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UnsupportedScreen from './UnsupportedScreen';
import type { EnvCheck } from '../lib/types';

function makeEnvCheck(overrides: Partial<EnvCheck> = {}): EnvCheck {
  return {
    videoEncoder: false,
    audioEncoder: false,
    webShareFiles: false,
    wakeLock: false,
    opfs: false,
    persistentStorage: false,
    hevcEncode: false,
    h264Encode: false,
    canRun: false,
    ...overrides,
  };
}

describe('UnsupportedScreen', () => {
  afterEach(() => {
    cleanup();
  });

  it('role="alert" の main を描画する (VoiceOver 用)', () => {
    render(<UnsupportedScreen envCheck={makeEnvCheck()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('「iOS 26 以降の Safari」のメッセージを表示する', () => {
    render(<UnsupportedScreen envCheck={makeEnvCheck()} />);
    expect(
      screen.getByRole('heading', { name: /iOS 26 以降の Safari/ }),
    ).toBeInTheDocument();
  });

  it('VideoEncoder 欠如時に「VideoEncoder」を必須機能として表示', () => {
    render(<UnsupportedScreen envCheck={makeEnvCheck({ videoEncoder: false })} />);
    expect(screen.getByText(/VideoEncoder/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /必須機能/ })).toBeInTheDocument();
  });

  it('h264Encode 欠如時に「H.264 エンコード」を必須機能として表示', () => {
    render(<UnsupportedScreen envCheck={makeEnvCheck({ h264Encode: false })} />);
    expect(screen.getByText(/H\.264 エンコード/)).toBeInTheDocument();
  });

  it('hevcEncode のみ欠如 (HEVC 未対応端末) → 必須機能リストに含まれない', () => {
    render(
      <UnsupportedScreen
        envCheck={makeEnvCheck({
          videoEncoder: true,
          audioEncoder: true,
          h264Encode: true,
          hevcEncode: false,
        })}
      />,
    );
    // 必須機能セクションは表示されない（core が全部揃っているので）
    expect(screen.queryByRole('heading', { name: /必須機能/ })).not.toBeInTheDocument();
    // しかし詳細を開けば「HEVC エンコード」が optional に出る
    expect(screen.getByText(/HEVC エンコード/)).toBeInTheDocument();
  });

  it('全 API 揃いの状態でも UnsupportedScreen 自体は描画可能 (異常系想定)', () => {
    render(
      <UnsupportedScreen
        envCheck={makeEnvCheck({
          videoEncoder: true,
          audioEncoder: true,
          h264Encode: true,
          hevcEncode: true,
          webShareFiles: true,
          wakeLock: true,
          opfs: true,
          persistentStorage: true,
          canRun: true,
        })}
      />,
    );
    // 必須機能 / 詳細セクションは出ない
    expect(screen.queryByRole('heading', { name: /必須機能/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/利用できない補助機能/)).not.toBeInTheDocument();
  });
});
