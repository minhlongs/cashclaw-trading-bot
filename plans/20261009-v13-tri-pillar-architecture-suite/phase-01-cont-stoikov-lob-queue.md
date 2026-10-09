# Phase 01: Cont-Stoikov LOB Queue Dynamics & Micro-Price Engine

## Overview
- **Priority**: High
- **Status**: Pending
- **Goal**: Xây dựng module vi cấu trúc khớp lệnh Markovian Cont-Stoikov tại `src/tree/quantlib/microstructure/cont-stoikov-lob-queue.ts` và types tương ứng.

## Mathematical Formulation
- Queue Depletion Rate: $P(\text{Fill} \mid q, L) = \frac{\lambda}{\lambda + \mu} \cdot \left(1 - \frac{q}{L + 1}\right)$
  Trong đó:
  - $q$: Vị trí thứ tự của lệnh trong hàng đợi cấp 1 ($0 \le q \le L$)
  - $L$: Tổng độ sâu / số lượng hợp đồng tại mức giá đó
  - $\lambda$: Tốc độ khớp lệnh thị trường (market order arrival rate)
  - $\mu$: Tốc độ hủy lệnh (cancellation rate)
- Micro-Price điều chỉnh theo Order Flow Imbalance (OFI):
  $$P_{\text{micro}} = P_{\text{mid}} + \frac{Q_b - Q_a}{Q_b + Q_a} \cdot \frac{\text{Spread}}{2}$$

## Related Code Files
- `src/tree/quantlib/microstructure/cont-stoikov-lob-types.ts` (Tạo mới, $\le 60$ LOC)
- `src/tree/quantlib/microstructure/cont-stoikov-lob-queue.ts` (Tạo mới, $\le 120$ LOC)
- `test/quant/cont-stoikov-lob-queue.test.ts` (Tạo mới)

## Success Criteria
- 100% test pass và bao phủ toàn bộ các trường hợp biên ($L=0$, $\lambda + \mu = 0$, $Q_b + Q_a = 0$).
- Tất cả các file $\le 140$ LOC, 0 `:any`.
