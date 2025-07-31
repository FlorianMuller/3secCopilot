import { DateTime, Duration } from "luxon";
import { capitalize } from "./capitalize";

export function displayDate(date: Date): string {
  return capitalize(
    DateTime.fromJSDate(date).setLocale("fr").toLocaleString({ day: "numeric", month: "long", weekday: "long" })
  );
}

export function displayShortDate(date: Date): string {
  return capitalize(DateTime.fromJSDate(date).setLocale("fr").toLocaleString({ day: "2-digit", month: "2-digit" }));
}

export function displayTime(date: Date): string {
  return capitalize(DateTime.fromJSDate(date).setLocale("fr").toLocaleString({ hour: "2-digit", minute: "2-digit" }));
}

export function displayDurationFromMilis(durationInMilis: number): string {
  return Duration.fromMillis(durationInMilis).toFormat("m:ss");
}

export function displayDurationFromSecond(durationInSecond: number): string {
  return displayDurationFromMilis(durationInSecond * 1000);
}
