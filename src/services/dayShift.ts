import { DayShiftTime } from "../features/Options/sections/DayShiftSection";

export function isVideoDayShifted(createdAt: Date, dayShift: DayShiftTime): boolean {
  const createdHour = createdAt.getHours();
  const createdMinute = createdAt.getMinutes();

  const effectiveDate = new Date(createdAt);
  if (createdHour < dayShift.hour || (createdHour === dayShift.hour && createdMinute < dayShift.minute)) {
    return true;
  }
  return false;
}

// If a video was filmed before `dayShift` time, assign it to the previous day
export function getEffectiveDate(createdAt: Date, dayShift: DayShiftTime): Date {
  const effectiveDate = new Date(createdAt);

  if (isVideoDayShifted(createdAt, dayShift)) {
    effectiveDate.setDate(createdAt.getDate() - 1);
  }
  return effectiveDate;
}
