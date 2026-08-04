export const generateMockGex = (ticker: string, currentPrice: number) => {
  // If price is 0 (not loaded yet), default to a sensible number like 450
  const price = currentPrice > 0 ? currentPrice : 450;
  
  // Round to nearest integer for base strike
  const baseStrike = Math.round(price);
  
  const most_positive = [];
  const most_negative = [];
  let total_gex = 0;

  // Use current time to create a smooth continuous sine wave effect
  // Dividing by 2500 makes a full oscillation cycle take a few seconds
  const time = Date.now() / 2500;

  // Generate 5 positive and 5 negative strikes around the current price
  for (let i = 1; i <= 5; i++) {
    // The base magnitude decays linearly the further we get from the spot price
    const baseMag = 8_000_000 - (i * 1_000_000);

    const posStrike = baseStrike + (i * 2);
    // Smooth oscillation multiplier between 0.6 and 1.4 based on time and index offset
    const posWave = Math.sin(time + i) * 0.4 + 1.0;
    const posGex = baseMag * posWave;
    most_positive.push({ strike: posStrike, gex: posGex });
    total_gex += posGex;

    const negStrike = baseStrike - (i * 2);
    // Offset the phase by Pi for the negative strikes so they breathe inversely
    const negWave = Math.sin(time + i + Math.PI) * 0.4 + 1.0;
    const negGex = -(baseMag * negWave);
    most_negative.push({ strike: negStrike, gex: negGex });
    total_gex += negGex;
  }

  // Also add one huge strike at the base
  const centerWave = Math.sin(time) * 0.4 + 1.0;
  const centerMag = 12_000_000 * centerWave;
  
  // Slowly alternate the center strike between positive and negative GEX every ~15 seconds
  const centerGex = Math.sin(time / 3) > 0 ? centerMag : -centerMag;
  
  if (centerGex > 0) {
    most_positive.push({ strike: baseStrike, gex: centerGex });
  } else {
    most_negative.push({ strike: baseStrike, gex: centerGex });
  }
  total_gex += centerGex;

  return {
    ticker,
    spot_price: price,
    total_gex,
    most_positive: most_positive.sort((a, b) => b.gex - a.gex),
    most_negative: most_negative.sort((a, b) => a.gex - b.gex),
  };
};
