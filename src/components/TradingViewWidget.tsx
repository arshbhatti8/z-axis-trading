import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { Search, Activity } from 'lucide-react';
import { generateMockGex } from '../mocks/gexMock';
import { GexTable } from './GexTable';

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

const filterGexData = (data: GexData, limit: number, price: number): GexData => {
  if (limit <= 0) return { ...data };
  const centerPrice = price || data.spot_price;
  const allStrikes = [...data.most_positive, ...data.most_negative];
  const uniqueStrikes = Array.from(new Set(allStrikes.map(s => s.strike))).sort((a, b) => a - b);
  
  const below = uniqueStrikes.filter(s => s < centerPrice).sort((a, b) => b - a);
  const above = uniqueStrikes.filter(s => s >= centerPrice).sort((a, b) => a - b);
  
  let takeUp = Math.ceil(limit / 2);
  let takeDown = Math.floor(limit / 2);
  
  if (above.length < takeUp) {
    takeDown += (takeUp - above.length);
    takeUp = above.length;
  } else if (below.length < takeDown) {
    takeUp += (takeDown - below.length);
    takeDown = below.length;
  }
  
  const selectedStrikes = new Set([
    ...above.slice(0, takeUp),
    ...below.slice(0, takeDown)
  ]);
  
  return {
    ...data,
    most_positive: data.most_positive.filter(s => selectedStrikes.has(s.strike)),
    most_negative: data.most_negative.filter(s => selectedStrikes.has(s.strike))
  };
};

