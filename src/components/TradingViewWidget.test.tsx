import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TradingViewWidget } from './TradingViewWidget';

// Mock lightweight-charts
vi.mock('lightweight-charts', () => {
  const chartMock = {
    addSeries: vi.fn().mockReturnValue({
      setData: vi.fn(),
      priceToCoordinate: vi.fn().mockReturnValue(100),
    }),
    subscribeCrosshairMove: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  };
  return {
    createChart: vi.fn().mockReturnValue(chartMock),
    ColorType: { Solid: 'Solid' },
    CandlestickSeries: 'CandlestickSeries',
    HistogramSeries: 'HistogramSeries',
    LineSeries: 'LineSeries',
  };
});

// Mock ResizeObserver
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('TradingViewWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with appropriate chart title based on chartId', () => {
    const { unmount: unmountPrimary } = render(<TradingViewWidget chartId="primary" />);
    expect(screen.getByText('Primary Chart')).toBeTruthy();
    unmountPrimary();

    const { unmount: unmountSecondary } = render(<TradingViewWidget chartId="secondary" />);
    expect(screen.getByText('Secondary Chart')).toBeTruthy();
    unmountSecondary();
  });

  it('toggles the 0DTE GEX panel visibility', () => {
    render(<TradingViewWidget chartId="primary" />);
    
    // GEX table should be visible by default
    expect(screen.getByText('0DTE Gamma Exposure')).toBeTruthy();

    // Find the toggle button (0DTE GEX)
    const toggleButton = screen.getByText('0DTE GEX');
    
    // Click to hide
    fireEvent.click(toggleButton);
    expect(screen.queryByText('0DTE Gamma Exposure')).toBeNull();

    // Click to show
    fireEvent.click(toggleButton);
    expect(screen.getByText('0DTE Gamma Exposure')).toBeTruthy();
  });
});
