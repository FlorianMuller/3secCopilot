import { DayShiftTime } from "../features/Options/sections/DayShiftSection";

// If a video was filmed before `dayShift` time, assign it to the previous day
export function getEffectiveDate(createdAt: Date, dayShift: DayShiftTime): Date {
  const createdHour = createdAt.getHours();
  const createdMinute = createdAt.getMinutes();

  const effectiveDate = new Date(createdAt);
  if (createdHour < dayShift.hour || (createdHour === dayShift.hour && createdMinute < dayShift.minute)) {
    effectiveDate.setDate(createdAt.getDate() - 1);
  }

  return effectiveDate;
}
