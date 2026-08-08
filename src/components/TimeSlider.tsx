import React, { useState, useEffect, useRef } from 'react';

interface TimeSliderProps {
  timestamps: string[];
  selectedTimestamp: string | null;
  onChange: (timestamp: string | null) => void;
}

export const TimeSlider: React.FC<TimeSliderProps> = ({ timestamps, selectedTimestamp, onChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(timestamps.length - 1);
  const playIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (timestamps.length === 0) return;
    
    if (selectedTimestamp === null) {
      setCurrentIndex(timestamps.length - 1);
    } else {
      const idx = timestamps.findIndex(t => t === selectedTimestamp);
      if (idx !== -1) setCurrentIndex(idx);
    }
  }, [selectedTimestamp, timestamps]);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= timestamps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          const nextIdx = prev + 1;
          onChange(nextIdx === timestamps.length - 1 ? null : timestamps[nextIdx]);
          return nextIdx;
        });
      }, 1000); // 1 second per step
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, timestamps, onChange]);

  if (timestamps.length === 0) return null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setCurrentIndex(val);
    // If at the end, set to null (live)
    if (val === timestamps.length - 1) {
      onChange(null);
    } else {
      onChange(timestamps[val]);
    }
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isLive = currentIndex === timestamps.length - 1;

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      padding: '12px 24px', 
      backgroundColor: '#030a17', 
      borderTop: '1px solid rgba(255,255,255,0.1)',
      color: '#f8fafc',
      gap: '16px'
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#94a3b8' }}>Time</div>
      
      <div style={{ fontSize: '12px', minWidth: '60px' }}>
        {formatTime(timestamps[0])}
      </div>

      <input 
        type="range" 
        min={0} 
        max={timestamps.length - 1} 
        value={currentIndex} 
        onChange={handleSliderChange}
        style={{ flex: 1, cursor: 'pointer' }}
      />
      
      <div style={{ fontSize: '12px', minWidth: '60px', textAlign: 'right' }}>
        {formatTime(timestamps[timestamps.length - 1])}
      </div>

      <div style={{ 
        padding: '4px 8px', 
        borderRadius: '4px', 
        backgroundColor: isLive ? '#2563eb' : 'rgba(255,255,255,0.1)',
        fontSize: '12px',
        fontWeight: 'bold',
        minWidth: '70px',
        textAlign: 'center'
      }}>
        {isLive ? 'LIVE' : formatTime(timestamps[currentIndex])}
      </div>

      <button 
        onClick={() => {
          if (isLive && !isPlaying) {
            setCurrentIndex(0);
            onChange(timestamps[0]);
          }
          setIsPlaying(!isPlaying);
        }}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '40px'
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
    </div>
  );
};
