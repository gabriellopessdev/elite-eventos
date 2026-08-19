import { describe, expect, it } from 'vitest';
import { sessionDay, titleMatches } from './session-day';

describe('sessionDay / titleMatches', () => {
  it('formata o dia local no formato do input date', () => {
    expect(sessionDay('2026-10-01T20:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sessionDay('2026-10-01T20:00:00.000Z')).toBe(
      sessionDay(new Date('2026-10-01T20:00:00.000Z').toISOString()),
    );
  });

  it('título vazio ou só espaço não corta; caixa não importa', () => {
    expect(titleMatches('Duna', '')).toBe(true);
    expect(titleMatches('Duna', '  ')).toBe(true);
    expect(titleMatches('Duna', 'duna')).toBe(true);
    expect(titleMatches('Duna', 'Oppen')).toBe(false);
  });
});
