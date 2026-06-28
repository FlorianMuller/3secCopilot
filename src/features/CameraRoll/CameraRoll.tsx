import * as MediaLibrary from "expo-media-library";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View, ViewToken } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { VideoMetadata } from "../../db/schema";
import { useDayNotes } from "../../hooks/useDayNotes";
import { useMediaLibraryPermissions } from "../../hooks/useMediaLibraryPermissions";
import { useNavigationFocus } from "../../hooks/useNavigationFocus";
import { useVideoLoader } from "../../hooks/useVideoLoader";
import { getEffectiveDate } from "../../services/dayShift";
import { getVideosForDay } from "../../services/dayVideos";
import preferences from "../../services/preferences";
import { getVideoDatetime } from "../../services/videoDatetime";
import { getDaysBetween } from "../../utils/getDaysBetween";
import { groupBy } from "../../utils/groupBy";
import { utilStyles } from "../../utils/utilStyles";
import { DaySection } from "./DaySection";
import { useYearCompletion } from "./hooks/useYearCompletion";
import { YearProgressHeader } from "./YearProgressHeader";

export interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  metadata?: VideoMetadata;
}

// Max concurrent per-day video fetches while eagerly resolving days for the "with videos" filter,
// keeping the camera-roll bridge responsive instead of firing one request per day at once.
const FETCH_CONCURRENCY = 6;

export interface CameraRollProps {
  startDate: Date;
  endDate: Date;
}

