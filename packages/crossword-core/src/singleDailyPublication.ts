import type { Difficulty } from "./difficultyProfiles.ts";
export type DailyPublicationPolicy = {
  version: 1;
  singleFromDate: string;
  vocabularyPolicy: "familiar-v1";
};
function parts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
function midnight(date: string, timeZone: string) {
  const wall = Date.parse(date + "T00:00:00Z");
  let value = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(value), timeZone);
    const local = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    value = wall - (local - value);
  }
  const p = parts(new Date(value), timeZone);
  if (`${p.year}-${p.month}-${p.day}` !== date || p.hour !== "00")
    throw new Error("No midnight in the requested timezone");
  return new Date(value).toISOString();
}
export function resolveSingleDailyPublication({
  now,
  timeZone,
  fromDate,
  startDate,
  publishedAt,
}: {
  now: Date;
  timeZone: string;
  fromDate?: string;
  startDate?: string;
  publishedAt?: string;
}) {
  if (!fromDate) return undefined;
  if (!validDate(fromDate))
    throw new Error("Invalid single daily transition date");
  const current = parts(now, timeZone);
  const next = new Date(
    Date.UTC(
      Number(current.year),
      Number(current.month) - 1,
      Number(current.day) + 1,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const date = startDate ?? next;
  if (!validDate(date)) throw new Error("Invalid publication date");
  if (date < fromDate) return undefined;
  const scheduled = midnight(date, timeZone);
  if (publishedAt && new Date(publishedAt).toISOString() !== scheduled)
    throw new Error("Single daily puzzle must publish at local midnight");
  return {
    date,
    publishedAt: scheduled,
    alias: date.slice(2).replaceAll("-", "") + "01",
    slotId: date + "-h01",
    fromDate,
  };
}
export function requiredDailyDifficulties(
  policy: DailyPublicationPolicy | undefined,
  date: string,
): Difficulty[] {
  return policy && date >= policy.singleFromDate ? ["hard"] : ["easy", "hard"];
}
