import { useEffect, useState } from "react";
import preferences from "../../../services/preferences";
import { YearGroupingMode } from "../../Options/sections/YearGrouping";
import { get } from "react-native/Libraries/TurboModule/TurboModuleRegistry";

export type Period = {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
};

export function usePeriod() {
  const { yearGroupingMode } = preferences.useYearGroupingModePreference();
  const { birthdayDate } = preferences.useBirthdayDatePreference();

  const periods: Period[] | undefined = computePeriods(yearGroupingMode, birthdayDate);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>();
  const selectedPeriod = periods?.find((p) => p.id === selectedPeriodId);

  useEffect(() => {
    // If no period selected, select the first one
    if (periods !== undefined && selectedPeriodId === undefined && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  return { periods, selectedPeriod, setSelectedPeriodId };
}

function computePeriods(yearGroupingMode: YearGroupingMode | undefined, birthdayDate?: Date | null | undefined) {
  if (yearGroupingMode === undefined) {
    return undefined;
  }
  if (yearGroupingMode === "age") {
    if (birthdayDate === undefined || birthdayDate === null) {
      // Todo: show error ?
      return undefined;
    }
    return computeAgeYearPeriods(birthdayDate);
  }

  return computeCalendarYearPeriods();
}

function computeCalendarYearPeriods(lastYear = 1990): Period[] {
  const currentYear = new Date().getFullYear();
  const periods: Period[] = [];

  for (const i of Array(currentYear - lastYear + 1).keys()) {
    const year = currentYear - i;
    periods.push({
      id: `calendar-${year}`,
      label: year.toString(),
      startDate: new Date(year, 11, 31, 23, 59, 59, 999),
      endDate: new Date(currentYear - i, 0, 1),
    });
  }

  return periods;
}

function computeAgeYearPeriods(birthdayDate: Date): Period[] {
  const currentAge = getAge(birthdayDate);
  const periods: Period[] = [];

  for (const i of Array(currentAge + 1).keys()) {
    const age = currentAge - i;

    // End camera roll on birthday
    const endDate = new Date(birthdayDate);
    endDate.setFullYear(birthdayDate.getFullYear() + age);
    endDate.setHours(0, 0, 0, 0);

    // Start camera roll on day before next birthday
    const startDate = new Date(birthdayDate);
    startDate.setFullYear(birthdayDate.getFullYear() + age + 1);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(23, 0, 0, 0);

    periods.push({
      id: `age-${age}`,
      label: age >= 2 ? `${age} ans` : `${age} an`,
      startDate,
      endDate,
    });
  }

  return periods;
}

function getAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();

  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}
