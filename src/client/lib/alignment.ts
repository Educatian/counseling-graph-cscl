/**
 * Alignment metrics between a learner's live path and an expert reference path.
 * Used by Mirror Mode (S5), longitudinal alignment (S4), and post-hoc analytics (S2).
 *
 * Two base metrics:
 *   - jaccard    : set overlap of visited nodes (position-agnostic)
 *   - lcsSim     : longest common subsequence / max(|A|,|B|) — position-sensitive
 *
 * Combined "alignment score" (0..1) defaults to 0.5·jaccard + 0.5·lcsSim.
 * Swappable by research protocol without touching UI.
 */

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function lcs(a: string[], b: string[]): number {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  const dp = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let prev = 0;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

export function lcsSim(a: string[], b: string[]): number {
  const denom = Math.max(a.length, b.length);
  return denom === 0 ? 1 : lcs(a, b) / denom;
}

export function alignmentScore(learnerPath: string[], expertPath: string[]): {
  score: number; jaccard: number; lcsSim: number;
} {
  const j = jaccard(learnerPath, expertPath);
  const l = lcsSim(learnerPath, expertPath);
  return { score: 0.5 * j + 0.5 * l, jaccard: j, lcsSim: l };
}
