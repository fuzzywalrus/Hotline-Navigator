import { describe, it, expect } from 'vitest';
import { hasAccessBit, parseUserFlags } from './serverUtils';

// MSB-first helper mirroring the backend's access_bit(): spec bit n → u64
// bit (63 - n). Computed with BigInt so high bits stay exact.
const accessBit = (n: number): bigint => BigInt(1) << BigInt(63 - n);

describe('hasAccessBit', () => {
  it('maps spec bit numbering MSB-first', () => {
    // Spec bit 0 (delete file) is the highest u64 bit: 2^63
    expect(hasAccessBit('9223372036854775808', 0)).toBe(true);
    expect(hasAccessBit('9223372036854775808', 1)).toBe(false);
    // Spec bit 63 is the lowest u64 bit
    expect(hasAccessBit('1', 63)).toBe(true);
    expect(hasAccessBit('1', 62)).toBe(false);
    // Spec bit 57 (AccessSendMedia) = u64 bit 6 = 64
    expect(hasAccessBit('64', 57)).toBe(true);
  });

  it('keeps low bits exact when high bits exceed Number.MAX_SAFE_INTEGER', () => {
    // delete-file (bit 0) + AccessSendMedia (bit 57): 2^63 + 2^6. As a JS
    // number this would round to exactly 2^63 and silently drop bit 57 —
    // the whole reason the bitmap travels as a string.
    const access = (accessBit(0) | accessBit(57)).toString();
    expect(access).toBe('9223372036854775872');
    expect(hasAccessBit(access, 0)).toBe(true);
    expect(hasAccessBit(access, 57)).toBe(true);
    expect(hasAccessBit(access, 1)).toBe(false);
    expect(hasAccessBit(access, 63)).toBe(false);
  });

  it('handles realistic permission masks', () => {
    // download file (2), upload file (1), send chat (20), disconnect users (22)
    const access = (accessBit(2) | accessBit(1) | accessBit(20) | accessBit(22)).toString();
    expect(hasAccessBit(access, 1)).toBe(true);
    expect(hasAccessBit(access, 2)).toBe(true);
    expect(hasAccessBit(access, 20)).toBe(true);
    expect(hasAccessBit(access, 22)).toBe(true);
    expect(hasAccessBit(access, 0)).toBe(false);
    expect(hasAccessBit(access, 57)).toBe(false);
  });

  it('returns false for zero and for malformed input', () => {
    expect(hasAccessBit('0', 22)).toBe(false);
    expect(hasAccessBit(0, 22)).toBe(false);
    expect(hasAccessBit('not-a-number', 22)).toBe(false);
    expect(hasAccessBit('', 22)).toBe(false);
  });

  it('accepts safe-range numbers for backward compatibility', () => {
    expect(hasAccessBit(64, 57)).toBe(true);
    expect(hasAccessBit(64, 56)).toBe(false);
  });
});

describe('parseUserFlags', () => {
  it('extracts admin and idle bits', () => {
    expect(parseUserFlags(0x0000)).toEqual({ isAdmin: false, isIdle: false });
    expect(parseUserFlags(0x0001)).toEqual({ isAdmin: false, isIdle: true });
    expect(parseUserFlags(0x0002)).toEqual({ isAdmin: true, isIdle: false });
    expect(parseUserFlags(0x0003)).toEqual({ isAdmin: true, isIdle: true });
  });
});
