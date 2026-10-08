// SOR Execution Coordinator — Merges TWAP Slicing with Cross-Venue Routing
import type { VenueLiquidityProfile } from '../smart/smart-execution-types';
import type {
  ParentOrderExecutionRequest,
  CoordinatedExecutionPlan,
  CoordinatedSlicePlan,
} from './runtime-execution-types';
import { calculateTwapSlices } from '../smart/twap-slicer';
import { routeOrderSlices } from '../smart/sor-router';

export function coordinateParentOrderExecution(
  request: ParentOrderExecutionRequest,
  venues: readonly VenueLiquidityProfile[],
  pseudoRandomJitter: readonly number[] = [],
): CoordinatedExecutionPlan {
  const chunks = calculateTwapSlices(
    {
      totalQuantity: request.totalQuantity,
      durationMinutes: request.durationMinutes,
      sliceCount: request.sliceCount,
      jitterRatio: request.jitterRatio,
    },
    pseudoRandomJitter,
  );

  const slices: CoordinatedSlicePlan[] = chunks.map((chunk) => {
    const allocations = routeOrderSlices(chunk.targetQuantity, request.side, venues);
    return {
      sliceIndex: chunk.chunkIndex,
      scheduledDelayMs: chunk.scheduledDelayMs,
      executionUrgency: chunk.executionUrgency,
      targetQuantity: chunk.targetQuantity,
      venueAllocations: allocations,
    };
  });

  const totalPlannedQuantity = slices.reduce((sum, s) => sum + s.targetQuantity, 0);

  return {
    parentOrderId: request.clientOrderId,
    symbol: request.symbol,
    side: request.side,
    totalPlannedQuantity: Math.round(totalPlannedQuantity * 1e8) / 1e8,
    slices,
  };
}
