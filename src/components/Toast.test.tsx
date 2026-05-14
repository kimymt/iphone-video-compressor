// Phase 7: ToastStack のレンダリングテスト。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import ToastStack from './Toast';
import { useToastStore, _resetToastStoreForTest } from '../stores/toastStore';

beforeEach(() => {
  _resetToastStoreForTest();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ToastStack', () => {
  it('items=[] のとき DOM に何も出さない', () => {
    render(<ToastStack />);
    expect(screen.queryByTestId('toast-stack')).toBeNull();
  });

  it('show() 後にレンダリングされる', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('hello', { durationMs: 0 });
    });
    expect(screen.getByTestId('toast-stack')).toBeInTheDocument();
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveTextContent('hello');
  });

  it('kind=error は role=alert + aria-live=assertive', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('boom', { kind: 'error', durationMs: 0 });
    });
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveAttribute('role', 'alert');
    expect(toast).toHaveAttribute('aria-live', 'assertive');
    expect(toast).toHaveAttribute('data-kind', 'error');
  });

  it('kind=info は role=status + aria-live=polite', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('FYI', { kind: 'info', durationMs: 0 });
    });
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  it('kind=success は role=status + aria-live=polite', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('OK', { kind: 'success', durationMs: 0 });
    });
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  it('X ボタンクリックで dismiss が呼ばれ消える', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('dismiss me', { durationMs: 0 });
    });
    const close = screen.getByLabelText('閉じる');
    fireEvent.click(close);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('複数 toast を縦に積む (順序維持)', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('first', { durationMs: 0 });
      useToastStore.getState().show('second', { durationMs: 0 });
      useToastStore.getState().show('third', { durationMs: 0 });
    });
    const toasts = screen.getAllByTestId('toast');
    expect(toasts).toHaveLength(3);
    expect(toasts[0]).toHaveTextContent('first');
    expect(toasts[1]).toHaveTextContent('second');
    expect(toasts[2]).toHaveTextContent('third');
  });

  it('toastStore のタイマー経由で自動 dismiss されると DOM からも消える', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().show('temp', { durationMs: 1000 });
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
