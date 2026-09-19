const annualMapImageFrame = { left: 175, top: 44, width: 490, height: 278 } as const;

export function getAnnualMapImageFrame() { return annualMapImageFrame; }

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Affine fit to 13 Czech regional-capital markers on the approved reference map. */
export function czechMapPoint(latitude: number, longitude: number) {
  return {
    x: clamp(0.14649689612230307 * longitude + 0.003528409648982586 * latitude - 1.9517049607161026),
    y: clamp(0.0027944020023575353 * longitude - 0.3943046083477732 * latitude + 20.092762601474156),
  };
}

export function annualMapPdfPoint(latitude: number, longitude: number) {
  const point = czechMapPoint(latitude, longitude);
  return {
    x: annualMapImageFrame.left + point.x * annualMapImageFrame.width,
    y: annualMapImageFrame.top + point.y * annualMapImageFrame.height,
  };
}
