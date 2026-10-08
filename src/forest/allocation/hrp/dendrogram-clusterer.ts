/**
 * @file dendrogram-clusterer.ts
 * @description Single-linkage hierarchical clustering and quasi-diagonalization.
 */

import type { ClusterNode } from './hrp-types';

export function correlationToDistance(correlationMatrix: readonly number[][]): number[][] {
  const n = correlationMatrix.length;
  const dist: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // d = sqrt(0.5 * (1 - rho))
      const rho = Math.max(-1, Math.min(1, correlationMatrix[i][j]));
      dist[i][j] = Math.sqrt(0.5 * (1.0 - rho));
    }
  }
  return dist;
}

export function buildSingleLinkageDendrogram(distMat: number[][]): ClusterNode {
  const n = distMat.length;
  if (n === 0) throw new Error("Empty distance matrix");
  if (n === 1) return { id: 0, left: null, right: null, distance: 0, constituentLeaves: [0] };

  // Working set of active clusters
  const activeClusters: ClusterNode[] = Array(n).fill(0).map((_, i) => ({
    id: i,
    left: null,
    right: null,
    distance: 0,
    constituentLeaves: [i]
  }));

  // Work matrix D
  const D = distMat.map(row => [...row]);
  let nextNodeId = n;

  while (activeClusters.length > 1) {
    let minDist = Number.POSITIVE_INFINITY;
    let minI = -1;
    let minJ = -1;

    for (let i = 0; i < activeClusters.length; i++) {
      for (let j = i + 1; j < activeClusters.length; j++) {
        
        // Single linkage: min distance between any elements of cluster I and cluster J
        let d = Number.POSITIVE_INFINITY;
        for (const leafI of activeClusters[i].constituentLeaves) {
          for (const leafJ of activeClusters[j].constituentLeaves) {
            if (D[leafI][leafJ] < d) {
              d = D[leafI][leafJ];
            }
          }
        }
        
        if (d < minDist) {
          minDist = d;
          minI = i;
          minJ = j;
        }
      }
    }

    const clusterLeft = activeClusters[minI];
    const clusterRight = activeClusters[minJ];
    
    // Create new node
    const newNode: ClusterNode = {
      id: nextNodeId++,
      left: clusterLeft,
      right: clusterRight,
      distance: minDist,
      constituentLeaves: [...clusterLeft.constituentLeaves, ...clusterRight.constituentLeaves]
    };

    // Remove old clusters and add new one
    activeClusters.splice(minJ, 1);
    activeClusters.splice(minI, 1);
    activeClusters.push(newNode);
  }

  return activeClusters[0];
}

export function quasiDiagonalize(node: ClusterNode | null): number[] {
  if (!node) return [];
  if (!node.left && !node.right) {
    return [node.id];
  }
  return [...quasiDiagonalize(node.left), ...quasiDiagonalize(node.right)];
}
