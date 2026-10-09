export type ExecutionOrderState =
  | 'SUBMITTED'
  | 'CROSSING'
  | 'SLICING'
  | 'ROUTING'
  | 'FILLED'
  | 'REJECTED';

export interface InboundOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  limitPrice?: number;
  strategyId: string;
  timestamp: number;
}

export interface OmsWaterfallConfig {
  enableDarkMesh?: boolean;
  enableUrgencyGuard?: boolean;
  enableSlicing?: boolean;
  maxAdverseToxicity?: number;
  slicingThresholdQty?: number;
  maxSlices?: number;
}

export interface ExecutionSlice {
  sliceIndex: number;
  quantity: number;
  targetVenue: string;
  expectedPrice: number;
}

export interface OmsWaterfallResult {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  requestedQuantity: number;
  darkMeshMatchedQuantity: number;
  routedQuantity: number;
  unfilledQuantity: number;
  state: ExecutionOrderState;
  darkMeshFeeSavedUsd: number;
  slices: ExecutionSlice[];
  rejectionReason?: string;
}
