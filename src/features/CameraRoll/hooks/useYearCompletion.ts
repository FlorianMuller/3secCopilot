import { useCallback, useEffect, useMemo, useState } from "react";
import { SelectVideoMetadata } from "../../../db/schema";
import { useNavigationFocus } from "../../../hooks/useNavigationFocus";
import { getEffectiveDate } from "../../../services/dayShift";
import { getSelectedVideosMetadataInRange } from "../../../services/metadata";
import { getDaysBetween } from "../../../utils/getDaysBetween";
import { DayShiftTime } from "../../Options/sections/DayShiftSection";

const DAY_MS = 86_400_000;

export interface UseYearCompletionReturn {
  selectedDaysCount: number;
  totalDays: number;
  // Set of `toDateString()` keys for days that already have a selected video. Exposed so the camera
  // roll can derive the "unselected only" list straight from the DB instead of paging the camera roll.
  selectedDayKeys: Set<string>;
  refresh: () => Promise<void>;
}

// Computes, for the given period, how many days already have a selected video (`selectedDaysCount`)
// out of the number of days elapsed so far (`totalDays`, future excluded — the period's `startDate`
// is already capped at "today" for the in-progress period).
//
// `startDate` is the chronologically later bound, `endDate` the earlier one (same convention as the
// rest of the camera roll). The count is read from the DB so it stays accurate regardless of how many
// video batches have been lazily loaded into the list.
export function useYearCompletion(
  startDate: Date,
  endDate: Date,
  dayShift: DayShiftTime | null | undefined
): UseYearCompletionReturn {
  const [selectedMetadata, setSelectedMetadata] = useState<SelectVideoMetadata[]>();

  // Depend on the time values rather than the Date identities, which change every render.
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const refresh = useCallback(async () => {
    // Query a ±1-day-buffered range so day-shifted boundary videos aren't missed; the exact
    // in-period membership is decided below via `periodDaySet`.
    const metadata = await getSelectedVideosMetadataInRange(new Date(endTime - DAY_MS), new Date(startTime + DAY_MS));
    setSelectedMetadata(metadata);
  }, [startTime, endTime]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useNavigationFocus(refresh);

  const { selectedDaysCount, totalDays, selectedDayKeys } = useMemo(() => {
    const dayShiftValue = dayShift || { hour: 0, minute: 0 };
    const periodDays = getDaysBetween(new Date(startTime), new Date(endTime));
    const periodDaySet = new Set(periodDays.map((d) => d.toDateString()));

    const selectedDays = new Set<string>();
    for (const meta of selectedMetadata || []) {
      const day = getEffectiveDate(meta.assignedToDate ?? meta.videoOriginalDate, dayShiftValue).toDateString();
      if (periodDaySet.has(day)) {
        selectedDays.add(day);
      }
    }

    return { selectedDaysCount: selectedDays.size, totalDays: periodDays.length, selectedDayKeys: selectedDays };
  }, [selectedMetadata, startTime, endTime, dayShift?.hour, dayShift?.minute]);

  return { selectedDaysCount, totalDays, selectedDayKeys, refresh };
}
