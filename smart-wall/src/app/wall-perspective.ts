import type { Point } from './paint-engine';

export type WallProjection = (x: number, y: number, result: Point) => void;

function turn(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (ordered: Point[]) => {
    const edge: Point[] = [];
    for (const point of ordered) {
      while (edge.length > 1 && turn(edge[edge.length - 2], edge[edge.length - 1], point) <= 0) edge.pop();
      edge.push(point);
    }
    return edge.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

export function wallProjection(outline: readonly Point[]): WallProjection | undefined {
  if (outline.length < 4 || outline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
  const corners = hull(outline);
  if (corners.length < 4) return;

  // Ignore small changes in direction when the outline goes around obstacles.
  while (corners.length > 4) {
    let leastArea = Infinity;
    let extraCorner = 0;
    for (let i = 0; i < corners.length; i++) {
      const area = turn(corners.at(i - 1)!, corners[i], corners[(i + 1) % corners.length]);
      if (area < leastArea) {
        leastArea = area;
        extraCorner = i;
      }
    }
    corners.splice(extraCorner, 1);
  }

  const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  let top = 0;
  let rightward = -Infinity;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const direction = (b.x - a.x) / length(a, b);
    if (direction > rightward) {
      rightward = direction;
      top = i;
    }
  }
  const [origin, right, far, down] = [...corners.slice(top), ...corners.slice(0, top)];
  const width = (length(origin, right) + length(down, far)) / 2;
  const height = (length(origin, down) + length(right, far)) / 2;

  // Fit a homography from the unit square to the wall and use its inverse for sampling.
  const dx1 = right.x - far.x, dx2 = down.x - far.x;
  const dy1 = right.y - far.y, dy2 = down.y - far.y;
  const dx3 = origin.x - right.x + far.x - down.x;
  const dy3 = origin.y - right.y + far.y - down.y;
  const cross = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(cross) < 1e-6) return;
  const g = (dx3 * dy2 - dx2 * dy3) / cross;
  const h = (dx1 * dy3 - dx3 * dy1) / cross;
  const a = (right.x - origin.x) * (1 + g), b = (down.x - origin.x) * (1 + h);
  const c = (right.y - origin.y) * (1 + g), d = (down.y - origin.y) * (1 + h);
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-6) return;
  const denominatorX = (c * h - d * g) / determinant;
  const denominatorY = (b * g - a * h) / determinant;

  return (x, y, result) => {
    const localX = x - origin.x, localY = y - origin.y;
    const denominator = 1 + denominatorX * localX + denominatorY * localY;
    if (denominator < 1e-6) {
      // A detailed outline may extend beyond the fitted plane towards its horizon.
      result.x = x;
      result.y = y;
      return;
    }
    const factor = 1 / (determinant * denominator);
    result.x = origin.x + (d * localX - b * localY) * factor * width;
    result.y = origin.y + (a * localY - c * localX) * factor * height;
  };
}
