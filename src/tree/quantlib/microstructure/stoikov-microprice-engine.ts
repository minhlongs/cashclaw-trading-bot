import type {
  StoikovOrderBookL1,
  StoikovMicroPriceConfig,
  StoikovMicroPriceResult,
} from './stoikov-microprice-types';

export class StoikovMicroPriceEngine {
  calculate(book: StoikovOrderBookL1, config?: StoikovMicroPriceConfig): StoikovMicroPriceResult {
    if (book.bidPrice <= 0 || book.askPrice <= book.bidPrice) {
      throw new Error('Invalid book quotes: bid must be positive and strictly lower than ask.');
    }
    if (book.bidVolume <= 0 && book.askVolume <= 0) {
      throw new Error('Total book volume must be strictly positive.');
    }

    const spread = book.askPrice - book.bidPrice;
    const midPrice = (book.bidPrice + book.askPrice) / 2;
    const totalVol = Math.max(1e-12, book.bidVolume + book.askVolume);
    const imbalance = Math.max(-1, Math.min(1, (book.bidVolume - book.askVolume) / totalVol));

    const kappa = Math.max(0, Math.min(0.5, config?.kappa ?? 0.25));
    const gAdjustment = (1 + imbalance) / 2 + kappa * imbalance * (1 - imbalance * imbalance);
    const probUp = Math.max(0, Math.min(1, gAdjustment));

    const microPrice = book.bidPrice + spread * probUp;
    const driftBps = ((microPrice - midPrice) / midPrice) * 10_000;

    return {
      midPrice: Number(midPrice.toFixed(6)),
      spread: Number(spread.toFixed(6)),
      imbalance: Number(imbalance.toFixed(4)),
      microPrice: Number(microPrice.toFixed(6)),
      driftBps: Number(driftBps.toFixed(4)),
      probabilityUp: Number(probUp.toFixed(4)),
    };
  }
}
