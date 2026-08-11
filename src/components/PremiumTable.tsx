import { useEffect, useState, useRef } from 'react';
import { createChart, LineSeries, AreaSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

export const PremiumTable = ({ activeCharts = ['primary'] }: { activeCharts?: string[] }) => {
  const chartContainersRef = useRef<Record<string, HTMLDivElement | null>>({});
  const chartsRef = useRef<Record<string, IChartApi>>({});
  const callsSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const putsSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const volumeSeriesRef = useRef<Record<string, ISeriesApi<"Area">>>({});
  const dataSeriesRef = useRef<Record<string, { time: number, call: number, put: number, under: number, vol: number }[]>>({});

  const [legendData, setLegendData] = useState({
    calls: 0,
    puts: 0,
    underlying: 0,
    ticker: 'Loading...'
  });

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const { chartId, data, status } = e.detail;
      
      if (status === 'success' && data && data.premium_data) {
        // Aggregate all premium across strikes
        const totalCall = data.premium_data.reduce((sum: number, item: any) => sum + item.call_premium, 0) / 1_000_000;
        const totalPut = data.premium_data.reduce((sum: number, item: any) => sum + item.put_premium, 0) / 1_000_000;
        const spot = data.spot_price || 0; 
        
        let dataTime = Math.floor(Date.now() / 1000);
        if (data.timestamp) {
          const timeObj = new Date(data.timestamp);
          const tzOffset = timeObj.getTimezoneOffset() * 60;
          dataTime = Math.floor(timeObj.getTime() / 1000) - tzOffset;
        }
        
        // Ensure strictly increasing time for live updates
        if (!dataSeriesRef.current[chartId]) {
          dataSeriesRef.current[chartId] = [];
        }
        
        const series = dataSeriesRef.current[chartId];
        
        setLegendData({
          calls: totalCall,
          puts: totalPut,
          underlying: spot,
          ticker: data.ticker || 'SPY'
        });
        
        // Ensure strictly increasing time for live updates
        if (series.length === 0 || series[series.length - 1].time < dataTime) {
          const fakeVol = -Math.abs(10000 + (Math.random() * 5000));
          series.push({ time: dataTime, call: totalCall, put: totalPut, under: spot, vol: fakeVol });
          
          if (callsSeriesRef.current[chartId]) {
            callsSeriesRef.current[chartId].update({ time: dataTime as Time, value: totalCall });
            putsSeriesRef.current[chartId].update({ time: dataTime as Time, value: totalPut });
            volumeSeriesRef.current[chartId].update({ time: dataTime as Time, value: fakeVol });
          }
        }
      }
    };
    
    const handleHistoryUpdate = (e: any) => {
      const { chartId, historyData } = e.detail;
      if (historyData && Array.isArray(historyData) && historyData.length > 0) {
        const seriesData = historyData.map((d: any) => {
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
        dataSeriesRef.current[chartId] = seriesData;
        
        if (callsSeriesRef.current[chartId]) {
          callsSeriesRef.current[chartId].setData(seriesData.map(d => ({ time: d.time as Time, value: d.call })));
          putsSeriesRef.current[chartId].setData(seriesData.map(d => ({ time: d.time as Time, value: d.put })));
          volumeSeriesRef.current[chartId].setData(seriesData.map(d => ({ time: d.time as Time, value: d.vol })));
          
          const last = seriesData[seriesData.length - 1];
          setLegendData({
            calls: last.call,
            puts: last.put,
            underlying: last.under,
            ticker: historyData[0].ticker || 'SPY'
          });
        }
      }
    };
    
    const handleHistoricalUpdate = (e: any) => {
      const { chartId, data } = e.detail;
      if (data && data.timestamp && callsSeriesRef.current[chartId]) {
        const timeObj = new Date(data.timestamp);
        // Add timezone offset to match lightweight-charts UTC expectation
        const tzOffset = timeObj.getTimezoneOffset() * 60;
        const tsTime = (Math.floor(timeObj.getTime() / 1000) - tzOffset) as Time;
        
        (callsSeriesRef.current[chartId] as any).setMarkers([{
          time: tsTime,
          position: 'aboveBar',
          color: '#eab308',
          shape: 'arrowDown',
          text: 'Selected Time'
        }]);
        
        if (data.premium_data) {
          const totalCall = data.premium_data.reduce((sum: number, item: any) => sum + item.call_premium, 0) / 1_000_000;
          const totalPut = data.premium_data.reduce((sum: number, item: any) => sum + item.put_premium, 0) / 1_000_000;
          const spot = data.spot_price || 0;
          
          setLegendData({
            calls: totalCall,
            puts: totalPut,
            underlying: spot,
            ticker: data.ticker || 'SPY'
          });
        }
      }
    };
    
    const handleResumeLive = (e: any) => {
      const { chartId } = e.detail;
      if (callsSeriesRef.current[chartId]) {
        (callsSeriesRef.current[chartId] as any).setMarkers([]);
      }
    };

    window.addEventListener('gexDataUpdate', handleUpdate);
    window.addEventListener('gexHistoryUpdate', handleHistoryUpdate);
    window.addEventListener('historicalGexUpdate', handleHistoricalUpdate);
    window.addEventListener('resumeLiveGex', handleResumeLive);
    
    // Request current data immediately upon mounting
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('requestCurrentGexData'));
    }, 100);
    
    return () => {
      window.removeEventListener('gexDataUpdate', handleUpdate);
      window.removeEventListener('gexHistoryUpdate', handleHistoryUpdate);
      window.removeEventListener('historicalGexUpdate', handleHistoricalUpdate);
      window.removeEventListener('resumeLiveGex', handleResumeLive);
    };
  }, []);

  useEffect(() => {
    activeCharts.forEach(chartId => {
      if (chartContainersRef.current[chartId] && !chartsRef.current[chartId]) {
        const container = chartContainersRef.current[chartId]!;
        
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

        // Add crosshair sync
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
             // Reset to last point
             const series = dataSeriesRef.current[chartId];
             if (series && series.length > 0) {
               const last = series[series.length - 1];
               setLegendData(prev => ({ ...prev, calls: last.call, puts: last.put, underlying: last.under }));
             }
          }
        });

        callsSeriesRef.current[chartId] = callsSeries;
        putsSeriesRef.current[chartId] = putsSeries;
        volumeSeriesRef.current[chartId] = volumeSeries;
        chartsRef.current[chartId] = chart;

        // Restore existing data
        const existingData = dataSeriesRef.current[chartId] || [];
        if (existingData.length > 0) {
          callsSeries.setData(existingData.map(d => ({ time: d.time as Time, value: d.call })));
          putsSeries.setData(existingData.map(d => ({ time: d.time as Time, value: d.put })));
          volumeSeries.setData(existingData.map(d => ({ time: d.time as Time, value: d.vol })));
        }

        const handleResize = () => {
          if (chartContainersRef.current[chartId]) {
            chart.applyOptions({ 
              width: chartContainersRef.current[chartId]!.clientWidth,
              height: chartContainersRef.current[chartId]!.clientHeight 
            });
          }
        };
        window.addEventListener('resize', handleResize);
        const observer = new ResizeObserver(handleResize);
        observer.observe(chartContainersRef.current[chartId]!);
      }
    });

    return () => {};
  }, [activeCharts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#030a17', color: '#f8fafc', padding: '16px' }}>
      {activeCharts.map(chartId => (
        <div key={chartId} style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
          
          {/* Header & Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px', zIndex: 10 }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Net Drift (Premium) - {legendData.ticker}</div>
            
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

          {/* Y-Axis Labels Overlay */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 40px', fontSize: '10px', color: '#94a3b8', transform: 'translateY(10px)', zIndex: 10 }}>
             <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'left center', position: 'absolute', left: 25, top: '40%' }}>Premium ($)</div>
             <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'left center', position: 'absolute', left: 25, bottom: '15%' }}>Volume</div>
          </div>

          {/* Chart Container */}
          <div 
            ref={el => { chartContainersRef.current[chartId] = el; }} 
            style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }} 
          />
        </div>
      ))}
    </div>
  );
};
