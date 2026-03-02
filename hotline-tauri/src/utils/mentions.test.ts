import { describe, it, expect } from 'vitest';
import { containsMention, extractMentions } from './mentions';

describe('containsMention', () => {
  it('detects a simple mention', () => {
    expect(containsMention('Hey @greg!', 'greg')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsMention('Hey @GREG!', 'greg')).toBe(true);
    expect(containsMention('Hey @greg!', 'GREG')).toBe(true);
  });

  it('does not match partial usernames', () => {
    expect(containsMention('Hey @gregory', 'greg')).toBe(false);
  });

  it('matches at the start of a message', () => {
    expect(containsMention('@greg hello', 'greg')).toBe(true);
  });

  it('matches at the end of a message', () => {
    expect(containsMention('hello @greg', 'greg')).toBe(true);
  });

  it('returns false for empty inputs', () => {
    expect(containsMention('', 'greg')).toBe(false);
    expect(containsMention('hello @greg', '')).toBe(false);
    expect(containsMention('hello @greg', '  ')).toBe(false);
  });

  it('handles special regex characters in username', () => {
    expect(containsMention('Hey @user.name!', 'user.name')).toBe(true);
    expect(containsMention('Hey @user+1!', 'user+1')).toBe(true);
  });
});

describe('extractMentions', () => {
  it('extracts a single mention', () => {
    expect(extractMentions('Hey @greg!')).toEqual(['greg']);
  });

  it('extracts multiple mentions', () => {
    expect(extractMentions('@alice and @bob')).toEqual(['alice', 'bob']);
  });

  it('deduplicates mentions', () => {
    expect(extractMentions('@greg hey @greg')).toEqual(['greg']);
  });

  it('returns empty array for no mentions', () => {
    expect(extractMentions('Hello world')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(extractMentions('')).toEqual([]);
  });
});
