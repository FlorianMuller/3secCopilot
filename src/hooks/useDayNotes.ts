import { useCallback, useEffect, useState } from "react";
import {
  deleteDayNote as deleteDayNoteService,
  getDayNotesInRange,
  saveDayNote as saveDayNoteService,
} from "../services/dayNotes";

/**
 * Owns the in-memory map of per-day notes (keyed by `day.toDateString()`) so
 * that the camera roll re-renders when a note is added, edited or removed.
 * Notes are loaded for the configured [startDate, endDate] window.
 */
export function useDayNotes(startDate: Date, endDate: Date) {
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});

  // Load once on mount. The camera roll remounts (via `key`) when the period
  // changes, and `startDate`/`endDate` are fresh Date instances on every render,
  // so depending on them here would refetch constantly and clobber optimistic
  // updates — mirror how `useVideoLoader` loads its first batch.
  useEffect(() => {
    getDayNotesInRange(startDate, endDate).then(setDayNotes);
  }, []);

  const saveDayNote = useCallback(async (day: Date, note: string) => {
    await saveDayNoteService(day, note);
    setDayNotes((prev) => ({ ...prev, [day.toDateString()]: note }));
  }, []);

  const deleteDayNote = useCallback(async (day: Date) => {
    await deleteDayNoteService(day);
    setDayNotes((prev) => {
      const next = { ...prev };
      delete next[day.toDateString()];
      return next;
    });
  }, []);

  return { dayNotes, saveDayNote, deleteDayNote };
}
