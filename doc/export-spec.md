# Export Feature — Technical Exploration & Spec

> Status: v2 — decisions confirmed with the user, 2026-07-06
> Scope: the final missing feature — turning a period's selected & trimmed clips into one shareable montage video.

## 1. Goal

For a chosen period (calendar year or "age" year), stitch every selected daily clip — trimmed according to its metadata — into a single video that walks through the period day by day (including missing days, shown as short blank beats so the sense of time passing is never broken), with optional date/hour/title overlays, then let the user save it to Photos / Files (iCloud) or share it (YouTube app via share sheet).

## 2. Guiding principle: metadata is the source of truth

The montage is computed from `videos_metadata` only:

- **Which clip**: `videoId` (PHAsset id in the camera roll) where `isSelected = 1`, scoped to the period via the effective date `COALESCE(assignedToDate, videoOriginalDate)` run through `getEffectiveDate` (day-shift), using the existing `getSelectedVideosMetadataInRange` (`src/services/metadata.ts:94`).
- **Which segment**: `trimStartTime` / `trimEndTime` — **milliseconds**, nullable (both null = use the full video). Confirmed: `react-native-video-trim` v5's whole API is in ms, so stored values are ms as `doc/database.md` says.
- **Overlay text**: `title` / `description` columns + the effective date.

The files under `documentDirectory/trimmedVideos/` are a playback cache, **not** an input to export. The export pipeline reads the *original* camera-roll asset and cuts the time range during composition — no intermediate trimmed files, no double re-encode, best possible quality (this also resolves the `doc/todo.md` items "Trim again videos with best quality" and "Trim videos on demand").

