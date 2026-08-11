import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PremiumTable } from './PremiumTable';

describe('PremiumTable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<PremiumTable globalDate="2026-08-11" />);
    expect(screen.getByText(/Awaiting Premium data for primary/i)).toBeDefined();
  });

  it('renders correctly when data is provided via event', async () => {
    render(<PremiumTable globalDate="2026-08-11" />);
    
    await act(async () => {
      const event = new CustomEvent('gexDataUpdate', {
        detail: {
          chartId: 'primary',
          data: {
            ticker: 'SPY',
            premium_data: [
              { strike: 500, call_premium: 10000000, put_premium: 5000000 },
              { strike: 510, call_premium: 2000000, put_premium: 20000000 },
            ]
          }
        }
      });
      window.dispatchEvent(event);
    });

    expect(screen.getByText(/Strike Premium \(SPY\)/i)).toBeDefined();
    expect(screen.getByText('$500')).toBeDefined();
    // 10000000 / 1e6 = 10.00M
    expect(screen.getByText('$10.00M')).toBeDefined();
    expect(screen.getByText('$5.00M')).toBeDefined();
  });
});
