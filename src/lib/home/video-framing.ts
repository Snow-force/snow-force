type FocalPoint = readonly [seconds: number, sourceX: number];

// Reviewed against /videos/snowmountain.mp4 (15 seconds, 1280x720).
// Follow the snowpeak, then the rider/board. Keep shot cuts discontinuous;
// interpolating across a cut would briefly frame unrelated scenery.
const scenes: readonly { end: number; points: readonly FocalPoint[] }[] = [
  { end: 3, points: [[0, .8], [3, .8]] },
  { end: 5, points: [[3, .42], [3.5, .42], [4.5, .48], [5, .48]] },
  { end: 7, points: [[5, .71], [5.5, .71], [6.5, .78], [7, .78]] },
  { end: Infinity, points: [[7, .54], [7.5, .54], [8.5, .60], [9.5, .46], [10.5, .35], [11.5, .35], [12.5, .39], [13.5, .40], [14.5, .56], [15.1, .56]] },
];

export function mountainVideoPosition(seconds: number, width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "92% 50%";
  const visibleFraction = Math.min(1, width / height / (16 / 9));
  if (visibleFraction >= 1) return "50% 50%";
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const points = (scenes.find(scene => time < scene.end) ?? scenes[scenes.length - 1]).points;
  let focal = points[points.length - 1][1];
  for (let index = 1; index < points.length; index++) {
    const [end, endX] = points[index];
    if (time <= end) {
      const [start, startX] = points[index - 1];
      const progress = Math.max(0, Math.min(1, (time - start) / (end - start)));
      focal = startX + (endX - startX) * progress;
      break;
    }
  }
  // CSS object-position percentages describe the overflow offset, not a source
  // coordinate. Convert the reviewed focal point so it lands in the frame centre.
  const position = Math.max(0, Math.min(1, (focal - visibleFraction / 2) / (1 - visibleFraction)));
  return `${Math.round(position * 10000) / 100}% 50%`;
}
