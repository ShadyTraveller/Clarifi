import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarPeriod, torontoDateKey } from '../lib/calendar.ts';

test('weeks begin Monday and preserve all seven local days across spring DST', () => {
  const week = calendarPeriod('week', 0, new Date('2026-03-08T17:00:00Z'));
  assert.equal(week.days[0].key, '2026-03-02');
  assert.equal(week.days[6].key, '2026-03-08');
  assert.equal(week.start, '2026-03-02T05:00:00.000Z');
  assert.equal(week.end, '2026-03-09T04:00:00.000Z');
});
test('fall DST and month offsets use Toronto dates rather than host timezone', () => {
  const month = calendarPeriod('month', 0, new Date('2026-11-01T01:00:00Z'));
  assert.equal(torontoDateKey(new Date('2026-11-01T01:00:00Z')), '2026-10-31');
  assert.equal(month.days.length, 31);
  const november = calendarPeriod('month', 1, new Date('2026-11-01T01:00:00Z'));
  assert.equal(november.start, '2026-11-01T04:00:00.000Z');
  assert.equal(november.end, '2026-12-01T05:00:00.000Z');
});
test('month navigation handles leap years and year rollover', () => {
  const february = calendarPeriod('month', -1, new Date('2028-03-15T17:00:00Z'));
  assert.equal(february.days.length, 29);
  assert.equal(february.days.at(-1)?.key, '2028-02-29');
  const january = calendarPeriod('month', 1, new Date('2026-12-15T17:00:00Z'));
  assert.equal(january.days[0].key, '2027-01-01');
  assert.equal(january.leading, 4);
});
