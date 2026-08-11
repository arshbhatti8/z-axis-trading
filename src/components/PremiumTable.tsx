import { useEffect, useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { createChart, LineSeries, AreaSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export const PremiumTable = ({ globalDate }: { globalDate: string }) => {
  const [activeTicker, setActiveTicker] = useState('SPY');
  const [tickerInput, setTickerInput] = useState('SPY');
  const [legendData, setLegendData] = useState({
    calls: 0,
    puts: 0,
    underlying: 0,
    ticker: 'SPY'
  });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callsSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const putsSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  
  const historyDataRef = useRef<any[]>([]);
  const dataSeriesRef = useRef<{ time: number, call: number, put: number, under: number, vol: number }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  
  const handleTickerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (tickerInput.trim()) {
      setActiveTicker(tickerInput.trim().toUpperCase());
    }
  };

  // Initialize Chart
  useEffect(() => {
    if (chartContainerRef.current && !chartRef.current) {
      const container = chartContainerRef.current;
      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { color: '#030a17' }, 
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { width: 1, color: 'rgba(255, 255, 255, 0.3)', style: 3 },
          horzLine: { width: 1, color: 'rgba(255, 255, 255, 0.3)', style: 3 },
        },
        rightPriceScale: {
          scaleMargins: { top: 0.1, bottom: 0.2 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        leftPriceScale: {
          visible: true,
          scaleMargins: { top: 0.1, bottom: 0.2 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          timeVisible: true,
        },
      });

      const callsSeries = chart.addSeries(LineSeries, {
        color: '#10b981', 
        lineWidth: 2,
        priceScaleId: 'left',
        priceFormat: { type: 'custom', formatter: (price: number) => `$${price.toFixed(0)} M`, minMove: 0.1 },
      });

      const putsSeries = chart.addSeries(LineSeries, {
        color: '#ef4444', 
        lineWidth: 2,
        priceScaleId: 'left',
        priceFormat: { type: 'custom', formatter: (price: number) => `$${price.toFixed(0)} M`, minMove: 0.1 },
      });

      const volumeSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(239, 68, 68, 0.4)',
        bottomColor: 'rgba(239, 68, 68, 0.05)',
        lineColor: '#ef4444',
        lineWidth: 1,
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
        visible: false, 
      });

      chart.subscribeCrosshairMove((param) => {
        if (param.time) {
          const callsData = param.seriesData.get(callsSeries as any) as any;
          const putsData = param.seriesData.get(putsSeries as any) as any;
          if (callsData && putsData) {
            setLegendData(prev => ({
              ...prev,
              calls: callsData.value,
              puts: putsData.value,
            }));
          }
        } else {
           const series = dataSeriesRef.current;
           if (series && series.length > 0) {
             const last = series[series.length - 1];
             setLegendData(prev => ({ ...prev, calls: last.call, puts: last.put, underlying: last.under }));
           }
        }
      });

      callsSeriesRef.current = callsSeries;
      putsSeriesRef.current = putsSeries;
      volumeSeriesRef.current = volumeSeries;
      chartRef.current = chart;

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({ 
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight 
          });
        }
      };
      window.addEventListener('resize', handleResize);
      const observer = new ResizeObserver(handleResize);
      observer.observe(chartContainerRef.current);
    }
  }, []);

  // Fetch Historical Data on Date or Ticker change
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        let url = `http://localhost:8001/api/history/gex/${activeTicker}`;
        if (globalDate) {
          url += `?date=${globalDate}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        
        if (data && Array.isArray(data) && data.length > 0) {
          historyDataRef.current = data;
          const seriesData = data.map((d: any) => {
            const totalCall = d.premium_data ? d.premium_data.reduce((sum: number, item: any) => sum + item.call_premium, 0) / 1_000_000 : 0;
            const totalPut = d.premium_data ? d.premium_data.reduce((sum: number, item: any) => sum + item.put_premium, 0) / 1_000_000 : 0;
            const spot = d.spot_price || 0;
            
            let dataTime = Math.floor(Date.now() / 1000);
            if (d.timestamp) {
              const timeObj = new Date(d.timestamp);
              const tzOffset = timeObj.getTimezoneOffset() * 60;
              dataTime = Math.floor(timeObj.getTime() / 1000) - tzOffset;
            }
            
            return { time: dataTime, call: totalCall, put: totalPut, under: spot, vol: -Math.abs(10000 + (Math.random() * 5000)) };
          });
          
          seriesData.sort((a, b) => a.time - b.time);
          dataSeriesRef.current = seriesData;
          
          if (callsSeriesRef.current) {
            callsSeriesRef.current.setData(seriesData.map(d => ({ time: d.time as Time, value: d.call })));
            putsSeriesRef.current!.setData(seriesData.map(d => ({ time: d.time as Time, value: d.put })));
            volumeSeriesRef.current!.setData(seriesData.map(d => ({ time: d.time as Time, value: d.vol })));
            
            const last = seriesData[seriesData.length - 1];
            setLegendData({
              calls: last.call,
              puts: last.put,
              underlying: last.under,
              ticker: data[0].ticker || activeTicker
            });
          }
        } else {
          historyDataRef.current = [];
          dataSeriesRef.current = [];
          if (callsSeriesRef.current) {
            callsSeriesRef.current.setData([]);
            putsSeriesRef.current!.setData([]);
            volumeSeriesRef.current!.setData([]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch history for premium:", err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 60000);
    return () => clearInterval(interval);
  }, [globalDate, activeTicker]);

  // WebSocket Connection for Live Updates
  useEffect(() => {
    let ws: WebSocket;
    
    const connectWs = () => {
      ws = new WebSocket(`ws://localhost:8001/ws/gex/${activeTicker}`);
      wsRef.current = ws;
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data && data.premium_data) {
          const totalCall = data.premium_data.reduce((sum: number, item: any) => sum + item.call_premium, 0) / 1_000_000;
          const totalPut = data.premium_data.reduce((sum: number, item: any) => sum + item.put_premium, 0) / 1_000_000;
          const spot = data.spot_price || 0; 
          
          let dataTime = Math.floor(Date.now() / 1000);
          if (data.timestamp) {
            const timeObj = new Date(data.timestamp);
            const tzOffset = timeObj.getTimezoneOffset() * 60;
            dataTime = Math.floor(timeObj.getTime() / 1000) - tzOffset;
          }
          
          const series = dataSeriesRef.current;
          setLegendData({
            calls: totalCall,
            puts: totalPut,
            underlying: spot,
            ticker: data.ticker || activeTicker
          });
          
          if (series.length === 0 || series[series.length - 1].time < dataTime) {
            const fakeVol = -Math.abs(10000 + (Math.random() * 5000));
            series.push({ time: dataTime, call: totalCall, put: totalPut, under: spot, vol: fakeVol });
            
            if (callsSeriesRef.current) {
              callsSeriesRef.current.update({ time: dataTime as Time, value: totalCall });
              putsSeriesRef.current!.update({ time: dataTime as Time, value: totalPut });
              volumeSeriesRef.current!.update({ time: dataTime as Time, value: fakeVol });
            }
          }
        }
      };
    };
    
    connectWs();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [activeTicker]);

  // Handle cross-widget time scrubbing sync
  useEffect(() => {
    const handleHistoricalUpdate = (e: any) => {
      const { data } = e.detail;
      if (data && data.timestamp && callsSeriesRef.current) {
        const timeObj = new Date(data.timestamp);
        // We find the matching historical point for OUR active ticker
        const targetTimeStr = data.timestamp;
        
        // Add timezone offset to match lightweight-charts UTC expectation
        const tzOffset = timeObj.getTimezoneOffset() * 60;
        const tsTime = (Math.floor(timeObj.getTime() / 1000) - tzOffset) as Time;
        
        (callsSeriesRef.current as any).setMarkers([{
          time: tsTime,
          position: 'aboveBar',
          color: '#eab308',
          shape: 'arrowDown',
          text: 'Selected Time'
        }]);
        
        // Find matching data in our history
        const matchingData = historyDataRef.current.find(d => d.timestamp === targetTimeStr);
        if (matchingData && matchingData.premium_data) {
          const totalCall = matchingData.premium_data.reduce((sum: number, item: any) => sum + item.call_premium, 0) / 1_000_000;
          const totalPut = matchingData.premium_data.reduce((sum: number, item: any) => sum + item.put_premium, 0) / 1_000_000;
          
          setLegendData(prev => ({
            ...prev,
            calls: totalCall,
            puts: totalPut,
          }));
        }
      }
    };
    
    const handleResumeLive = (_e: any) => {
      if (callsSeriesRef.current) {
        (callsSeriesRef.current as any).setMarkers([]);
      }
    };

    window.addEventListener('historicalGexUpdate', handleHistoricalUpdate);
    window.addEventListener('resumeLiveGex', handleResumeLive);
    
    return () => {
      window.removeEventListener('historicalGexUpdate', handleHistoricalUpdate);
      window.removeEventListener('resumeLiveGex', handleResumeLive);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#030a17', color: '#f8fafc', padding: '0px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', zIndex: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Net Drift (Premium)</div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>Calls ({legendData.calls < 0 ? '-' : ''}${Math.abs(legendData.calls).toFixed(2)} M)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span>Puts ({legendData.puts < 0 ? '-' : ''}${Math.abs(legendData.puts).toFixed(2)} M)</span>
            </div>
          </div>
        </div>
        
        {/* Ticker Input */}
        <form onSubmit={handleTickerSubmit} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
          <input 
            type="text" 
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="Ticker"
            style={{ 
              background: 'transparent', border: 'none', color: '#fff', width: '60px', 
              padding: '6px 8px', outline: 'none', fontWeight: 'bold', textTransform: 'uppercase'
            }}
          />
        </form>
      </div>

      {/* Y-Axis Labels Overlay */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px', fontSize: '10px', color: '#94a3b8', transform: 'translateY(10px)', zIndex: 10 }}>
         <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'left center', position: 'absolute', left: 5, top: '40%' }}>Premium ($)</div>
         <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'left center', position: 'absolute', left: 5, bottom: '15%' }}>Volume</div>
      </div>

      {/* Chart Container */}
      <div ref={chartContainerRef} style={{ flex: 1, position: 'relative', width: '100%', minHeight: '0' }} />
    </div>
  );
};
