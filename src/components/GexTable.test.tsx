import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GexTable } from './GexTable';

describe('GexTable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when no data is available', () => {
    render(<GexTable activeCharts={['primary']} />);
    expect(screen.getByText(/Awaiting GEX data for primary/i)).toBeDefined();
  });

  it('renders correctly when data is provided via event', async () => {
    render(<GexTable activeCharts={['primary']} />);
    
    // Dispatch custom event
    await act(async () => {
      const event = new CustomEvent('gexDataUpdate', {
        detail: {
          chartId: 'primary',
          data: {
            ticker: 'SPY',
            total_gex: 10000000,
            zero_gamma: 500,
            most_positive: [
              { strike: 510, gex: 5000000 }
            ],
            most_negative: [
              { strike: 490, gex: -5000000 }
            ]
          }
        }
      });
      window.dispatchEvent(event);
    });

    // Check if SPY is rendered
    expect(screen.getByText(/Total 0DTE GEX \(SPY\)/i)).toBeDefined();
    
    // Verify formatting in Millions (10,000,000 / 1e6 = 10.00M)
    expect(screen.getByText('+10.00M')).toBeDefined();
    
    // Verify Zero Gamma
    expect(screen.getByText('Zero Gamma: $500.00')).toBeDefined();
    
    // Check if strikes are present
    expect(screen.getByText('$510')).toBeDefined();
    expect(screen.getByText('$490')).toBeDefined();
  });

  it('supports multiple active charts', async () => {
    render(<GexTable activeCharts={['primary', 'secondary']} />);
    
    await act(async () => {
      window.dispatchEvent(new CustomEvent('gexDataUpdate', {
        detail: {
          chartId: 'primary',
          data: {
            ticker: 'SPY',
            total_gex: 10000000,
            most_positive: [],
            most_negative: []
          }
        }
      }));
      window.dispatchEvent(new CustomEvent('gexDataUpdate', {
        detail: {
          chartId: 'secondary',
          data: {
            ticker: 'QQQ',
            total_gex: -5000000,
            most_positive: [],
            most_negative: []
          }
        }
      }));
    });

    expect(screen.getByText(/Total 0DTE GEX \(SPY\)/i)).toBeDefined();
    expect(screen.getByText(/Total 0DTE GEX \(QQQ\)/i)).toBeDefined();
  });

  it('supports sorting by GEX Size', async () => {
    render(<GexTable activeCharts={['primary']} />);
    
    await act(async () => {
      window.dispatchEvent(new CustomEvent('gexDataUpdate', {
        detail: {
          chartId: 'primary',
          data: {
            ticker: 'SPY',
            total_gex: 0,
            most_positive: [
              { strike: 510, gex: 2000000 }
            ],
            most_negative: [
              { strike: 490, gex: -5000000 }
            ]
          }
        }
      }));
    });

    // By default, sorting is by strike (descending)
    let rows = screen.getAllByRole('row');
    // headers + 2 data rows
    expect(rows[1].textContent).toContain('$510');
    expect(rows[2].textContent).toContain('$490');

    // Change sort to GEX
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'gex' } });

    rows = screen.getAllByRole('row');
    // GEX descending absolute value (5000000 > 2000000)
    expect(rows[1].textContent).toContain('$490'); // -5.00M
    expect(rows[2].textContent).toContain('$510'); // +2.00M
  });
});
