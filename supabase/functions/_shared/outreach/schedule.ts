export interface SendWindow {
  start: string;
  end: string;
  timezone: string;
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseTime(
  value: string,
): { hour: number; minute: number; second: number } {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`Horário inválido: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Horário inválido: ${value}`);
  }
  return { hour, minute, second };
}

function secondsOfDay(
  time: { hour: number; minute: number; second: number },
): number {
  return time.hour * 3600 + time.minute * 60 + time.second;
}

function zonedParts(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Converte data/hora civil do tenant para um instante UTC, inclusive em DST. */
function localToUtc(local: DateParts, timezone: string): Date {
  const wallClock = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let candidate = wallClock;
  // Duas iterações resolvem mudanças de offset próximas ao horário desejado.
  for (let i = 0; i < 3; i++) {
    const seen = zonedParts(new Date(candidate), timezone);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    );
    const correction = wallClock - seenAsUtc;
    if (correction === 0) break;
    candidate += correction;
  }
  return new Date(candidate);
}

export function validateSendWindow(window: SendWindow): void {
  const start = secondsOfDay(parseTime(window.start));
  const end = secondsOfDay(parseTime(window.end));
  // Também valida o nome do fuso.
  zonedParts(new Date(0), window.timezone);
  if (start >= end) {
    throw new Error(
      "A janela de envio deve começar antes de terminar; não pode cruzar a meia-noite.",
    );
  }
}

/**
 * Devolve `now` quando já pode enviar, ou o próximo início da janela no fuso
 * do tenant. A janela é inclusiva no início e exclusiva no fim: [start, end).
 */
export function nextAllowedSendTime(now: Date, window: SendWindow): Date {
  validateSendWindow(window);
  const start = parseTime(window.start);
  const end = parseTime(window.end);
  const localNow = zonedParts(now, window.timezone);
  const current = secondsOfDay(localNow);
  const startSeconds = secondsOfDay(start);
  const endSeconds = secondsOfDay(end);

  if (current >= startSeconds && current < endSeconds) return new Date(now);

  const calendar = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day),
  );
  if (current >= endSeconds) calendar.setUTCDate(calendar.getUTCDate() + 1);
  return localToUtc({
    year: calendar.getUTCFullYear(),
    month: calendar.getUTCMonth() + 1,
    day: calendar.getUTCDate(),
    ...start,
  }, window.timezone);
}
