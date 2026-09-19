import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openState,
  nextOpening,
  parseHm,
  localParts,
  RESTAURANT_TIMEZONE,
  type OpeningHours,
} from './openingHours';

/**
 * Tests for the opening-hours judgement.
 *
 * The bug this file exists to prevent: judging "open now?" in the *viewer's*
 * timezone. That makes these tests unusually easy to write badly — a suite that
 * passes on a laptop set to Adelaide proves nothing, and the first version of
 * this file did exactly that: it stayed green when `localParts` was mutated to
 * ignore the restaurant timezone entirely.
 *
 * So the machine timezone is pinned to UTC for every test below. Adelaide is
 * UTC+9:30, which means an Adelaide-vs-machine mix-up shifts the clock by hours
 * and any timezone-dependent test fails immediately rather than coincidentally
 * passing.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'UTC';
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});


/** Every day, 11:00–21:00, then closed Sunday. */
const HOURS: OpeningHours = {
  days: [
    { day: 0, opens: '11:00', closes: '21:00', closed: true },
    { day: 1, opens: '11:00', closes: '21:00' },
    { day: 2, opens: '11:00', closes: '21:00' },
    { day: 3, opens: '11:00', closes: '21:00' },
    { day: 4, opens: '11:00', closes: '21:00' },
    { day: 5, opens: '11:00', closes: '22:00' },
    { day: 6, opens: '11:00', closes: '22:00' },
  ],
};

/**
 * Build an instant from Adelaide wall-clock time.
 *
 * Adelaide is +09:30 standard / +10:30 daylight. Rather than hard-code an offset
 * (which changes twice a year and would make these tests lie for half of it) the
 * offset is discovered from `Intl` for the date being built.
 */
function adelaide(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = adelaideOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60_000);
}

function adelaideOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: RESTAURANT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

describe('parseHm', () => {
  it('parses a valid 24-hour time', () => {
    expect(parseHm('21:00')).toBe(1260);
    expect(parseHm('00:00')).toBe(0);
    expect(parseHm('09:05')).toBe(545);
  });

  it('accepts a single-digit hour', () => {
    expect(parseHm('9:05')).toBe(545);
  });

  it('returns null for malformed input', () => {
    expect(parseHm('')).toBeNull();
    expect(parseHm('9')).toBeNull();
    expect(parseHm('9:5')).toBeNull();
    expect(parseHm('abc')).toBeNull();
    expect(parseHm('11:00:00')).toBeNull();
  });

  it('returns null for out-of-range times', () => {
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('11:60')).toBeNull();
  });
});

describe('localParts', () => {
  it('reports Adelaide wall-clock time, not the machine timezone', () => {
    // 2026-03-10 12:00 Adelaide.
    const at = adelaide(2026, 3, 10, 12, 0);
    const { minutes } = localParts(at);
    expect(minutes).toBe(12 * 60);
  });

  it('ignores the machine timezone even when it differs by hours', () => {
    // The direct regression guard for the bug the mutation check found: with the
    // machine on UTC, an instant that is 13:00 in Adelaide is 02:30 UTC. If
    // `localParts` ever reads the machine zone instead of the restaurant's, this
    // assertion fails by 10h30m rather than passing by coincidence.
    const at = adelaide(2026, 3, 10, 13, 0);
    expect(process.env.TZ).toBe('UTC');
    expect(localParts(at).minutes).toBe(13 * 60);
    expect(Math.floor(at.getTime() / 3600_000) % 24).not.toBe(13); // the instant is NOT 13:00 UTC
  });

  it('reports the Adelaide day, not the UTC day, across the boundary', () => {
    // 2026-03-10 00:30 Adelaide is 2026-03-09 15:00 UTC — a different day. The
    // weekday decides which opening-hours row applies, so getting this wrong
    // means the shop uses Monday's hours on Tuesday.
    const at = adelaide(2026, 3, 10, 0, 30);
    expect(localParts(at).day).toBe(2); // Tuesday
    expect(new Date(at.getTime()).getUTCDay()).toBe(1); // Monday in UTC
  });

  it('renders midnight as hour 0, not 24', () => {
    const at = adelaide(2026, 3, 10, 0, 0);
    const { minutes } = localParts(at);
    expect(minutes).toBe(0);
  });
});

