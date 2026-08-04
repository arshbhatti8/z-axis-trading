export function generateCandlestickData(count = 100) {
  const data = [];
  let time = Math.floor(Date.now() / 1000) - count * 86400; // Start back in time
  let lastClose = 150;

  for (let i = 0; i < count; i++) {
    const volatility = 2;
    const open = lastClose + (Math.random() - 0.5) * volatility;
    const high = open + Math.random() * volatility;
    const low = open - Math.random() * volatility;
    const close = low + Math.random() * (high - low);
    
    data.push({
      time: time as any, 
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
    
    lastClose = close;
    time += 86400; // Next day
  }
  return data;
}

export function generateLineData(count = 100) {
  const data = [];
  let time = Math.floor(Date.now() / 1000) - count * 86400;
  let value = 50;

  for (let i = 0; i < count; i++) {
    value += (Math.random() - 0.5) * 5;
    data.push({
      time: time as any,
      value: Number(value.toFixed(2)),
    });
    time += 86400;
  }
  return data;
}
