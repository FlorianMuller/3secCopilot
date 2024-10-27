import { DateTime } from "luxon";
import { capitalize } from "./capitalize";

export function displayDate(date: Date): string {
  return capitalize(
    DateTime.fromJSDate(date).setLocale("fr").toLocaleString({ day: "numeric", month: "long", weekday: "long" })
  );
}

export function displayTime(date: Date): string {
  return capitalize(DateTime.fromJSDate(date).setLocale("fr").toLocaleString({ hour: "2-digit", minute: "2-digit" }));
}
