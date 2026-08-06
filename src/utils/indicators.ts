export function calculateSMA(data: any[], period: number) {
  const result = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) {
      sum -= data[i - period].close;
      result.push({ time: data[i].time, value: sum / period });
    } else if (i === period - 1) {
      result.push({ time: data[i].time, value: sum / period });
    }
  }
  return result;
}

export function calculateEMA(data: any[], period: number) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = data[0]?.close || 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push({ time: data[i].time, value: ema });
      continue;
    }
    ema = (data[i].close - ema) * k + ema;
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

export function calculateVWAP(data: any[]) {
  const result = [];
  let cumulativeVolume = 0;
  let cumulativeVP = 0;
  for (const d of data) {
    const vol = d.volume || 0;
    const typicalPrice = (d.high + d.low + d.close) / 3;
    cumulativeVolume += vol;
    cumulativeVP += vol * typicalPrice;
    const vwap = cumulativeVolume > 0 ? cumulativeVP / cumulativeVolume : d.close;
    result.push({ time: d.time, value: vwap });
  }
  return result;
}
