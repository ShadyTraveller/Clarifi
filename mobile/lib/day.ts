const zone = 'America/Toronto';
function parts(date: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
}
function midnight(year: number, month: number, day: number) {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess));
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    guess += target - local;
  }
  return new Date(guess).toISOString();
}
export function torontoDayBounds(now = new Date()) {
  const p = parts(now);
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  return { start: midnight(year, month, day), end: midnight(year, month, day + 1) };
}
export function dayLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}
export function timeLabel(date: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(date));
}