A period can be exported **at any time**, including the current, still-in-progress one. "Missing days" and all completion stats only ever count days up to today (or the period's end, whichever is earlier) — future days are never treated as missing.

## 3. Technical options considered

### Option A — `react-native-video-trim` headless `trim()` + `merge()`

The lib is already a dependency and v5 exposes programmatic `trim(url, {startTime, endTime})` and `merge(urls)` (hardware-encoded, auto resolution/fps normalization), plus `saveToPhoto` / `share`.

- ✅ Zero new native code; fastest path to *a* result.
- ❌ **No text overlays** → "show date/hour/title" and missing-day beats are impossible.
- ❌ Two encode passes (trim each clip, then merge re-encodes again) → slower, quality loss, ~365 intermediate files.
- ❌ Supply-chain risk: it is built on ffmpeg-kit, which was [retired in January 2025](https://tanersener.medium.com/saying-goodbye-to-ffmpegkit-33ae939767e1); binaries were pulled from CocoaPods/npm in April 2025 and the ecosystem now runs on self-hosted forks. Fine for the existing trim-UI feature, shaky as the foundation of the app's core output feature.

### Option B — Native Expo module wrapping AVFoundation ✅ **decided**

A small local Expo module (`modules/expo-montage/`, Expo Modules API, Swift) doing single-pass composition:

- `AVMutableComposition` with **exactly 2 tracks** (1 video + 1 audio). For each day, `insertTimeRange(trimStart…trimEnd)` from the PHAsset's `AVAsset` (via `PHImageManager.requestAVAsset`) directly into those tracks. Trimming *is* the insertion — nothing written to disk per clip.
- `AVMutableVideoComposition` per-segment layer instructions to normalize orientation (`preferredTransform`) and scale mixed resolutions to a fixed `renderSize` (aspect-fit: scaled to fit, centered, never cropped or deformed).
- `AVVideoCompositionCoreAnimationTool` with time-ranged `CATextLayer`s for date/hour/title overlays over real clips **and** over missing-day beats (solid color background instead of video).
- One `AVAssetExportSession` encode (H.264, highest-quality preset), `progress` polled and streamed to JS as events; cancellable.

- ✅ Matches the source-of-truth principle exactly; single encode from originals; overlays natively; no third-party binaries at all — pure OS frameworks, immune to the ffmpeg-kit situation.
- ✅ **Performance**: the whole pipeline (decode → composite/scale/overlay → encode) runs on media hardware via VideoToolbox with frames staying in GPU memory. ffmpeg on iOS runs its filter graph (scale, overlay, concat) on the CPU and can only hardware-accelerate the final encode — for a year-scale render that's a several-fold speed and battery difference. Also ±25 MB smaller IPA, and native handling of iPhone-specific footage (HDR/Dolby Vision, slow-mo, rotation metadata).
- ✅ The project already uses expo-dev-client + prebuild, and distribution is iOS-only (SideStore), so an iOS-only Swift module has no downside today. **Android is a confirmed later goal, not dropped**: `androidx.media3` **Transformer** is the platform-native counterpart (hardware pipeline, trim + concat + overlays) — same JS API (`exportMontage`/`analyzeClips`/events), a Kotlin implementation behind it when the time comes. No ffmpeg dependency is introduced for either platform.
- ❌ It's new native code (~300–500 lines of Swift) — the one real cost. The `expo-module` tooling/skill covers the scaffolding.
- ⚠️ Known constraint: keep segments in the *same two tracks* (creating a track per clip breaks around 15–16 tracks). For a full year (~365 segments), export **in chunks** (e.g. monthly, ~31 segments) to bound memory, then concatenate the uniform chunks with `AVAssetExportPresetPassthrough` (fast, lossless since chunks share one encode format).

### Option C — Cloud processing

Rejected: uploading GBs of personal daily videos is a privacy and bandwidth non-starter for a sideloaded personal app, and it adds hosting cost/complexity.

**Decision: Option B**, confirmed. Option A remains a possible de-risking fallback for an internal "does end-to-end export work at all" spike, but nothing in the shipped UI depends on it.

## 4. Missing days — always part of the timeline, never grouped

Each missing day within the exportable range gets its **own** short beat — a run of 3 missing days is 3 separate beats, not one summary card. The goal is to preserve the day-by-day sense of time passing, not collapse gaps.

- **Visual**: solid black background (v1). Possible later: a user-chosen custom image/color used for all missing-day beats.
- **Duration**: configurable (`exportMissingDayDurationMs`), default ~500 ms — deliberately quick, a "blip" rather than a pause.
- **Audio**: a short click/tick sound plays during the beat, so the silence doesn't read as a glitch. The click is exclusive to missing-day beats — filled days keep only their own clip audio, no rhythmic click is added there.
- **On/off**: still user-configurable (`exportMissingDays`: `show` | `skip`) — some users may prefer the gap silently skipped. Default `show`.
- **Overlays**: if the date overlay is enabled, missing-day beats show the date too (over black), same as real clips — lets you know *which* day is missing as you watch. Hour/title obviously don't apply (nothing happened that day).

## 5. Quality — inferred from the footage, not a fixed preset

No fixed "1080p/720p" quality tiers. Instead:

1. Before showing the export screen's settings, analyze the native resolution & frame rate of every selected clip in the period (cheap metadata read, no decode).
2. Pre-select the **most common** (mode) resolution/frame-rate combo found as the default render target — deliberately *not* the max, so a single outlier clip (e.g. one 4K import from another app) doesn't drag the whole export's size/time up.
3. Expose a picker listing the **distinct combos actually present** in that period's clips (not an arbitrary fixed list), so the user can bump up to the best quality present, or drop down for a lighter/faster export.
4. This is computed **fresh each time** the export screen opens for that period — it's derived data, not a persisted preference. Every clip is rendered into that canvas via aspect-fit (scaled to fit, centered, never cropped/deformed), consistent with the orientation setting.
5. Output is always **H.264 in an `.mp4` container** — the safest universal choice for Photos/Files/YouTube-app sharing.

## 6. Native module API (draft)

Overlay strings are computed **in JS** (luxon, localization) — the native side just renders what it's given.

```ts
// modules/expo-montage/src/index.ts

// Cheap metadata scan, used to build the quality picker + compute the default
export function analyzeClips(
  assetIds: string[]
): Promise<{ assetId: string; width: number; height: number; fps: number }[]>;

type MontageClip =
  | {
      type: "video";
      assetId: string;            // PHAsset localIdentifier (= videoId)
      startMs: number | null;     // null = from 0
      endMs: number | null;       // null = to end
      overlayLines?: string[];    // pre-formatted, e.g.:
                                   // ["Lundi 4 juin 12h39 - Plage avec Léo", "Première baignade de l'été"]
    }
  | {
      type: "missingDay";         // ONE beat per missing day — never grouped
      durationMs: number;         // from exportMissingDayDurationMs pref
      overlayLines?: string[];    // date-only line, only if date overlay enabled
      playClick: true;
    };

type MontageSettings = {
  renderSize: { width: number; height: number }; // orientation + chosen resolution combo (see §5)
  fps: number;                                   // chosen frame rate (see §5)
  mode: "preview" | "full";                      // preview = fast/low-res internal draft, decoupled
                                                  // from the renderSize/fps the user chose — purely for
                                                  // render speed during the 20-day sanity check
  overlay?: {
    position: "bottomLeft";
    dateFontSize: number;
    hourFontSize: number;   // smaller than dateFontSize — de-emphasized
    titleFontSize: number;
    descriptionFontSize: number;
  };
  outputPath: string;                            // file:// under documentDirectory/exports/
};

export function exportMontage(clips: MontageClip[], settings: MontageSettings): Promise<{ taskId: string }>;
export function cancelExport(taskId: string): Promise<void>;
// Events: onExportProgress { taskId, progress: 0–1, phase: "chunk" | "assemble" },
//         onExportComplete { taskId, outputPath, durationMs },
//         onExportError { taskId, message, failedAssetId? }
```

Chunking is an internal detail of the module (`chunk → passthrough-concat`), invisible to JS apart from the `phase` field.

### Overlay format

Bottom-left corner, with a subtle scrim/shadow for readability over any footage (or over black, for missing days):

```
Lundi 4 juin 12h39 - <title>      ← hour rendered in a smaller font than the date, de-emphasized
<Description>                      ← second line, only if present
```

Treated as a first draft — easy to nudge (position, sizes, colors) once visible in the in-app preview.

## 7. UX spec

### 7.1 Middle tab — period list

Replace the `Preview` placeholder (`src/features/Preview/Preview.tsx`) with a native-stack navigator (same pattern as CameraRoll/Options), and **rename the tab label to "Export"** (was "Preview" — that name now collides with the in-screen preview button and undersells what the tab does):

```
Export tab
├── PeriodList        — one row per period that has ≥1 selected video
└── ExportScreen      — stats + options + preview + export for one period
```

`PeriodList` rows (reuse `usePeriod`, `useYearCompletion`): period label, completion `X/Y days`, total montage duration (Σ trim durations), a thumbnail (first selected clip via `expo-video-thumbnails`). Tap → `ExportScreen(period)`.

### 7.2 ExportScreen — stats

Header card (reuse `Card`/`OptionSection` components from Options):

- Completion: days filled / total days up to today (never counting future days).
- Missing days count (and the list, expandable).
- Total montage duration (recomputed live as options change — missing-day beats add time too).
- Untrimmed-clip count (clips whose full duration will be used) — a soft warning.
- **Pre-flight warnings**, computed before allowing export:
  - Selected clips whose asset no longer exists in the Photos library (deleted since selection) — count shown; if the user proceeds, these render as missing-day beats.
  - Selected clips not yet downloaded locally (iCloud-optimized storage) — count + estimated total size to download. Never blocks or forces Wi-Fi; `PHImageManager` downloads on demand during export.

### 7.3 Export options

Persisted with the existing preferences factory (`createPreferencesFunctions`, one line each in `preferences.ts`) — **global defaults, shared across all periods**, updated in place whenever changed on the export screen. **Not surfaced in the main Settings/Options tab** — they only live inline in the Export flow.

| Option | Type | Default |
|---|---|---|
| `exportShowDate` | boolean | true |
| `exportShowHour` | boolean | false |
| `exportShowTitle` | boolean (title/description overlay) | true |
| `exportMissingDays` | enum `show` \| `skip` | `show` |
| `exportMissingDayDurationMs` | number | 500 |
| `exportOrientation` | enum `landscape` \| `portrait` (sets `renderSize` 1920×1080 or 1080×1920) | `landscape` |

Resolution/frame-rate is **not** a persisted preference — see §5; it's a per-period computed default with a session-local override.

### 7.4 Preview

"Preview (first 20 days)" button → runs the *same* pipeline in `mode: "preview"` (fast/low-res internal draft, independent of the chosen final resolution) over the first ~20 days of the period (fixed — no scrubbing to arbitrary windows in v1), output to `cacheDirectory`, played inline with `expo-video`. This shows overlays, missing-day beats, and orientation/scaling exactly as the final render will — a seek-based JS playback simulation could not. Invalidate the cached preview whenever options change.

### 7.5 Compute & deliver

- "Create the video" button → progress screen: progress bar (chunk-weighted), cancel button, `expo-keep-awake` (new small dep) so the screen never sleeps during export. **The app must stay in the foreground** — `AVAssetExportSession` is killed on backgrounding; say so in the UI. Accepted for v1 (no background/resumable export). (Future: background task / resumable chunks — chunking already gives natural resume points.)
- Output: `documentDirectory/exports/<periodId>-<timestamp>.mp4`. Always a new file, never overwritten or auto-deleted. Because `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` are already set, exports are directly visible in the Files app. **No in-app export history/management screen in v1** — planned as a later feature; until then, Files app / `CacheOptionSection` is how you browse/clean up past exports.
- Done screen: **Save to Photos** (`expo-media-library.saveToLibraryAsync`), **Share** (`expo-sharing.shareAsync`, same pattern as `databaseBackup.ts` — reaches iCloud Drive, AirDrop, and the YouTube app's upload extension), **Delete**.

## 8. Export pipeline (JS service layer)

New `src/services/montage.ts`:

1. `getSelectedVideosMetadataInRange(period.endDate, period.startDate)` → sort ascending by effective date, capped at today.
2. `analyzeClips()` over the selected asset ids → compute the default resolution/fps (mode) and the picker's option list.
3. Pre-flight validation: each `videoId` still resolves via `expo-media-library` (deleted → report, treated as missing-day if continuing); flag iCloud-only assets with an estimated download size; free disk space check.
4. Build the day timeline with `getDaysBetween`; map each day → `video` or `missingDay` clip (one per missing day, never grouped); apply options → `MontageClip[]` (overlay strings formatted here with luxon, per the §6 format).
5. Call `exportMontage`, forward events to the progress UI.

## 9. Follow-on simplification (out of scope, enabled by this)

Once export no longer consumes trimmed files, `documentDirectory/trimmedVideos/` exists only for player playback. Later: play trimmed segments with `expo-video` via seek + `timeUpdate` boundaries (no playlist API exists, but single-clip segment playback is trivial), then delete the trim-file cache and the `reTrimVideo` path entirely. `react-native-video-trim` remains only as the trim *UI*.

## 10. Phasing

1. **Spike (de-risk)**: minimal `expo-montage` module — concat 3 PHAssets with time ranges, no overlays; verify on device (quality, orientation handling, HDR/slow-mo source behavior, timing). *Go/no-go for Option B; fallback = Option A MVP.*
2. **UI shell**: PeriodList + ExportScreen with stats & options (pure JS, ships without the module).
3. **Export MVP**: full-period export without overlays; progress, cancel, save/share; pre-flight checks (deleted/iCloud assets).
4. **Missing-day beats & overlays**: date/hour/title layers (real clips + missing-day beats), click sound, chunked year-scale export.
5. **Preview** + polish: quality analysis/picker, audio normalization (attempt if not too complex — otherwise defer), size estimates, error surfaces.

## 11. Open items carried into the spike (not user decisions — technical unknowns)

1. **HDR / slow-mo sources**: iPhone HEVC/Dolby-Vision clips mixed with SDR — pick an export preset and verify tone-mapping in the spike; slow-mo assets need their `AVComposition` handled (they resolve fine via `requestAVAsset`, but verify visually).
2. **Audio normalization feasibility**: simple per-clip gain normalization (measure peak/average level, apply an `AVAudioMix` volume ramp) is the plan; confirm during the polish phase it doesn't balloon in complexity (true loudness/LUFS normalization would be out of scope).
