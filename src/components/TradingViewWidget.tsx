import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { Search } from 'lucide-react';
import { generateMockGex } from '../mocks/gexMock';

interface ChartOverlayProps {
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface GexItem {
  strike: number;
  gex: number;
}

interface GexData {
  ticker: string;
  spot_price: number;
  total_gex: number;
  zero_gamma?: number;
  most_negative: GexItem[];
  most_positive: GexItem[];
}

export const TradingViewWidget = ({ chartId = 'primary' }: { chartId?: string }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [tickerInput, setTickerInput] = useState('SPY');
  const [activeTicker, setActiveTicker] = useState('SPY');
  const [activeTimeframe, setActiveTimeframe] = useState('1m');
  const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '1D', '1W', '1M'];
  const [hoveredData, setHoveredData] = useState<ChartOverlayProps | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0.0);
  const [isConnected, setIsConnected] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [gexData, setGexData] = useState<GexData | null>(null);
  const [gexPositions, setGexPositions] = useState<{strike: number, topY: number, bottomY: number, gex: number, type: string}[]>([]);
  const [zeroGammaY, setZeroGammaY] = useState<number | null>(null);

  // Keep track of the current candle for real-time updates
  const currentCandleRef = useRef<any>(null);
  const currentPriceRef = useRef(0.0);

  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  const handleTickerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (tickerInput.trim()) {
      setActiveTicker(tickerInput.trim().toUpperCase());
    }
  };

  const getTimeframeSeconds = (tf: string) => {
    switch(tf) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '30m': return 1800;
      case '1h': return 3600;
      case '1D': return 86400;
      case '1W': return 604800;
      case '1M': return 2592000;
      default: return 60;
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      crosshair: {
        vertLine: {
          color: '#3b82f6',
          width: 1,
          style: 1,
          labelBackgroundColor: '#3b82f6',
        },
        horzLine: {
          color: '#3b82f6',
          width: 1,
          style: 1,
          labelBackgroundColor: '#3b82f6',
        },
      },
    });
    
    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = candlestickSeries;

    chart.subscribeCrosshairMove((param: any) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        setHoveredData(null);
        return;
      }

      const barData = param.seriesData.get(candlestickSeries) as any;
      if (barData) {
        setHoveredData({
          currentPrice: barData.close,
          open: barData.open,
          high: barData.high,
          low: barData.low,
          volume: barData.volume || 0
        });
      }
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      handleResize();
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []); // Initialize chart once

  // Tradier WebSocket connection logic
  useEffect(() => {
    let sessionWs: WebSocket | null = null;
    let fallbackInterval: number | null = null;
    
    setIsFallback(false);
    setIsConnected(false);
    setIsLoading(true);
    setGexData(null); // Clear GEX data on ticker change

    const loadHistoryData = async () => {
      const tradierToken = import.meta.env.VITE_TRADIER_API_KEY;
      try {
        const url = new URL(`http://127.0.0.1:8000/api/history/${activeTicker}`);
        url.searchParams.append('interval', activeTimeframe);
        if (tradierToken) {
          url.searchParams.append('tradier_token', tradierToken);
        }
        
        const res = await fetch(url.toString());
        const json = await res.json();
        
        if (json.source === 'yahoo') {
          setIsFallback(true);
        } else {
          setIsFallback(false);
        }
        
        if (json.data && json.data.length > 0) {
          seriesRef.current?.setData(json.data);
          const lastCandle = json.data[json.data.length - 1];
          setCurrentPrice(lastCandle.close);
          
          // Bug 9: Autoscale the viewport to fit the new ticker's price level
          chartRef.current?.timeScale().fitContent();
          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
        }
      } catch (e) {
        console.error("History data fetch failed:", e);
      } finally {
        setIsLoading(false);
      }
    };

    const connectTradier = async () => {
      const tradierToken = import.meta.env.VITE_TRADIER_API_KEY;
      
      // Load historical data first before opening WS
      await loadHistoryData();
      
      if (!tradierToken) {
        console.warn("VITE_TRADIER_API_KEY is not set. Falling back to Yahoo Finance.");
        fallbackInterval = window.setInterval(loadHistoryData, 60000);
        return;
      }

      try {
        const sessionRes = await fetch('https://api.tradier.com/v1/markets/events/session', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tradierToken}`,
            'Accept': 'application/json'
          }
        });
        
        if (!sessionRes.ok) throw new Error('Failed to create Tradier session');
        
        const sessionData = await sessionRes.json();
        const sessionId = sessionData.stream.sessionid;

        sessionWs = new WebSocket('wss://ws.tradier.com/v1/markets/events');
        wsRef.current = sessionWs;

        sessionWs.onopen = () => {
          setIsConnected(true);
          const payload = {
            commands: {
              command: "subscribe",
              sessionid: sessionId,
              symbols: [activeTicker],
              lineFilter: false
            }
          };
          sessionWs?.send(JSON.stringify(payload));
          
          seriesRef.current?.setData([]);
          currentCandleRef.current = null;
        };

        sessionWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'trade' && data.symbol === activeTicker) {
              const tradePrice = parseFloat(data.price);
              const tradeSize = parseInt(data.size) || 0;
              const tradeTime = data.date ? Math.floor(data.date / 1000) : Math.floor(Date.now() / 1000);
              const tfSeconds = getTimeframeSeconds(activeTimeframe);
              const candleTime = tradeTime - (tradeTime % tfSeconds);

              setCurrentPrice(tradePrice);
              let candle = currentCandleRef.current;
              
              if (!candle || candle.time !== candleTime) {
                candle = { time: candleTime, open: tradePrice, high: tradePrice, low: tradePrice, close: tradePrice, volume: tradeSize };
              } else {
                candle.high = Math.max(candle.high, tradePrice);
                candle.low = Math.min(candle.low, tradePrice);
                candle.close = tradePrice;
                candle.volume += tradeSize;
              }
              
              currentCandleRef.current = candle;
              seriesRef.current?.update(candle);
            }
          } catch (e) {
            console.error("Error parsing WS message:", e);
          }
        };

        sessionWs.onerror = () => {
          console.warn("Tradier WS Error. Falling back.");
          setIsFallback(true);
          fallbackInterval = window.setInterval(loadHistoryData, 60000);
        };
        
        sessionWs.onclose = () => {
          console.warn("Tradier WS Closed.");
          setIsConnected(false);
        };
      } catch (err) {
        console.error("Tradier WS Connection Error:", err);
        setIsFallback(true);
        fallbackInterval = window.setInterval(loadHistoryData, 60000);
      }
    };

    connectTradier();

    return () => {
      if (sessionWs) sessionWs.close();
      if (fallbackInterval) window.clearInterval(fallbackInterval);
    };
  }, [activeTicker, activeTimeframe]);

  // GEX Data Connection / Mock Mode
  useEffect(() => {
    if (isMockMode) {
      // Mock Mode Interval
      setGexData(generateMockGex(activeTicker, currentPriceRef.current));
      const interval = setInterval(() => {
        setGexData(generateMockGex(activeTicker, currentPriceRef.current));
      }, 1500); // constantly changing every 1.5s
      return () => clearInterval(interval);
    } else {
      // Live GEX WebSocket
      const gexWs = new WebSocket(`ws://127.0.0.1:8000/ws/gex/${activeTicker}`);
      gexWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.most_positive && data.most_negative) {
            setGexData(data);
          }
        } catch (e) {
          console.error("Error parsing GEX WS message:", e);
        }
      };
      return () => gexWs.close();
    }
  }, [activeTicker, isMockMode]);

  // Sync loop for GEX overlays
  useEffect(() => {
    if (!seriesRef.current || !gexData) return;
    let animationFrameId: number;
    
    // Broadcast for the side panel table
    window.dispatchEvent(new CustomEvent('gexDataUpdate', { detail: { chartId, data: gexData } }));

    const syncPositions = () => {
      const positions = [];
      const strikes = [...gexData.most_positive, ...gexData.most_negative].map(p => p.strike).sort((a,b) => a-b);
      let minGap = 1;
      if (strikes.length > 1) {
        const gaps = [];
        for (let i = 1; i < strikes.length; i++) {
          const gap = strikes[i] - strikes[i-1];
          if (gap > 0) gaps.push(gap);
        }
        if (gaps.length > 0) {
          minGap = Math.min(...gaps);
        }
      }

      for (const item of gexData.most_positive) {
        const topY = seriesRef.current.priceToCoordinate(item.strike + minGap/2);
        const bottomY = seriesRef.current.priceToCoordinate(item.strike - minGap/2);
        if (topY !== null && bottomY !== null) positions.push({ strike: item.strike, topY, bottomY, gex: item.gex, type: 'positive' });
      }
      for (const item of gexData.most_negative) {
        const topY = seriesRef.current.priceToCoordinate(item.strike + minGap/2);
        const bottomY = seriesRef.current.priceToCoordinate(item.strike - minGap/2);
        if (topY !== null && bottomY !== null) positions.push({ strike: item.strike, topY, bottomY, gex: item.gex, type: 'negative' });
      }
      setGexPositions(positions);
      if (gexData.zero_gamma) {
        setZeroGammaY(seriesRef.current.priceToCoordinate(gexData.zero_gamma));
      } else {
        setZeroGammaY(null);
      }
      animationFrameId = requestAnimationFrame(syncPositions);
    };
    
    syncPositions();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gexData]);

  return (
    <div className="glass-panel chart-section" style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0, minWidth: 0 }}>
      <div className="chart-header">
        <div className="chart-title" style={{ flex: 1 }}>
          <form onSubmit={handleTickerSubmit} className="ticker-search-form" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Enter ticker..."
              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100px', fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase' }}
            />
          </form>
          <button 
            onClick={() => setIsMockMode(!isMockMode)}
            style={{ 
              background: isMockMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', 
              color: isMockMode ? '#10b981' : '#94a3b8',
              border: `1px solid ${isMockMode ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
              padding: '4px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              marginLeft: '8px'
            }}
          >
            {isMockMode ? 'MOCK ON' : 'MOCK OFF'}
          </button>
          
          {/* Timeframe Selector */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '12px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '6px' }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                style={{
                  background: activeTimeframe === tf ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: activeTimeframe === tf ? '#fff' : '#94a3b8',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: isFallback ? '#eab308' : (isConnected ? '#10b981' : '#ef4444'), marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isFallback ? '#eab308' : (isConnected ? '#10b981' : '#ef4444') }} />
            {isFallback ? 'YAHOO (FALLBACK)' : (isConnected ? 'LIVE' : 'DISCONNECTED')}
          </div>
        </div>
        <div className="price-display">
          <div className="current-price">${currentPrice > 0 ? currentPrice.toFixed(2) : '---'}</div>
        </div>
      </div>
      
      {/* GEX Rectangular Overlays */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
        {gexPositions.map((pos, i) => {
          const maxGex = Math.max(
            ...(gexData?.most_positive.map(p => Math.abs(p.gex)) || []),
            ...(gexData?.most_negative.map(p => Math.abs(p.gex)) || [])
          );
          const containerWidth = chartContainerRef.current?.clientWidth || 800;
          const maxWidth = containerWidth * 0.70;
          const width = Math.max(30, (Math.abs(pos.gex) / (maxGex || 1)) * maxWidth);
          const isPos = pos.type === 'positive';
          
          const height = Math.max(1, Math.abs(pos.bottomY - pos.topY));
          
          return (
            <div key={i} style={{
              position: 'absolute',
              right: '56px', // Right edge of chart (offset by price scale width)
              top: Math.min(pos.topY, pos.bottomY),
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: isPos ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
              border: `1px solid ${isPos ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`,
              borderRight: 'none',
              display: 'flex',
              alignItems: 'center',
              padding: '0 6px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.8)',
              borderRadius: '4px 0 0 4px',
              backdropFilter: 'blur(2px)'
            }}>
              <span style={{ fontWeight: 'bold', marginRight: '4px' }}>${pos.strike}</span>
              <span>{(pos.gex / 1e6).toFixed(1)}M</span>
            </div>
          );
        })}

        {/* Zero Gamma Level Line */}
        {zeroGammaY !== null && gexData?.zero_gamma && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: '56px',
            top: zeroGammaY,
            height: '1px',
            borderTop: '2px dashed #eab308',
            opacity: 0.8
          }}>
            <div style={{
              position: 'absolute',
              left: '10px',
              top: '-24px',
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid #eab308',
              color: '#eab308',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              pointerEvents: 'auto'
            }}>
              Zero Gamma: ${gexData.zero_gamma.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div 
        ref={chartContainerRef} 
        style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0 }} 
      />

      {hoveredData && (
        <div className="chart-overlay">
          <div className="overlay-item">
            <span className="overlay-label">O</span>
            <span className="overlay-value">${hoveredData.open.toFixed(2)}</span>
          </div>
          <div className="overlay-item">
            <span className="overlay-label">H</span>
            <span className="overlay-value">${hoveredData.high.toFixed(2)}</span>
          </div>
          <div className="overlay-item">
            <span className="overlay-label">L</span>
            <span className="overlay-value">${hoveredData.low.toFixed(2)}</span>
          </div>
          <div className="overlay-item">
            <span className="overlay-label">C</span>
            <span className="overlay-value">${hoveredData.currentPrice.toFixed(2)}</span>
          </div>
          <div className="overlay-item" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="overlay-label">Vol</span>
            <span className="overlay-value">{hoveredData.volume.toLocaleString()}</span>
          </div>
        </div>
      )}


      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      )}
    </div>
  );
};

