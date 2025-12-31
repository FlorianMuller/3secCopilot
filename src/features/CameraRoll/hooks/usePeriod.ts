import { useState } from "react";

export type Period = {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
};

export function usePeriod() {
  // Hardcoded 3 calendar years for UI development
  // TODO: Later compute dynamically based on yearGroupingMode and birthdayDate preferences
  const periods: Period[] = [
    {
      id: "2025",
      label: "2025",
      startDate: new Date(2025, 11, 31, 23, 59, 59, 999),
      endDate: new Date(2025, 0, 1),
    },
    {
      id: "2024",
      label: "2024",
      startDate: new Date(2024, 11, 31, 23, 59, 59, 999),
      endDate: new Date(2024, 0, 1),
    },
    {
      id: "2023",
      label: "2023",
      startDate: new Date(2023, 11, 31, 23, 59, 59, 999),
      endDate: new Date(2023, 0, 1),
    },
  ];

  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[1].id);
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId)!;

  return { periods, selectedPeriod, setSelectedPeriodId };
}