describe('openState', () => {
  it('is open in the middle of the day', () => {
    const state = openState(HOURS, adelaide(2026, 3, 10, 13, 0));
    expect(state.open).toBe(true);
  });

  it('is closed before opening', () => {
    const state = openState(HOURS, adelaide(2026, 3, 10, 10, 0));
    expect(state.open).toBe(false);
    expect(state.reason).toContain('Opens at 11:00');
  });

  it('is open at exactly the opening minute', () => {
    expect(openState(HOURS, adelaide(2026, 3, 10, 11, 0)).open).toBe(true);
  });

  it('is open at exactly the closing minute — closing time is inclusive', () => {
    // The kitchen's rule is the door, not the millisecond.
    expect(openState(HOURS, adelaide(2026, 3, 10, 21, 0)).open).toBe(true);
  });

  it('is closed one minute after closing', () => {
    expect(openState(HOURS, adelaide(2026, 3, 10, 21, 1)).open).toBe(false);
  });

  it('is closed all day on a closed day', () => {
    // 2026-03-08 is a Sunday.
    const state = openState(HOURS, adelaide(2026, 3, 8, 13, 0));
    expect(state.open).toBe(false);
    expect(state.reason).toBe('Closed today');
  });

  it('uses a different closing time on a Friday', () => {
    // 2026-03-13 is a Friday: closes 22:00, so 21:30 is open.
    expect(openState(HOURS, adelaide(2026, 3, 13, 21, 30)).open).toBe(true);
  });

  it('returns CLOSED for malformed hours, never open-all-day', () => {
    // The dangerous default. Settings that failed to parse must not be read as
    // "open", or a customer orders from a closed kitchen.
    const broken: OpeningHours = { days: [{ day: 2, opens: 'nonsense', closes: '21:00' }] };
    const state = openState(broken, adelaide(2026, 3, 10, 13, 0));
    expect(state.open).toBe(false);
  });

  it('returns closed when the day is missing from the settings', () => {
    const state = openState({ days: [] }, adelaide(2026, 3, 10, 13, 0));
    expect(state.open).toBe(false);
  });
});

describe('nextOpening', () => {
  it('says "Tomorrow at" when the next day is open', () => {
    // Monday 10:00, before Monday's 11:00 open, but Sunday is closed so the next
    // opening is Monday itself — the function looks forward from the day, so
    // assert the wording it actually produces for a genuinely closed Sunday.
    const onClosedSunday = nextOpening(HOURS, adelaide(2026, 3, 8, 13, 0));
    expect(onClosedSunday).toBe('Tomorrow at 11:00');
  });

  it('names the day when it is further away than tomorrow', () => {
    // A shop open only on Wednesday, checked on **Thursday** 2026-03-12, so the
    // next opening is six days out and must name the day rather than say
    // "Tomorrow" (which is what a naive `ahead === 1` shortcut gets wrong).
    const wednesdayOnly: OpeningHours = {
      days: [{ day: 3, opens: '17:00', closes: '21:00' }],
    };
    expect(nextOpening(wednesdayOnly, adelaide(2026, 3, 12, 13, 0))).toBe('Wednesday at 17:00');
  });

  it('says "Tomorrow" when the next opening really is tomorrow', () => {
    // Tuesday 2026-03-10, shop open Wednesdays only -> the very next day.
    const wednesdayOnly: OpeningHours = {
      days: [{ day: 3, opens: '17:00', closes: '21:00' }],
    };
    expect(nextOpening(wednesdayOnly, adelaide(2026, 3, 10, 13, 0))).toBe('Tomorrow at 17:00');
  });

  it('says hours are unavailable when no day opens', () => {
    expect(nextOpening({ days: [] }, adelaide(2026, 3, 10, 13, 0))).toBe(
      'Opening hours are unavailable',
    );
  });
});