export default function CameraRoll({ startDate, endDate }: CameraRollProps) {
  const { dayShift } = preferences.useDayShiftPreference();
  const { ensurePermission } = useMediaLibraryPermissions();
  const { videos, allVideoLoaded, lastDateToDisplay, loadNextBatch, refetchMetadata, updateVideosMetadata } =
    useVideoLoader({
      startDate,
      endDate,
    });

  const { dayNotes, saveDayNote, deleteDayNote } = useDayNotes(startDate, endDate);

  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set());
  const [showOnlyUnselected, setShowOnlyUnselected] = useState(false);
  // Secondary filter, only meaningful while showOnlyUnselected is on: narrow further to days that
  // actually have videos to pick from (i.e. droppable gaps), hiding days with nothing to select.
  const [showOnlyWithVideos, setShowOnlyWithVideos] = useState(false);
  const deferredShowOnlyUnselected = useDeferredValue(showOnlyUnselected);
  const deferredShowOnlyWithVideos = useDeferredValue(showOnlyWithVideos);
  const isFilterStale =
    showOnlyUnselected !== deferredShowOnlyUnselected || showOnlyWithVideos !== deferredShowOnlyWithVideos;

  const handleTogglePrimaryFilter = useCallback(() => {
    setShowOnlyUnselected((v) => !v);
    // The secondary filter only exists alongside the primary one — reset it on every primary toggle.
    setShowOnlyWithVideos(false);
  }, []);

  const {
    selectedDaysCount,
    totalDays,
    selectedDayKeys,
    refresh: refreshCompletion,
  } = useYearCompletion(startDate, endDate, dayShift);

  // Cache of per-day videos for the "unselected only" filter. In that mode the day list comes straight
  // from the DB (all period days minus days that already have a selection), so each day's thumbnails
  // are fetched lazily as it scrolls into view rather than by paging the whole camera roll.
  const [dayVideosCache, setDayVideosCache] = useState<Record<string, PhoneMedia[]>>({});
  const fetchingDaysRef = useRef<Set<string>>(new Set());

  const videoLoading = videos === undefined;

  const handleLoadNextBatch = async () => {
    // Check we have the right permission first
    const hasPermission = await ensurePermission();
    if (!hasPermission) {
      console.error("Media library permission not granted");
      return;
    }

    // Load next batch using the hook
    await loadNextBatch();
  };

  // Use navigation focus hook to detect when page comes into focus
  useNavigationFocus(() => {
    refetchMetadata();
  });

  // Fetch video when component mount
  useEffect(() => {
    handleLoadNextBatch();
  }, []);

  const videosByDay = useMemo(
    () =>
      groupBy(videos || [], (v) =>
        getEffectiveDate(getVideoDatetime(v), dayShift || { hour: 0, minute: 0 }).toDateString()
      ),
    [videos, dayShift]
  );

  const days = useMemo(() => {
    if (lastDateToDisplay === undefined) {
      return [];
    }
    return getDaysBetween(startDate, lastDateToDisplay);
  }, [startDate, lastDateToDisplay]);

  // Handle viewable items changed to track visible days for priority
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const newVisibleDays = new Set<string>();
    viewableItems.forEach((item) => {
      if (item.item && typeof item.item === "object" && "day" in item.item) {
        const dayItem = item.item as { day: Date };
        newVisibleDays.add(dayItem.day.toDateString());
      }
    });
    setVisibleDays(newVisibleDays);
  }, []);

  const viewabilityConfig = {
    viewAreaCoveragePercentThreshold: 10, // Consider item visible when 10% is shown
  };

  const handleSingleMetadataUpdate = useCallback(
    (videoId: string, metadata: VideoMetadata) => {
      updateVideosMetadata({ [videoId]: metadata });
      // Keep the filter cache in sync so an action taken from within the filter (select, hide, trim…)
      // is reflected immediately; refreshCompletion then drops the day if it now has a selection.
      setDayVideosCache((prev) => {
        let changed = false;
        const next: Record<string, PhoneMedia[]> = {};
        for (const [key, vids] of Object.entries(prev)) {
          next[key] = vids.map((v) => {
            if (v.id !== videoId) return v;
            changed = true;
            return { ...v, metadata };
          });
        }
        return changed ? next : prev;
      });
      refreshCompletion();
    },
    [updateVideosMetadata, refreshCompletion]
  );

  const handleDayNoteChange = useCallback(
    (day: Date, note: string | null) => {
      const trimmed = note?.trim();
      if (trimmed) {
        saveDayNote(day, trimmed);
      } else {
        deleteDayNote(day);
      }
    },
    [saveDayNote, deleteDayNote]
  );

  const renderItem = useCallback(
    (props: {
      item: { day: Date; videosOfTheDay: PhoneMedia[]; isVisible: boolean; note?: string; isLoading: boolean };
    }) => (
      <DaySection {...props} onMetadataUpdate={handleSingleMetadataUpdate} onDayNoteChange={handleDayNoteChange} />
    ),
    [handleSingleMetadataUpdate, handleDayNoteChange]
  );

  const listData = useMemo(() => {
    if (deferredShowOnlyUnselected) {
      // Derive the full list of days without a selection from the DB (no camera-roll paging needed);
      // each day's videos are filled in lazily from dayVideosCache as it scrolls into view.
      const unselectedDays = getDaysBetween(startDate, endDate)
        .filter((day) => !selectedDayKeys.has(day.toDateString()))
        .map((day) => {
          const cached = dayVideosCache[day.toDateString()];
          return {
            day,
            videosOfTheDay: cached || [],
            isVisible: visibleDays.has(day.toDateString()),
            note: dayNotes[day.toDateString()],
            // Not in the cache yet means its lazy fetch is still pending — show a spinner, not "no videos".
            isLoading: cached === undefined,
          };
        });

      if (deferredShowOnlyWithVideos) {
        // Keep days still resolving (so they show a spinner) and days that have videos; drop the ones
        // confirmed empty. As the eager fetch below resolves them, empty days fall out of the list.
        return unselectedDays.filter((d) => d.isLoading || d.videosOfTheDay.length > 0);
      }
      return unselectedDays;
    }

    return days.map((day) => ({
      day,
      videosOfTheDay: videosByDay[day.toDateString()] || [],
      isVisible: visibleDays.has(day.toDateString()),
      note: dayNotes[day.toDateString()],
      isLoading: false,
    }));
  }, [
    deferredShowOnlyUnselected,
    deferredShowOnlyWithVideos,
    startDate,
    endDate,
    selectedDayKeys,
    dayVideosCache,
    days,
    videosByDay,
    visibleDays,
    dayNotes,
  ]);

  // While the filter is on, fetch each day's videos (day-shift aware) so the user can pick one. By
  // default only visible days are fetched; with the "with videos" filter on we must resolve every
  // unselected day (visible first) so empty days can be filtered out, throttled by FETCH_CONCURRENCY.
  // Re-runs whenever a fetch lands (dayVideosCache changes), naturally pulling in the next days.
  useEffect(() => {
    if (!deferredShowOnlyUnselected) return;
    const dayByKey = new Map(listData.map((d) => [d.day.toDateString(), d.day]));
    const candidateKeys = deferredShowOnlyWithVideos
      ? [...visibleDays, ...dayByKey.keys()] // visible first, then the rest; dedup handled by the guards below
      : [...visibleDays];

    for (const key of candidateKeys) {
      if (fetchingDaysRef.current.size >= FETCH_CONCURRENCY) break;
      if (dayVideosCache[key] !== undefined || fetchingDaysRef.current.has(key)) continue;
      const day = dayByKey.get(key);
      if (!day) continue;
      fetchingDaysRef.current.add(key);
      getVideosForDay(day, dayShift || { hour: 0, minute: 0 })
        .then((vids) => setDayVideosCache((prev) => ({ ...prev, [key]: vids })))
        .catch((error) => console.error("Failed to load videos for day", key, error))
        .finally(() => fetchingDaysRef.current.delete(key));
    }
  }, [deferredShowOnlyUnselected, deferredShowOnlyWithVideos, visibleDays, listData, dayVideosCache, dayShift]);

  if (videoLoading) {
    return (
      <View style={[utilStyles.centerVertical, utilStyles.hw100]}>
        <MyAppText>loading videos...</MyAppText>
      </View>
    );
  }

  return (
    <FlatList
      style={{ opacity: isFilterStale ? 0.5 : 1 }}
      data={listData}
      renderItem={renderItem}
      keyExtractor={({ day }) => day.toDateString()}
      indicatorStyle="white"
      onEndReached={deferredShowOnlyUnselected || allVideoLoaded ? undefined : handleLoadNextBatch}
      onEndReachedThreshold={300}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      // Let iOS scroll the focused note input above the keyboard
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <YearProgressHeader
          selectedDaysCount={selectedDaysCount}
          totalDays={totalDays}
          showOnlyUnselected={showOnlyUnselected}
          onToggleFilter={handleTogglePrimaryFilter}
          showOnlyWithVideos={showOnlyWithVideos}
          onToggleWithVideos={() => setShowOnlyWithVideos((v) => !v)}
        />
      }
    />
  );
}
