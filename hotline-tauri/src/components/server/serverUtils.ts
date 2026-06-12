// Utility functions for ServerWindow

// Hotline user flag bits
const USER_FLAG_IDLE = 0x0001;
const USER_FLAG_ADMIN = 0x0002;

export function parseUserFlags(flags: number) {
  return {
    isAdmin: (flags & USER_FLAG_ADMIN) !== 0,
    isIdle: (flags & USER_FLAG_IDLE) !== 0,
  };
}

/**
 * Check a bit in the Hotline access-privilege bitmap.
 *
 * Hotline numbers access bits MSB-first: spec "bit n" is u64 bit (63 - n) of
 * the 8-byte field read big-endian (e.g. bitIndex 22 = canDisconnectUsers =
 * u64 bit 41). The bitmap arrives from the backend as a decimal string
 * because JSON numbers lose precision above 2^53 — BigInt handles the full
 * 64-bit range. Accepts number too for backward compatibility.
 */
export function hasAccessBit(access: string | number, bitIndex: number): boolean {
  let bits: bigint;
  try {
    bits = BigInt(access);
  } catch {
    return false;
  }
  return (bits & (BigInt(1) << BigInt(63 - bitIndex))) !== BigInt(0);
}

