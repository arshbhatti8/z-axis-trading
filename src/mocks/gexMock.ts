export const generateMockGex = (ticker: string, currentPrice: number) => {
  // If price is 0 (not loaded yet), default to a sensible number like 450
  const price = currentPrice > 0 ? currentPrice : 450;
  
  // Round to nearest integer for base strike
  const baseStrike = Math.round(price);
  
  const most_positive = [];
  const most_negative = [];
  let total_gex = 0;

  // Use current time to create a smooth continuous sine wave effect
  const time = Date.now() / 2500;

  // Generate 5 positive and 5 negative strikes around the current price
  for (let i = 1; i <= 5; i++) {
    // Standard 1% move GEX values for SPY are typically in the billions
    const baseMag = 2_000_000_000 - (i * 200_000_000);

    const posStrike = baseStrike + (i * 2);
    const posWave = Math.sin(time + i) * 0.4 + 1.0;
    const posGex = baseMag * posWave;
    most_positive.push({ strike: posStrike, gex: posGex });
    total_gex += posGex;

    const negStrike = baseStrike - (i * 2);
    const negWave = Math.sin(time + i + Math.PI) * 0.4 + 1.0;
    const negGex = -(baseMag * negWave);
    most_negative.push({ strike: negStrike, gex: negGex });
    total_gex += negGex;
  }

  // Also add one huge strike at the base
  const centerWave = Math.sin(time) * 0.4 + 1.0;
  const centerMag = 3_000_000_000 * centerWave;
  
  const centerGex = Math.sin(time / 3) > 0 ? centerMag : -centerMag;
  
  if (centerGex > 0) {
    most_positive.push({ strike: baseStrike, gex: centerGex });
  } else {
    most_negative.push({ strike: baseStrike, gex: centerGex });
  }
  total_gex += centerGex;

  // Simulate a Zero Gamma level dynamically fluctuating just below the spot price
  const zero_gamma = price - 5 + (Math.sin(time) * 2);

  return {
    ticker,
    spot_price: price,
    total_gex,
    zero_gamma,
    most_positive: most_positive.sort((a, b) => b.gex - a.gex),
    most_negative: most_negative.sort((a, b) => a.gex - b.gex),
  };
};
