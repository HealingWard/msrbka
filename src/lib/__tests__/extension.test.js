import { describe, expect, it } from 'vitest';
import { versionAtLeast } from '../extension.js';

describe('версия расширения', () => {
  it('сравнивает по числам, а не по строкам', () => {
    expect(versionAtLeast('0.5.0', '0.5.0')).toBe(true);
    expect(versionAtLeast('0.10.0', '0.5.0')).toBe(true);
    expect(versionAtLeast('0.4.4', '0.5.0')).toBe(false);
    expect(versionAtLeast('1.0', '0.5.0')).toBe(true);
    expect(versionAtLeast(null, '0.5.0')).toBe(false);
  });
});
