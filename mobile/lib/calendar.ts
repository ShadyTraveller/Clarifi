import { torontoDayBounds } from './day.ts';

export type CalendarMode = 'week' | 'month';
export function torontoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
// UTC noon stays on the intended Toronto date, including either DST transition.
export function dateForKey(key: string) { return new Date(`${key}T16:00:00Z`); }
function keyForUTC(date: Date) { return date.toISOString().slice(0, 10); }
export function calendarPeriod(mode: CalendarMode, offset: number, now = new Date()) {
  const today = new Date(`${torontoDateKey(now)}T00:00:00Z`);
  const first = mode === 'week'
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (today.getUTCDay() + 6) % 7 + offset * 7))
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const next = mode === 'week'
    ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() + 7))
    : new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const days = [];
  for (let cursor = new Date(first); cursor < next; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = keyForUTC(cursor);
    days.push({ key, date: dateForKey(key), number: cursor.getUTCDate() });
  }
  const start = torontoDayBounds(dateForKey(keyForUTC(first))).start;
  const end = torontoDayBounds(dateForKey(keyForUTC(next))).start;
  const title = mode === 'month'
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'long', year: 'numeric' }).format(days[0].date)
    : `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }).format(days[0].date)} – ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' }).format(days[6].date)}`;
  return { days, start, end, title, leading: (first.getUTCDay() + 6) % 7 };
}
