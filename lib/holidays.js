// Holiday detection for the board + captions. Pure date math (no external API),
// so the TV display never depends on a network call to render.
// All dates are computed at UTC midnight and compared as day numbers.

import { todayInCentral } from "./menu";

// weekday: 0=Sun .. 6=Sat. n = which occurrence (1-based).
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (7 + weekday - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last of this
  const back = (7 + last.getUTCDay() - weekday) % 7;
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - back));
}

// Anonymous Gregorian algorithm for Easter Sunday.
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const fixed = (mo, d) => (y) => new Date(Date.UTC(y, mo - 1, d));

// name, emoji, greeting (shown when it's today), and a date(year) rule.
const HOLIDAYS = [
  { name: "New Year's Day", emoji: "🎉", greeting: "Happy New Year!", date: fixed(1, 1) },
  { name: "Valentine's Day", emoji: "❤️", greeting: "Happy Valentine's Day!", date: fixed(2, 14) },
  { name: "St. Patrick's Day", emoji: "🍀", greeting: "Happy St. Patrick's Day!", date: fixed(3, 17) },
  { name: "Easter", emoji: "🐰", greeting: "Happy Easter!", date: easter },
  { name: "Mother's Day", emoji: "💐", greeting: "Happy Mother's Day!", date: (y) => nthWeekday(y, 5, 0, 2) },
  { name: "Memorial Day", emoji: "🇺🇸", greeting: "Memorial Day", date: (y) => lastWeekday(y, 5, 1) },
  { name: "Father's Day", emoji: "👔", greeting: "Happy Father's Day!", date: (y) => nthWeekday(y, 6, 0, 3) },
  { name: "Juneteenth", emoji: "✊", greeting: "Juneteenth", date: fixed(6, 19) },
  { name: "Independence Day", emoji: "🎆", greeting: "Happy 4th of July!", date: fixed(7, 4) },
  { name: "Labor Day", emoji: "🛠️", greeting: "Happy Labor Day!", date: (y) => nthWeekday(y, 9, 1, 1) },
  { name: "Halloween", emoji: "🎃", greeting: "Happy Halloween!", date: fixed(10, 31) },
  { name: "Thanksgiving", emoji: "🦃", greeting: "Happy Thanksgiving!", date: (y) => nthWeekday(y, 11, 4, 4) },
  { name: "Christmas Eve", emoji: "🎄", greeting: "Merry Christmas Eve!", date: fixed(12, 24) },
  { name: "Christmas", emoji: "🎄", greeting: "Merry Christmas!", date: fixed(12, 25) },
  { name: "New Year's Eve", emoji: "🥂", greeting: "Happy New Year's Eve!", date: fixed(12, 31) },
  // Fun food & drink days — great for restaurant specials
  { name: "National Pizza Day", emoji: "🍕", greeting: "National Pizza Day!", date: fixed(2, 9) },
  { name: "National Margarita Day", emoji: "🍹", greeting: "National Margarita Day!", date: fixed(2, 22) },
  { name: "National Beer Day", emoji: "🍺", greeting: "National Beer Day!", date: fixed(4, 7) },
  { name: "National Wine Day", emoji: "🍷", greeting: "National Wine Day!", date: fixed(5, 25) },
  { name: "National Cheeseburger Day", emoji: "🍔", greeting: "National Cheeseburger Day!", date: fixed(9, 18) },
  { name: "National Coffee Day", emoji: "☕", greeting: "National Coffee Day!", date: fixed(9, 29) },
  { name: "National Taco Day", emoji: "🌮", greeting: "National Taco Day!", date: fixed(10, 4) },
];

const DAY = 86400000;
const UPCOMING_WINDOW_DAYS = 14;

function fmtShort(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

// Returns { today, upcoming } where each is {name, emoji, greeting, label, inDays} or null.
export function getHolidayInfo() {
  const [y, m, d] = todayInCentral().split("-").map(Number);
  const todayMs = Date.UTC(y, m - 1, d);

  let today = null;
  let upcoming = null;

  for (const hol of HOLIDAYS) {
    for (const yr of [y, y + 1]) {
      const ms = hol.date(yr).getTime();
      const diff = Math.round((ms - todayMs) / DAY);
      if (diff === 0) {
        today = { name: hol.name, emoji: hol.emoji, greeting: hol.greeting };
      } else if (diff > 0 && diff <= UPCOMING_WINDOW_DAYS) {
        if (!upcoming || diff < upcoming.inDays) {
          upcoming = { name: hol.name, emoji: hol.emoji, label: fmtShort(ms), inDays: diff };
        }
      }
    }
  }

  return { today, upcoming };
}
