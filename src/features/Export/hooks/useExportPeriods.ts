import { useCallback, useEffect, useMemo, useState } from "react";
import { SelectVideoMetadata } from "../../../db/schema";
import { useNavigationFocus } from "../../../hooks/useNavigationFocus";
import { getSelectedVideosMetadataInRange } from "../../../services/metadata";
import { groupClipsForPeriod, PeriodClips } from "../../../services/montage";
import preferences from "../../../services/preferences";
import { Period, usePeriod } from "../../CameraRoll/hooks/usePeriod";

const DAY_MS = 86_400_000;

export interface ExportPeriodSummary {
  period: Period;
  clips: PeriodClips;
}

// All periods that have at least one selected video, with their export stats (§9.1).
// One DB query shared by every period row; per-period membership (incl. day shift)
// is decided in groupClipsForPeriod.
export function useExportPeriods(): { summaries: ExportPeriodSummary[] | undefined; refresh: () => Promise<void> } {
  const { periods } = usePeriod();
  const { dayShift } = preferences.useDayShiftPreference({ refetchOnFocus: true });

  const [metadataList, setMetadataList] = useState<SelectVideoMetadata[]>();

  const refresh = useCallback(async () => {
    // +1 day buffer so day-shifted boundary videos aren't missed (same as useYearCompletion)
    const metadata = await getSelectedVideosMetadataInRange(new Date(0), new Date(Date.now() + DAY_MS));
    setMetadataList(metadata);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useNavigationFocus(refresh);

  const summaries = useMemo(() => {
    if (periods === undefined || metadataList === undefined || dayShift === undefined) {
      return undefined;
    }
    return periods
      .map((period) => ({ period, clips: groupClipsForPeriod(period, metadataList, dayShift || { hour: 0, minute: 0 }) }))
      .filter((summary) => summary.clips.filledDaysCount > 0);
  }, [periods, metadataList, dayShift]);

  return { summaries, refresh };
}