export const TradingViewWidget = ({ chartId = 'primary' }: { chartId?: string }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [tickerInput, setTickerInput] = useState('SPY');
  const [activeTicker, setActiveTicker] = useState('SPY');
  const [activeTimeframe, setActiveTimeframe] = useState('1m');
  const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '1D', '1W', '1M'];
  const [hoveredData, setHoveredData] = useState<ChartOverlayProps | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0.0);
  const [isConnected, setIsConnected] = useState(false);
  const [gexConnected, setGexConnected] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [gexData, setGexData] = useState<GexData | null>(null);
  const [gexLimit, setGexLimit] = useState<number>(0);
  const [showGexPanel, setShowGexPanel] = useState(true);
  const [gexPanelWidth, setGexPanelWidth] = useState(300);
  const [gexPanelHeight, setGexPanelHeight] = useState(400);
  const [gexPositions, setGexPositions] = useState<{strike: number, y: number, gex: number, type: string}[]>([]);
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

  const formatGex = (val: number, decimals: number = 1) => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(decimals) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(decimals) + 'M';
    return (val / 1e3).toFixed(decimals) + 'K';
  };

  const dragRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; isMobile: boolean } | null>(null);

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const isMobile = window.innerWidth <= 1024;
    
    dragRef.current = { startX: clientX, startY: clientY, startWidth: gexPanelWidth, startHeight: gexPanelHeight, isMobile };
    
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    
    document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection while dragging
  };

  const onDragMove = (e: MouseEvent | TouchEvent) => {
    if (!dragRef.current) return;
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    if (dragRef.current.isMobile) {
      // For mobile (vertical), we drag up to increase height (since panel is on bottom)
      const deltaY = clientY - dragRef.current.startY;
      const newHeight = Math.max(150, Math.min(800, dragRef.current.startHeight - deltaY));
      setGexPanelHeight(newHeight);
    } else {
      // For desktop (horizontal), we drag left to increase width (since panel is on right)
      const deltaX = clientX - dragRef.current.startX;
      const newWidth = Math.max(200, Math.min(1200, dragRef.current.startWidth - deltaX));
      setGexPanelWidth(newWidth);
    }
  };

  const onDragEnd = () => {
    dragRef.current = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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
      if (wrapperRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: wrapperRef.current.clientWidth,
          height: wrapperRef.current.clientHeight,
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
      width: (wrapperRef.current ? wrapperRef.current.clientWidth : chartContainerRef.current?.clientWidth) || 100,
      height: (wrapperRef.current ? wrapperRef.current.clientHeight : chartContainerRef.current?.clientHeight) || 100,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        tickMarkFormatter: (time: any) => {
          if (typeof time === 'number') {
            const d = new Date(time * 1000);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          return `${time.year}-${time.month}-${time.day}`;
        },
      },
      localization: {
        timeFormatter: (time: any) => {
          if (typeof time === 'number') {
            const d = new Date(time * 1000);
            return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          }
          return `${time.year}-${time.month}-${time.day}`;
        }
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

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // set as an overlay
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

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
      const volumeData = param.seriesData.get(volumeSeriesRef.current) as any;
      if (barData) {
        setHoveredData({
          currentPrice: barData.close,
          open: barData.open,
          high: barData.high,
          low: barData.low,
          volume: volumeData ? Math.round(volumeData.value) : 0
        });
      }
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== wrapperRef.current) return;
      handleResize();
    });

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []); // Initialize chart once

  // Tradier WebSocket connection logic
  useEffect(() => {
    let isCancelled = false;
    let sessionWs: WebSocket | null = null;
    let fallbackInterval: number | null = null;
    
    setIsFallback(false);
    setIsConnected(false);
    setIsLoading(true);
    setGexData(null); // Clear GEX data on ticker change

    const loadHistoryData = async (isInitialLoad = false) => {
      const tradierToken = import.meta.env.VITE_TRADIER_API_KEY;
      try {
        const url = new URL(`http://${window.location.hostname}:8001/api/history/${activeTicker}`);
        url.searchParams.append('interval', activeTimeframe);
        if (tradierToken) {
          url.searchParams.append('tradier_token', tradierToken);
        }
        
        const res = await fetch(url.toString());
        if (isCancelled) return;
        const json = await res.json();
        
        if (json.source === 'yahoo') {
          setIsFallback(true);
        } else {
          setIsFallback(false);
        }
        
        if (json.data && json.data.length > 0) {
          seriesRef.current?.setData(json.data);
          
          const volumeData: any[] = [];

          json.data.forEach((d: any) => {
            const vol = d.volume || 0;
            volumeData.push({ 
              time: d.time, 
              value: vol, 
              color: d.close >= d.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)' 
            });
          });

          volumeSeriesRef.current?.setData(volumeData);

          const lastCandle = json.data[json.data.length - 1];
          setCurrentPrice(lastCandle.close);
          currentCandleRef.current = { ...lastCandle };
          
          // Only auto-scale the viewport on the first load of the ticker, not on polling updates
          if (isInitialLoad) {
            chartRef.current?.timeScale().fitContent();
            chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
          }
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
      await loadHistoryData(true);
      
      if (!tradierToken) {
        console.warn("VITE_TRADIER_API_KEY is not set. Falling back to Yahoo Finance.");
        fallbackInterval = window.setInterval(() => loadHistoryData(false), 60000);
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
        
        if (isCancelled) return;
        if (!sessionRes.ok) throw new Error('Failed to create Tradier session');
        
        const sessionData = await sessionRes.json();
        const sessionId = sessionData.stream.sessionid;

        sessionWs = new WebSocket('wss://ws.tradier.com/v1/markets/events');
        if (isCancelled) {
          sessionWs.close();
          return;
        }
        wsRef.current = sessionWs;

        sessionWs.onopen = () => {
          setIsConnected(true);
          const payload = {
            symbols: [activeTicker],
            sessionid: sessionId,
            linebreak: true
          };
          sessionWs?.send(JSON.stringify(payload));
          // Preserve historical data for the current candle, do not null it out!
          // currentCandleRef is now correctly initialized by loadHistoryData
        };

        sessionWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'trade' && data.symbol === activeTicker) {
              const tradePrice = parseFloat(data.price);
              const tradeSize = parseInt(data.size) || 0;
              const tradeTime = data.date ? Math.floor(data.date / 1000) : Math.floor(Date.now() / 1000);
              const tfSeconds = getTimeframeSeconds(activeTimeframe);
              const bucketTime = tradeTime - (tradeTime % tfSeconds);

              setCurrentPrice(tradePrice);
              
              if (!currentCandleRef.current || currentCandleRef.current.time !== bucketTime) {
                currentCandleRef.current = {
                  time: bucketTime,
                  open: tradePrice,
                  high: tradePrice,
                  low: tradePrice,
                  close: tradePrice,
                  volume: tradeSize
                };
              } else {
                currentCandleRef.current.high = Math.max(currentCandleRef.current.high, tradePrice);
                currentCandleRef.current.low = Math.min(currentCandleRef.current.low, tradePrice);
                currentCandleRef.current.close = tradePrice;
                currentCandleRef.current.volume += tradeSize;
              }

              seriesRef.current?.update(currentCandleRef.current);
              
              volumeSeriesRef.current?.update({ 
                time: bucketTime, 
                value: currentCandleRef.current.volume,
                color: currentCandleRef.current.close >= currentCandleRef.current.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
              });
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
          console.warn("Tradier WS Closed. Falling back.");
          setIsConnected(false);
          setIsFallback(true);
          if (!fallbackInterval) {
            fallbackInterval = window.setInterval(() => loadHistoryData(false), 60000);
          }
        };
      } catch (err) {
        console.error("Tradier WS Connection Error:", err);
        setIsFallback(true);
        fallbackInterval = window.setInterval(loadHistoryData, 60000);
      }
    };

    connectTradier();

    return () => {
      isCancelled = true;
      if (sessionWs) sessionWs.close();
      if (fallbackInterval) window.clearInterval(fallbackInterval);
    };
  }, [activeTicker, activeTimeframe]);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.ticker === activeTicker) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('requestGexRefresh', handler);
    return () => window.removeEventListener('requestGexRefresh', handler);
  }, [activeTicker]);

  const [gexStatus, setGexStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [gexLastUpdated, setGexLastUpdated] = useState<Date | null>(null);

  // GEX Data Connection / Mock Mode
  useEffect(() => {
    setGexStatus('loading');
    if (isMockMode) {
      setGexConnected(true);
      // Mock Mode Interval
      setGexData(generateMockGex(activeTicker, currentPriceRef.current));
      setGexLastUpdated(new Date());
      setGexStatus('success');
      const interval = setInterval(() => {
        setGexData(generateMockGex(activeTicker, currentPriceRef.current));
        setGexLastUpdated(new Date());
      }, 1500); // constantly changing every 1.5s
      return () => {
        setGexConnected(false);
        clearInterval(interval);
      };
    } else {
      // Live GEX WebSocket
      setGexData(null);
      setGexConnected(false);
      let gexWs: WebSocket | null = null;
      let retryTimeout: number | null = null;
      let isCancelled = false;

      const connectGexWs = () => {
        if (isCancelled) return;
        gexWs = new WebSocket(`ws://${window.location.hostname}:8001/ws/gex/${activeTicker}`);
        
        gexWs.onopen = () => {
          if (isCancelled) {
            gexWs?.close();
            return;
          }
          setGexConnected(true);
          setGexStatus('success');
        };
        
        gexWs.onclose = () => {
          if (isCancelled) return;
          setGexConnected(false);
          setGexStatus('error');
          retryTimeout = window.setTimeout(connectGexWs, 5000);
        };
        
        gexWs.onerror = () => {
          if (isCancelled) return;
          setGexConnected(false);
          setGexStatus('error');
        };
        
        gexWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.error) {
              setGexStatus('error');
              return;
            }
            if (data.most_positive && data.most_negative) {
              setGexData(data);
              setGexLastUpdated(new Date());
              setGexStatus('success');
            }
          } catch (e) {
            console.error("Error parsing GEX WS message:", e);
          }
        };
      };

      connectGexWs();

      return () => {
        isCancelled = true;
        if (retryTimeout) clearTimeout(retryTimeout);
        if (gexWs) {
          gexWs.onclose = null;
          gexWs.onerror = null;
          gexWs.close();
        }
        setGexConnected(false);
      };
    }
  }, [activeTicker, isMockMode, refreshKey]);

  // Broadcast GEX Data and Status
  useEffect(() => {
    let filteredGexData = null;
    if (gexData) {
      filteredGexData = filterGexData(gexData, gexLimit, currentPriceRef.current);
    }
    window.dispatchEvent(new CustomEvent('gexDataUpdate', { detail: { chartId, data: filteredGexData, status: gexStatus } }));
  }, [gexData, gexStatus, chartId, gexLimit, currentPrice]);

  // Sync loop for GEX overlays
  useEffect(() => {
    if (!seriesRef.current || !gexData) {
      setGexPositions([]);
      setZeroGammaY(null);
      return;
    }
    let animationFrameId: number;
    let lastPositionsStr = "";
    let lastZeroGammaY: number | null = null;
    
    // Broadcast for the side panel table
    const syncPositions = () => {
      const filteredGexData = filterGexData(gexData, gexLimit, currentPriceRef.current);
      const positions: any[] = [];

      for (const item of filteredGexData.most_positive) {
        const y = seriesRef.current.priceToCoordinate(item.strike);
        if (y !== null) positions.push({ strike: item.strike, y, gex: item.gex, type: 'positive' });
      }
      for (const item of filteredGexData.most_negative) {
        const y = seriesRef.current.priceToCoordinate(item.strike);
        if (y !== null) positions.push({ strike: item.strike, y, gex: item.gex, type: 'negative' });
      }
      
      const newPositionsStr = JSON.stringify(positions);
      if (newPositionsStr !== lastPositionsStr) {
        setGexPositions(positions);
        lastPositionsStr = newPositionsStr;
      }
      
      const zeroY = filteredGexData.zero_gamma ? seriesRef.current.priceToCoordinate(filteredGexData.zero_gamma) : null;
      if (zeroY !== lastZeroGammaY) {
        setZeroGammaY(zeroY);
        lastZeroGammaY = zeroY;
      }
      
      animationFrameId = requestAnimationFrame(syncPositions);
    };
    
    syncPositions();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gexData, gexLimit]);

  return (
    <div className="glass-panel chart-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <div className="chart-header">
        <div className="chart-title" style={{ flex: 1, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#8b5cf6', marginRight: '12px', textTransform: 'uppercase' }}>
            {chartId === 'primary' ? 'Primary Chart' : 'Secondary Chart'}
          </div>
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
            {isMockMode ? 'Simulated GEX levels' : 'Live GEX levels'}
          </button>
          

          <button 
            onClick={() => setShowGexPanel(!showGexPanel)}
            style={{ 
              background: showGexPanel ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)', 
              color: showGexPanel ? '#8b5cf6' : '#94a3b8',
              border: `1px solid ${showGexPanel ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
              padding: '4px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              marginLeft: '8px'
            }}
          >
            0DTE GEX
          </button>
          
          {/* GEX Limit Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
            <span style={{ fontWeight: 'bold', color: '#94a3b8', fontSize: '11px' }}>Strikes:</span>
            <select 
              value={gexLimit} 
              onChange={(e) => setGexLimit(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 4px', outline: 'none', fontSize: '11px', cursor: 'pointer' }}
            >
              <option value={0}>All</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

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

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isFallback ? '#eab308' : (isConnected ? '#10b981' : '#ef4444') }} title={isFallback ? "Yahoo (Fallback)" : "Tradier WS"} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>TRADIER</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: gexConnected ? '#10b981' : '#ef4444' }} title="Massive GEX" />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>GEX</span>
              {gexLastUpdated && (
                <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '4px' }}>
                  ({gexLastUpdated.toLocaleTimeString()})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="price-display">
          <div className="current-price">${currentPrice > 0 ? currentPrice.toFixed(2) : '---'}</div>
        </div>
      </div>
      
      {/* Chart and GEX Overlays Container */}
      <div className="chart-content-row">
        <div ref={wrapperRef} style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0 }}>
          {/* GEX Rectangular Overlays */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '26px', pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
          {gexPositions.map((pos, i) => {
            const isPos = pos.type === 'positive';
            const maxGex = Math.max(
              ...(gexData?.most_positive.map(p => Math.abs(p.gex)) || []),
              ...(gexData?.most_negative.map(p => Math.abs(p.gex)) || [])
            );
            // Responsive maximum width: 40% of chart width (no hard cap)
            const containerWidth = chartContainerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
            const maxWidth = containerWidth * 0.40;
            const minWidth = 80;
            
            // Map 0 -> minWidth, and maxGex -> maxWidth
            const percentage = Math.abs(pos.gex) / (maxGex || 1);
            const width = minWidth + percentage * (maxWidth - minWidth);
            const height = 24; // Fixed height
            
            return (
              <div key={i} style={{
                position: 'absolute',
                left: '20px', // Detached from right edge
                top: pos.y - height / 2, // Centered vertically on strike price coordinate
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: isPos ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                border: `1px solid ${isPos ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 6px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: '4px',
                backdropFilter: 'blur(2px)',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}>
                <span style={{ fontWeight: 'bold', marginRight: '4px' }}>${pos.strike}</span>
                <span>{pos.gex >= 0 ? '+' : ''}{formatGex(pos.gex, 1)}</span>
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
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} 
          />
        </div>

        {showGexPanel && (
          <>
            <div 
              className="gex-resizer"
              onMouseDown={onDragStart}
              onTouchStart={onDragStart}
            />
            <div className="gex-panel-container" style={{ flex: `0 0 ${gexPanelWidth}px`, width: `${gexPanelWidth}px`, height: typeof window !== 'undefined' && window.innerWidth <= 1024 ? `${gexPanelHeight}px` : 'auto', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <h2 style={{ fontSize: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} color="#8b5cf6" />
                  0DTE Gamma Exposure
                </h2>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '16px' }}>
                <GexTable activeCharts={[chartId]} />
              </div>
            </div>
          </>
        )}
      </div>

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

