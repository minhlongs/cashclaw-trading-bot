/**
 * Pure timeframe parsing and calculation utilities.
 * Converts human-readable timeframe strings ('1m', '5m', '1h', etc.) to milliseconds.
 */

const UNIT_MULTIPLIERS: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  M: 2_592_000_000, // 30 days
  y: 31_536_000_000, // 365 days
};

const TIMEFRAME_REGEX = /^([1-9]\d*)([smhdwMy])$/;

/**
 * Validates whether a timeframe string matches the standard format.
 */
export function isValidTimeframe(timeframe: string): boolean {
  if (typeof timeframe !== 'string' || timeframe.trim().length === 0) {
    return false;
  }
  const match = TIMEFRAME_REGEX.exec(timeframe.trim());
  if (!match) {
    return false;
  }
  const amount = Number.parseInt(match[1], 10);
  return amount > 0 && Number.isFinite(amount);
}

/**
 * Parses a timeframe string into milliseconds.
 * Throws an Error if the format is invalid.
 */
export function parseTimeframe(timeframe: string): number {
  if (typeof timeframe !== 'string' || timeframe.trim().length === 0) {
    throw new Error(`Invalid timeframe string: "${timeframe}". Expected non-empty string.`);
  }

  const trimmed = timeframe.trim();
  const match = TIMEFRAME_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid timeframe format: "${trimmed}". Expected pattern like '1m', '5m', '1h', '1d'.`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = UNIT_MULTIPLIERS[unit];

  if (!multiplier || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error(`Invalid timeframe format: "${trimmed}". Duration must be greater than zero.`);
  }

  return amount * multiplier;
}
