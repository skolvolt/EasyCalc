/** True when b is a newer x.y.z than a. A leading "v" and missing parts (which
 *  count as 0) are tolerated, so "1.2" vs "v1.2.1" compares correctly. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (y !== x) return y > x;
  }
  return false;
}
