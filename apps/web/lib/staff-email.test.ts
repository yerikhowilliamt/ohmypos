import { describe, expect, it } from 'vitest';
import { domainOf, suggestStaffEmail, toEmailLocalPart } from './staff-email';

describe('toEmailLocalPart', () => {
  it('takes the first name only', () => {
    expect(toEmailLocalPart('Novi')).toBe('novi');
    expect(toEmailLocalPart('Novi Andriani')).toBe('novi');
    expect(toEmailLocalPart('Budi Santoso Wijaya')).toBe('budi');
  });

  it('folds accents onto their base letters', () => {
    // Pre-composed U+00E9 and decomposed e + U+0301 look identical on screen
    // but are different strings — both have to land on 'jose'.
    expect(toEmailLocalPart('Jos\u00e9')).toBe('jose');
    expect(toEmailLocalPart('Jose\u0301')).toBe('jose');
  });

  it('drops punctuation that is not legal left of the @', () => {
    expect(toEmailLocalPart("O'Brien")).toBe('obrien');
    expect(toEmailLocalPart('Anne-Marie Dupont')).toBe('annemarie');
  });

  it('tolerates messy spacing', () => {
    expect(toEmailLocalPart('   Novi   Andriani  ')).toBe('novi');
  });

  it('returns empty when nothing usable survives', () => {
    expect(toEmailLocalPart('')).toBe('');
    expect(toEmailLocalPart('   ')).toBe('');
    // No ASCII letters at all — an empty local part is not a suggestion.
    expect(toEmailLocalPart('李明')).toBe('');
  });
});

describe('domainOf', () => {
  it('reads the domain, lowercased', () => {
    expect(domainOf('venty@lospollos.id')).toBe('lospollos.id');
    expect(domainOf('Venty@LosPollos.ID')).toBe('lospollos.id');
  });

  it('returns null when there is no domain', () => {
    expect(domainOf('venty')).toBeNull();
    expect(domainOf('venty@')).toBeNull();
  });
});

describe('suggestStaffEmail', () => {
  it('puts the staff member on the Owner’s domain', () => {
    // The literal request: owner venty@lospollos.id creating "novi".
    expect(suggestStaffEmail('novi', 'venty@lospollos.id')).toBe(
      'novi@lospollos.id',
    );
    expect(suggestStaffEmail('Novi Andriani', 'venty@lospollos.id')).toBe(
      'novi@lospollos.id',
    );
  });

  it('leaves the field alone rather than guessing', () => {
    // No owner loaded yet.
    expect(suggestStaffEmail('Novi', undefined)).toBeNull();
    expect(suggestStaffEmail('Novi', null)).toBeNull();
    // Owner address with no domain.
    expect(suggestStaffEmail('Novi', 'venty')).toBeNull();
    // Name that folds to nothing.
    expect(suggestStaffEmail('李明', 'venty@lospollos.id')).toBeNull();
    expect(suggestStaffEmail('', 'venty@lospollos.id')).toBeNull();
  });

  it('does not deduplicate — a second Novi is the Owner’s to resolve', () => {
    // Decided deliberately: the suggestion stays plain and the server's
    // duplicate-email error is what explains the collision.
    expect(suggestStaffEmail('Novi', 'venty@lospollos.id')).toBe(
      'novi@lospollos.id',
    );
  });
});
