// Live time of day and real weather for a place (real ski areas or "Echter Ort").
// The page itself may not be allowed to fetch from other sites, so weather data can also be pasted
// in: the player opens the Open-Meteo link, copies the text and pastes it into the game.

const TZ_BY_FLAG = { '🇨🇭': 'Europe/Zurich', '🇦🇹': 'Europe/Vienna', '🇩🇪': 'Europe/Berlin', '🇫🇷': 'Europe/Paris', '🇮🇹': 'Europe/Rome', '🇸🇪': 'Europe/Stockholm', '🇯🇵': 'Asia/Tokyo', '🇨🇱': 'America/Santiago', '🇦🇷': 'America/Argentina/Buenos_Aires' };
const TZ_BY_ID = { whistler: 'America/Vancouver', vail: 'America/Denver', aspen: 'America/Denver', jackson: 'America/Denver', lakelouise: 'America/Edmonton' };

export function placeTZ(resort) {
  if (!resort) return null;
  return TZ_BY_ID[resort.id] || TZ_BY_FLAG[resort.flag] || null;
}

// local clock hour (0..24) at a place: IANA zone, else the UTC offset from weather data, else longitude
export function liveHour(place, now = new Date()) {
  if (place && place.tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: place.tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now);
      const v = (t) => +(parts.find((p) => p.type === t) || { value: 0 }).value;
      return (v('hour') % 24) + v('minute') / 60 + v('second') / 3600;
    } catch (e) { /* unknown zone: fall through */ }
  }
  let off = null;
  if (place && place.utcOff != null) off = place.utcOff / 3600;
  else if (place && place.lon != null) {
    // longitude guess; if the player's own clock is close to it, use theirs (it knows about summer time)
    const guess = Math.round(place.lon / 15), mine = -now.getTimezoneOffset() / 60;
    off = Math.abs(mine - guess) <= 1.5 ? mine : guess;
  }
  if (off == null) return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const h = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600 + off;
  return ((h % 24) + 24) % 24;
}

export function weatherUrl(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=weather_code,temperature_2m,snowfall,cloud_cover&timezone=auto&forecast_days=3`;
}

// keep only what the game needs; throws a readable error for anything else
export function parseWeather(text) {
  let j;
  const s = String(text || '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  try { j = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); } catch (e) { throw new Error('Das ist kein Wettertext. Kopiere die ganze Seite (alles markieren → kopieren).'); }
  const h = j && j.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.weather_code)) throw new Error('Im Text fehlen die Stundenwerte. Benutze den Link aus dem Spiel.');
  return {
    t0: h.time[0], // local time of the first hour, e.g. "2026-11-08T00:00"
    tz: j.timezone || null, utcOff: j.utc_offset_seconds ?? null, elev: j.elevation ?? null,
    code: h.weather_code.map((x) => x ?? 0), temp: (h.temperature_2m || []).map((x) => x ?? 0),
    snow: (h.snowfall || []).map((x) => x ?? 0), cloud: (h.cloud_cover || []).map((x) => x ?? 0),
    got: Date.now(),
  };
}

// hourly index for "now" at the place (live clock), or for game hour gh on the first day of the data
export function wxIndex(wx, now = new Date(), gameHour = null) {
  if (!wx) return -1;
  if (gameHour != null) return Math.min(wx.code.length - 1, Math.max(0, Math.floor(gameHour)));
  // local time at the place = UTC + offset; the data starts at local midnight of t0
  const off = (wx.utcOff || 0) * 1000;
  const [d, hm] = wx.t0.split('T'); const [Y, Mo, D] = d.split('-').map(Number); const [hh, mm] = (hm || '00:00').split(':').map(Number);
  const start = Date.UTC(Y, Mo - 1, D, hh, mm) - off;
  const i = Math.floor((now.getTime() - start) / 3600000);
  return i >= 0 && i < wx.code.length ? i : -1;
}

// WMO weather code (+ snowfall, temperature) -> the game's weather for the season
export function wxToGame(wx, i, winter) {
  const c = wx.code[i], sf = wx.snow[i] || 0, tC = wx.temp[i] ?? 0, cl = wx.cloud[i] ?? 50;
  const snowy = (c >= 71 && c <= 77) || c === 85 || c === 86 || sf > 0.05;
  const wet = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  if (snowy || (wet && tC < 3)) {
    if (!winter) return 'regen';
    return c === 75 || c === 86 || sf >= 1 ? 'starkschnee' : 'schnee';
  }
  if (wet) return winter ? (tC < 6 ? 'schnee' : 'wolken') : 'regen';
  if (c === 3 || c === 45 || c === 48) return 'wolken';
  if (c === 2) return cl > 60 ? 'wolken' : 'sonne';
  return 'sonne';
}

export const WX_TEXT = (c) => c === 0 ? 'klar' : c <= 2 ? 'leicht bewölkt' : c === 3 ? 'bedeckt' : c === 45 || c === 48 ? 'Nebel' : c <= 57 ? 'Nieselregen' : c <= 67 ? 'Regen' : c <= 77 ? 'Schneefall' : c <= 82 ? 'Regenschauer' : c <= 86 ? 'Schneeschauer' : 'Gewitter';
