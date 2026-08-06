import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnomalousTrades } from './AnomalousTrades';

describe('AnomalousTrades Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders awaiting state initially', () => {
    render(<AnomalousTrades defaultTicker="SPY" />);
    expect(screen.getByText(/Awaiting anomalous prints/i)).toBeDefined();
  });

  // Since we cannot easily mock WebSocket in jsdom without setup, we will just test the UI elements
  it('renders the ticker input', () => {
    render(<AnomalousTrades defaultTicker="SPY" />);
    expect(screen.getByPlaceholderText('Ticker...')).toBeDefined();
    expect(screen.getByText('Anomalous Trades')).toBeDefined();
  });
});
