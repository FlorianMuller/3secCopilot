# Export Feature — Technical Spec

> Status: v4 — all decisions confirmed with the user (incl. grilling pass), 2026-07-06
> Scope: the final missing feature — turning a period's selected & trimmed clips into one shareable montage video.

## 0. Where we are (updated 2026-07-07, end of phase-3 session)

- **Phases 1–3: DONE.** Phase 1 (spike) passed on device (§10.1 results). Phase 2 shipped the Export tab (`PeriodList` + `ExportScreen`, §9.1–9.3), sim-verified with screenshots. Phase 3 shipped the real `exportMontage` API (§7) in `modules/expo-montage/`: chunked pipeline with passthrough-video/continuous-audio assemble (§5.2), progress events, cancellation, per-asset degradation to black beats, and the full export flow on `ExportScreen` (progress/cancel/save/share/delete, keep-awake) via `startMontageExport` in `src/services/montage.ts`. Beats and the opening card render as plain black + silence for now.
- **Phase 3 verification status: ✅ complete (forensics passed 2026-07-07).** End-to-end export passes on the iOS simulator — seeded 2026 period (189 items → 7 chunks, incl. beats-only chunks), monotonic progress stream, `DONE durationMs` exactly matching the predicted timeline, output in `Documents/exports/`. ffprobe/frame/audio forensics all PASS: H.264 High 1080p30 + AAC-LC stereo, card/beat frames exact video-range black (Y=16), clip frames real footage, chunk-boundary audio clean (0 click events, sample-count exact), strictly monotonic pts/dts, single-entry edit list. Cancel (via new `EXPO_PUBLIC_AUTO_CANCEL_MS` hook): stops promptly, no partial file, no temp dirs, next export works. No-overwrite: consecutive exports produce distinct timestamped files. Sim peakMB ~820–989 (dev build incl. Metro; device release baseline ~325 MB). Native bugs found & fixed:
  1. `buildChunk` released resolved `AVAsset`s before track insertion — `AVAssetTrack.asset` is a **weak** back-pointer, so `startReading` failed with -11800/-12780. Fix: `ChunkBuild.retainedAssets` holds strong refs until the chunk encode ends.
  2. `AssembleSession` re-armed `requestMediaDataWhenReadyOnQueue` per chunk on the same writer inputs → NSException "cannot be called more than once" (crash on any multi-chunk export). Fix: all chunk readers open upfront; each input armed once with a pump that advances through segments internally.
  3. **Chunk-boundary stutter** (found by forensics): passthrough chunk concat produced 1–2 empty-edit frames + 1 dropped frame per boundary — chunk files carry a B-frame reorder-delay elst shift that the assembler's duration-based retiming ignored (13-entry edit list, duplicate discard-flagged packets, non-monotonic DTS). Fix: `AVVideoAllowFrameReorderingKey: false` in `WriterConfig` (no B-frames; mismatched reorder delays make dense passthrough concat impossible — DTS collision → -11800) + per-segment first-sample anchoring + skipping zero-length edit-boundary marker buffers in `pumpSequence`. Device checklist carries a "confirm no-B-frames encode quality on real footage" item.
  Also fixed (JS): `useUntrimmedDurations` endless refetch loop (`usePeriod` rebuilds period objects each render; effect now keyed on joined clip ids).
- **Phase 4: DONE (sim-verified 2026-07-07, commits `38f11d7` native + `f8be2c8` JS).** Overlays render via `MontageOverlayRenderer` (`modules/expo-montage/ios/MontageOverlay.swift`, UIGraphicsImageRenderer→CIImage, cached per segment): clip date/hour/title/description bottom-left over a rounded scrim (α0.35), missing-day beats show the date over black, opening card centered. Click sound `resources/click.caf` (100 ms, −12.3 dBFS, podspec `resource_bundles` → `ExpoMontage.bundle`) plays at each beat via two paths: AVURLAsset insertion (chunks with real audio) and PCM splicing into synthesized silence (beats-only chunks). API change: clips/beats now take structured `overlay?: ClipOverlay {dateText/hourText/titleText/descriptionText}` (hour rendered smaller); card keeps `overlayLines`. Font sizes = px at renderSize, JS computes them proportional to render height. JS formats with luxon in device locale (hour = locale `TIME_SIMPLE`, from `videoOriginalDate`); no `missingDayClick` pref — always true, beats governed by `exportMissingDays`. Sim-verified frame-by-frame (card/beat/clip/description/hour-on-and-off) + click at beat starts on both audio paths + duration exact (128000 ms), pts monotonic, peakMB ~785. Verification pending: none for phase 4 beyond device items (click loudness on real speakers, scrim legibility on real footage, long-title ellipsis, `ExpoMontage.bundle` resolution in the sideload build — all in the checklist).
- **Next: Phase 5 (preview + polish)** — §9.4 preview mode (first 20 filled days, `mode: "preview"`, cacheDirectory, inline expo-video player, invalidate on option change), `analyzeClips` quality picker + size estimate (§4.1/4.2 — currently the export flow uses fixed 1080p30, check src/services/montage.ts), audio normalization attempt (§11.3), error surfaces, tone-mapping compare (§11.6). `doc/export-device-checklist.md` tracks what only a real device can prove.
- **Sim test harness (used by all phases)**: simulator `verify-iphone` (UDID CF87AEF3-0E77-4405-9663-BC21F5928B06, iOS 18.5) is seeded (15 test videos in Photos, photo permission granted, dev-menu onboarding dismissed). Dev hooks, all `__DEV__`-gated and inlined by Metro from the env of the `expo run:ios` command: `EXPO_PUBLIC_AUTOSEED=1` (re-seeds DB from library on launch, `src/services/devSeed.ts`), `EXPO_PUBLIC_INITIAL_TAB=ExportTab`, `EXPO_PUBLIC_AUTO_OPEN_PERIOD=1`, `EXPO_PUBLIC_AUTO_EXPORT=1` (logs `[autoexport] …` lines incl. a final `DONE path=… durationMs=…`). Full recipe: kill stale Metro on port 8081 first, then `EXPO_BUILD_MODE=dev EXPO_PUBLIC_… npx expo run:ios --device <UDID>`; pull outputs via `xcrun simctl get_app_container <UDID> com.fmuller.3secsDev data`. No headless tap/scroll tooling exists on this machine — drive flows via the hooks.
- Iteration tip: JS changes hot-reload via Metro; Swift changes rebuild fastest from Xcode (`make xcode-open-workspace`, Cmd+R); compile-check the module without a device via `xcodebuild -project ios/Pods/Pods.xcodeproj -target ExpoMontage -sdk iphonesimulator build`.

## 1. Goal

For a chosen period (calendar year or "age" year), stitch every selected daily clip — trimmed according to its metadata — into a single video that opens with a short period title card and walks through the period day by day (including missing days, shown as short blank beats so the sense of time passing is never broken), with optional date/hour/title overlays, then let the user save it to Photos / Files (iCloud) or share it (YouTube app via share sheet).

## 2. Guiding principle: metadata is the source of truth

The montage is computed from `videos_metadata` only:

- **Which clip**: `videoId` (PHAsset id in the camera roll) where `isSelected = 1`, scoped to the period via the effective date `COALESCE(assignedToDate, videoOriginalDate)` run through `getEffectiveDate` (day-shift), using the existing `getSelectedVideosMetadataInRange` (`src/services/metadata.ts:94`).
- **Which segment**: `trimStartTime` / `trimEndTime` — **milliseconds**, nullable (both null = use the full video). Confirmed: `react-native-video-trim` v5's whole API is in ms, so stored values are ms as `doc/database.md` says.
- **Overlay text**: `title` / `description` columns + the effective date.

The files under `documentDirectory/trimmedVideos/` are a playback cache, **not** an input to export. The export pipeline reads the *original* camera-roll asset and cuts the time range during composition — no per-clip intermediate files, single encode from originals, best possible quality (this also resolves the `doc/todo.md` items "Trim again videos with best quality" and "Trim videos on demand"). One accepted exception: slow-mo sources may need a temp-file fallback (see §5.5).

A period can be exported **at any time**, including the current, still-in-progress one. "Missing days" and all completion stats only ever count days up to today (or the period's end, whichever is earlier) — future days are never treated as missing.

## 3. Technology decision

### AVFoundation (native Expo module) — ✅ decided

A local Expo module (`modules/expo-montage/`, Expo Modules API, Swift). Composition via `AVMutableComposition` / `AVMutableVideoComposition`, **encode via `AVAssetReader` + `AVAssetWriter`** (not `AVAssetExportSession` — see below).

Why not ffmpeg (`react-native-video-trim`'s headless `trim()`/`merge()`, or ffmpeg-kit directly):

- ffmpeg-kit was retired in January 2025; binaries were pulled from CocoaPods/npm in April 2025 and the ecosystem now runs on self-hosted forks. Fine for the existing trim-UI dependency, unacceptable as the foundation of the app's core output feature.
- On iOS, ffmpeg runs its filter graph (scale, overlay, concat) on the CPU and can only hardware-accelerate the final encode. AVFoundation keeps the whole pipeline (decode → composite/scale/overlay → encode) on media hardware via VideoToolbox with frames in GPU memory — for a year-scale render that's a several-fold speed and battery difference.
- No text-overlay support in `react-native-video-trim`'s API at all; two encode passes; ~365 intermediate files.
- Pure OS frameworks: ±25 MB smaller IPA, native handling of iPhone-specific footage (HDR/Dolby Vision, slow-mo, rotation metadata).

The only things ffmpeg genuinely offers over AVFoundation — bitrate control and cross-platform determinism — are covered respectively by `AVAssetWriter` (§4) and by `androidx.media3` **Transformer** when Android happens (**a confirmed later goal, not dropped**: same JS API, hardware pipeline, trim + concat + overlays, Kotlin implementation behind it).

Cloud processing stays rejected: uploading GBs of personal daily videos is a privacy and bandwidth non-starter for a sideloaded personal app.

Option-A (`trim()`+`merge()`) remains a possible de-risking fallback for an internal "does end-to-end export work at all" spike; nothing in the shipped UI depends on it.

### Why `AVAssetWriter`, not `AVAssetExportSession`, for the encode

`AVAssetExportSession` presets are fixed pipelines: no bitrate control, dimensions capped by the preset. A year montage is ~18 min of video; the `HighestQuality` preset would produce a **2.5–3.5 GB** file with no way to make it smaller. `AVAssetReader` + `AVAssetWriter` consumes the *same* composition and video-composition objects but drives the encode explicitly (`AVVideoAverageBitRateKey`, H.264 High profile, exact `renderSize`), giving Premiere-class "high quality" output (§4) at roughly half the size. This is the pipeline from day one — no ExportSession phase to migrate away from. (`AVAssetExportSession` survives in exactly one place: nothing — even the final chunk assembly uses a passthrough reader/writer, see §5.2.)

Honest cost: this is the larger native surface. Realistic module size is **~1,000–1,500 lines of Swift** (chunking, cancellation, progress, per-asset error surfaces, empty-range handling, slow-mo sources), not a weekend. The `expo-module` tooling/skill covers the scaffolding; the spike (§10 phase 1) de-risks the hard 20%.

## 4. Quality & encoding — "highest quality" like a Premiere export

The user intent is "always export at highest quality, like a Premiere Pro montage". A Premiere high-quality H.264 export is a *controlled* VBR encode at a visually-transparent bitrate (its YouTube 1080p preset: ~16 Mbps) — not an uncontrolled camera-level bitrate. We replicate exactly that. No user-facing quality/size setting.

### 4.1 Render target — inferred from the footage, not a fixed preset

1. Before showing the export screen's settings, `analyzeClips()` reads the native resolution & frame rate of every selected clip in the period (metadata only, no decode). This is async and takes real seconds at year scale — the export screen shows a loading state until it resolves (§7.2).
2. Pre-select the **most common** (mode) resolution/frame-rate combo as the default render target — deliberately *not* the max, so a single outlier clip (e.g. one 4K import) doesn't drag the whole export's size/time up.
3. Expose a picker listing the **distinct combos actually present** in that period's clips, so the user can bump up to the best quality present or drop down for a lighter/faster export.
4. Computed **fresh each time** the export screen opens — derived data, not a persisted preference. Every clip is rendered into the canvas via aspect-fit (scaled to fit, centered, never cropped or deformed), consistent with the orientation setting.

### 4.2 Encoder settings

- **Container/codec**: H.264 High profile in `.mp4` — the safest universal choice for Photos/Files/YouTube-app sharing.
- **Video bitrate** (`AVVideoAverageBitRateKey`), Premiere-class table owned by JS (it also drives the size estimate) and passed in `MontageSettings`:

  | renderSize | ≤30 fps | 60 fps |
  |---|---|---|
  | 1280×720 | 8 Mbps | 12 Mbps |
  | 1920×1080 | 16 Mbps | 24 Mbps |
  | 3840×2160 | 45 Mbps | 68 Mbps |

  (Portrait uses the same values as its landscape twin.)
- **Audio**: AAC stereo, 256 kbps, 44.1/48 kHz. **No background music in v1** (confirmed) — the montage audio is the clips' own sound plus the missing-day click; a music bed (file picker, ducking, looping, Apple Music DRM constraints) is a possible later feature.
- **Estimated file size** shown on the export screen before export: `(videoBitrate + audioBitrate) × totalDuration` — e.g. a full year at 1080p30 ≈ **~2.2 GB/h → ~700 MB for ~18 min**. Recomputed live as options (missing-day beats, resolution pick) change.
- **HDR/Dolby Vision sources**: v1 output is **SDR BT.709** — confirmed on device that without explicit handling, HLG/BT.2020 sources come out washed out through the reader pipeline. Fix: set the video composition's `colorPrimaries`/`colorTransferFunction`/`colorYCbCrMatrix` to BT.709 (the compositor then tone-maps HDR sources) and tag the writer output with matching `AVVideoColorPropertiesKey`.
- **HDR output — planned post-v1 option (confirmed)**: HLG BT.2020 10-bit **HEVC** on the same architecture (writer/reader configuration change + 10-bit CoreImage overlay path + overlay white-point tuning). Plays as HDR in Photos and on YouTube; visually near-identical to the sources for iPhone footage. True *Dolby Vision* metadata authoring is not available to third-party apps — HLG is the achievable version. Not in v1: the 10-bit path needs its own small device spike and must not delay the SDR pipeline.

## 5. Pipeline architecture

### 5.1 Composition — exactly 2 tracks, hard cuts

Clips join with **hard cuts** — no crossfades (confirmed). A dissolve would require a 4-track A/B architecture and would eat a third of a ~3 s clip in overlap; the cut rhythm *is* the aesthetic of a daily montage. No provision is made for a later crossfade mode.

`AVMutableComposition` with **exactly 2 tracks** (1 video + 1 audio); creating a track per clip breaks around 15–16 tracks. For each day, `insertTimeRange(trimStart…trimEnd)` from the PHAsset's `AVAsset` (via `PHImageManager.requestAVAsset`) directly into those tracks — trimming *is* the insertion, nothing written to disk per clip. `AVMutableVideoComposition` per-segment layer instructions normalize orientation (`preferredTransform`) and aspect-fit into the fixed `renderSize`.

**Clips with no audio track** (screen recordings, muted saves, some imports) get `insertEmptyTimeRange` on the audio track for their span — otherwise the insertion throws or silently desyncs everything after it. Same for missing-day beats when the click is disabled.

### 5.2 Chunking — bounded memory, no boundary clicks

A full year (~365 segments referencing ~365 open `AVAsset`s) in one composition is a memory problem. Internal to the module, invisible to JS apart from the `phase` event field:

1. **Chunk encode**: split the timeline into ~monthly chunks (~31 segments), build a composition per chunk, encode each with identical writer settings → uniform intermediate `.mp4` chunk files.
2. **Assemble**: one final `AVAssetReader`+`AVAssetWriter` pass over the chunk files —
   - **Video: passthrough** (reader/writer inputs with nil output settings — compressed samples copied, no re-encode, fast and lossless).
   - **Audio: decoded and re-encoded in one continuous AAC pass.** Naive passthrough concat of independently-encoded AAC streams produces audible pops/gaps at every chunk boundary (AAC encoder priming samples) — 12 clicks in a year export. One continuous audio encode from the chunk files kills the problem; the extra AAC generation is inaudible for phone audio.

### 5.3 Overlays — CoreImage compositing in the encode loop

~~`AVVideoCompositionCoreAnimationTool` with time-ranged `CATextLayer`s~~ — **ruled out during spike implementation**: `AVAssetReader` rejects any video composition that has an `animationTool` (the CoreAnimation tool is `AVAssetExportSession`-only), so it is fundamentally incompatible with the §3 writer pipeline.

Instead, overlays are composited with **CoreImage between reader and writer**: each clip's overlay text is rendered once into a cached `CIImage` (`CIAttributedTextImageGenerator` + a scrim rectangle), and in the encode loop, frames whose presentation time falls in an overlaid segment get `overlay.composited(over: frame)` rendered into a pool pixel buffer (GPU-backed `CIContext`); frames without an overlay are passed through untouched. This is simpler than a full custom `AVVideoCompositing` compositor and makes missing-day beats trivial: render solid black + text straight into pool buffers, no video source or composition trick needed.

### 5.4 iCloud-offloaded assets

`PHImageManager.requestAVAsset` with `networkAccessAllowed` downloads on demand during export. Downloads are surfaced as their own progress phase (`phase: "download"` in events) so the progress bar doesn't sit frozen on a slow connection while "encoding" (§6). Never blocks or forces Wi-Fi; pre-flight shows count + estimated download size (§7.2).

### 5.5 Slow-mo sources

`requestAVAsset` returns an `AVComposition` for slow-mo assets, and inserting time ranges *from* a composition *into* another composition is a known AVFoundation rough edge. Spike item; if in-place insertion fails, the accepted fallback is exporting slow-mo clips to a temp file first (the *only* dent in the no-intermediate-files principle, affecting only slow-mo days).

Playback keeps the Photos-style slow-motion ramp (confirmed) — that's the timeline the trim UI showed, so stored trim times stay accurate for free. Explicitly **best-effort / low priority**: no slow-mo clip is currently selected, so a spike failure here blocks nothing.

### 5.6 Live Photos

Found on device: selected "videos" can be **Live Photos** — image-type `PHAsset`s whose video half is unreachable via `requestAVAsset` (it errors). They are supported by extracting the paired video resource (`PHAssetResource`, `.fullSizePairedVideo` falling back to `.pairedVideo`) to a temp file — the same accepted temp-file exception as slow-mo (§5.5). Surfaced as a non-fatal warning; pre-flight (§9.2) should count them.

## 6. Timeline beats — opening title card & missing days

### 6.1 Opening title card

The montage opens with a **~2 s title card** (confirmed): the period label (from `usePeriod`, e.g. « 2025 ») over black, rendered with the same solid-background + text-layer machinery as missing-day beats — larger font, centered, no click sound. Always on in v1, no toggle. No closing card — the last day ending the video is the natural stop.

### 6.2 Missing days — always part of the timeline, never grouped

Each missing day within the exportable range gets its **own** short beat — a run of 3 missing days is 3 separate beats, not one summary card. The goal is to preserve the day-by-day sense of time passing, not collapse gaps.

- **Visual**: solid black background (v1). Possible later: a user-chosen custom image/color for all missing-day beats.
- **Duration**: configurable (`exportMissingDayDurationMs`), default ~500 ms — deliberately quick, a "blip" rather than a pause.
- **Audio**: a short click/tick sound (bundled in the module's resources) plays during the beat, so the silence doesn't read as a glitch. Exclusive to missing-day beats — filled days keep only their own clip audio.
- **On/off**: user-configurable (`exportMissingDays`: `show` | `skip`). Default `show`.
- **Overlays**: if the date overlay is enabled, missing-day beats show the date too (over black), same as real clips — lets you know *which* day is missing as you watch. Hour/title don't apply.

## 7. Native module API (draft)

Overlay strings are computed **in JS** (luxon, **device locale** — confirmed; French dates on a French device, correct elsewhere) — the native side just renders what it's given. The bitrate table lives in JS too (§4.2), so JS can show the size estimate and the native side stays a dumb renderer.

```ts
// modules/expo-montage/src/index.ts

// Cheap metadata scan (async, seconds at year scale), used to build the
// quality picker + compute the default render target
export function analyzeClips(
  assetIds: string[]
): Promise<{ assetId: string; width: number; height: number; fps: number }[]>;

type MontageClip =
  | {
      type: "video";
      assetId: string;            // PHAsset localIdentifier (= videoId)
      startMs: number | null;     // null = from 0 (clamping rules: §8)
      endMs: number | null;       // null = to end
      overlayLines?: string[];    // pre-formatted, e.g.:
                                   // ["Lundi 4 juin 12h39 - Plage avec Léo", "Première baignade de l'été"]
    }
  | {
      type: "missingDay";         // ONE beat per missing day — never grouped
      durationMs: number;         // from exportMissingDayDurationMs pref
      overlayLines?: string[];    // date-only line, only if date overlay enabled
    }
  | {
      type: "card";               // opening title card (§6.1) — same renderer as
      durationMs: number;         //   missingDay: text over black, no click,
      overlayLines: string[];     //   cardFontSize, centered; e.g. ["2025"]
    };

type MontageSettings = {
  renderSize: { width: number; height: number }; // orientation + chosen resolution combo (§4.1)
  fps: number;                                   // chosen frame rate (§4.1)
  videoAverageBitrate: number;                   // bps, from the JS bitrate table (§4.2)
  audioBitrate: number;                          // bps
  missingDayClick: boolean;                      // play the bundled click on missingDay beats
  mode: "preview" | "full";                      // preview = fast/low-res internal draft, decoupled
                                                  // from the renderSize/fps the user chose — purely for
                                                  // render speed during the 20-day sanity check
  overlay?: {
    position: "bottomLeft";
    cardFontSize: number;   // opening title card, centered
    dateFontSize: number;
    hourFontSize: number;   // smaller than dateFontSize — de-emphasized
    titleFontSize: number;
    descriptionFontSize: number;
  };
  outputPath: string;                            // file:// under documentDirectory/exports/
};

export function exportMontage(clips: MontageClip[], settings: MontageSettings): Promise<{ taskId: string }>;
export function cancelExport(taskId: string): Promise<void>;
// Events: onExportProgress { taskId, progress: 0–1, phase: "download" | "chunk" | "assemble" },
//         onExportComplete { taskId, outputPath, durationMs },
//         onExportError { taskId, message, failedAssetId? }
```

Chunking is an internal detail of the module (`chunk encode → passthrough-video / continuous-audio assemble`, §5.2), invisible to JS apart from the `phase` field.

### Overlay format

Bottom-left corner, with a subtle scrim/shadow for readability over any footage (or over black, for missing days):

```
Lundi 4 juin 12h39 - <title>      ← hour rendered in a smaller font than the date, de-emphasized
<Description>                      ← second line, only if present
```

Treated as a first draft — easy to nudge (position, sizes, colors) once visible in the in-app preview.

## 8. Export pipeline (JS service layer)

New `src/services/montage.ts`:

1. `getSelectedVideosMetadataInRange(period.endDate, period.startDate)` → sort ascending by effective date, capped at today.
2. `analyzeClips()` over the selected asset ids → compute the default resolution/fps (mode) and the picker's option list (loading state while it runs).
3. Pre-flight validation: each `videoId` still resolves via `expo-media-library` (deleted → report, treated as missing-day if continuing — **the DB row is never modified**, confirmed: the asset may reappear via iCloud restore; accepted quirk: completion stats elsewhere still count the day as filled); flag iCloud-only assets with estimated download size; free disk space check against the estimated output + chunk overhead.
4. **Trim clamping** (assets can be re-edited in Photos after trimming, changing their duration): clamp `startMs` to `[0, assetDuration)`, `endMs` to `(startMs, assetDuration]`; if the clamped range is empty or inverted, fall back to the full clip. The native side applies the same defensive clamping — a bad trim must never abort an export at day 214.
5. Build the day timeline with `getDaysBetween`; prepend the opening title card (§6.1); map each day → `video` or `missingDay` clip (one per missing day, never grouped); apply options → `MontageClip[]` (overlay strings formatted here with luxon in the device locale, per the §7 format).
6. Compute and display the estimated file size (§4.2).
7. Call `exportMontage`, forward events to the progress UI.

## 9. UX spec

### 9.1 Middle tab — period list

Replace the `Preview` placeholder (`src/features/Preview/Preview.tsx`) with a native-stack navigator (same pattern as CameraRoll/Options), and **rename the tab label to "Export"** (was "Preview" — that name now collides with the in-screen preview button and undersells what the tab does):

```
Export tab
├── PeriodList        — one row per period that has ≥1 selected video
└── ExportScreen      — stats + options + preview + export for one period
```

`PeriodList` rows (reuse `usePeriod`, `useYearCompletion`): period label, completion `X/Y days`, total montage duration (Σ trim durations), a thumbnail (first selected clip via `expo-video-thumbnails`). Tap → `ExportScreen(period)`.

### 9.2 ExportScreen — stats

Header card (reuse `Card`/`OptionSection` components from Options). Shows a loading state until `analyzeClips` resolves (§4.1).

- Completion: days filled / total days up to today (never counting future days).
- Missing days count (and the list, expandable).
- Total montage duration (recomputed live as options change — missing-day beats and the opening card add time too) + **estimated file size** (§4.2).
- Untrimmed-clip count (clips whose full duration will be used) — a soft warning.
- **Pre-flight warnings**, computed before allowing export:
  - Selected clips whose asset no longer exists in the Photos library (deleted since selection) — count shown; if the user proceeds, these render as missing-day beats.
  - Selected clips not yet downloaded locally (iCloud-optimized storage) — count + estimated total download size. Never blocks or forces Wi-Fi; downloaded on demand during export (§5.4).

### 9.3 Export options

Persisted with the existing preferences factory (`createPreferencesFunctions`, one line each in `preferences.ts`) — **global defaults, shared across all periods**, updated in place whenever changed on the export screen. **Not surfaced in the main Settings/Options tab** — they only live inline in the Export flow.

| Option | Type | Default |
|---|---|---|
| `exportShowDate` | boolean | true |
| `exportShowHour` | boolean | false |
| `exportShowTitle` | boolean (title/description overlay) | true |
| `exportMissingDays` | enum `show` \| `skip` | `show` |
| `exportMissingDayDurationMs` | number | 500 |
| `exportOrientation` | enum `landscape` \| `portrait` (sets `renderSize` 1920×1080 or 1080×1920) | `landscape` |

Resolution/frame-rate is **not** a persisted preference — see §4.1; per-period computed default with a session-local override. There is deliberately **no quality/size setting** — the encode is always "highest quality, Premiere-class" (§4.2); the size estimate keeps it honest.

### 9.4 Preview

"Preview" button → runs the *same* pipeline in `mode: "preview"` (fast/low-res internal draft, independent of the chosen final resolution) over the **first 20 filled days** of the period, plus the opening card and every missing-day beat falling between those days (confirmed — always shows real footage even when the period starts sparse; the whole period if fewer than 20 days are filled; fixed window, no scrubbing in v1), output to `cacheDirectory`, played inline with `expo-video`. This shows overlays, missing-day beats, and orientation/scaling exactly as the final render will — a seek-based JS playback simulation could not. Invalidate the cached preview whenever options change.

### 9.5 Compute & deliver

- "Create the video" button → progress screen: progress bar (phase- and chunk-weighted; downloads shown as their own phase, §5.4), cancel button, `expo-keep-awake` (new small dep) so the screen never sleeps. **The app must stay in the foreground** — the writer session is killed on backgrounding; say so in the UI. Accepted for v1 (no background/resumable export; chunking already gives natural resume points for a future version).
- Output: `documentDirectory/exports/<periodId>-<timestamp>.mp4`. Always a new file, never overwritten or auto-deleted. Because `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` are already set, exports are directly visible in the Files app. **No in-app export history/management screen in v1** — planned later; until then, Files app / `CacheOptionSection` is how you browse/clean up past exports.
- Done screen: **Save to Photos** (`expo-media-library.saveToLibraryAsync`), **Share** (`expo-sharing.shareAsync`, same pattern as `databaseBackup.ts` — reaches iCloud Drive, AirDrop, and the YouTube app's upload extension), **Delete**.

## 10. Phasing

1. **Spike (de-risk)** — ✅ **PASSED on device, 2026-07-07** (iPhone 15 Pro): 24.7 s of 1080p60 footage encoded in 9 s (~2.7× realtime → a full-year ~18 min montage projects to ~7 min), peak memory ~325 MB, repeated runs stable, audio in sync, overlays correct, Live Photos handled, HDR tone-mapped (slight residual flatness — see §11.6). Original checklist:
   - **(a) Writer pipeline & size**: concat 3 PHAssets with time ranges via `AVAssetReader`+`AVAssetWriter` at a §4.2 bitrate; verify quality visually and measure MB/min against the estimate.
   - **(b) Overlays**: one text overlay over one clip via CoreImage compositing in the encode loop (§5.3) — verify position, readability, and per-frame render cost. (The CATextLayer/CoreAnimationTool route is already ruled out: incompatible with `AVAssetReader`.)
   - **(c) Audio edge cases**: include one audio-less clip (`insertEmptyTimeRange` path) and verify the chunk-assemble audio strategy produces no boundary click (§5.2).
   - **(d) iPhone-specific sources**: one HDR/Dolby-Vision clip (tone-mapping) and one slow-mo clip (`AVComposition` insertion or temp-file fallback, §5.5).
2. **UI shell**: PeriodList + ExportScreen with stats & options (pure JS, ships without the module).
3. **Export MVP**: full-period export without overlays; chunked pipeline, progress, cancel, save/share; pre-flight checks (deleted/iCloud assets); trim clamping.
4. **Beats & overlays**: date/hour/title layers (real clips + missing-day beats), opening title card, click sound.
5. **Preview** + polish: quality analysis/picker, size estimates, audio normalization (attempt if not too complex — otherwise defer), error surfaces.

## 11. Open items carried into the spike (technical unknowns, not user decisions)

1. **HDR / slow-mo sources** — spike item 1(d) above.
2. **CoreImage overlay render cost** — spike item 1(b); if per-frame compositing measurably slows the encode, fall back to a custom `AVVideoCompositing` compositor. (CATextLayer/CoreAnimationTool is ruled out — incompatible with `AVAssetReader`.)
3. **Audio normalization feasibility**: simple per-clip gain normalization (measure peak/average level, apply an `AVAudioMix` volume ramp) is the plan; confirm during the polish phase it doesn't balloon in complexity (true loudness/LUFS normalization is out of scope).
4. **Preview-mode encoder shortcuts**: how low can the preview render (resolution/bitrate/fps) go while staying representative of overlay layout and scaling.
5. **Encode-loop memory** (root-caused and fixed on device): the reader→writer pump processes hundreds of ~8 MB BGRA frames per callback; without a per-frame `autoreleasepool` they accumulate → jetsam OOM kill (no crash log, no JS error — the earlier `Cannot Complete Action` / media-services errors were the memory-pressure prelude). Fixed with per-frame autorelease draining; `peakMemoryMB` is measured (`task_vm_info.phys_footprint`) and returned with every export so regressions are visible. Spike result: ~325 MB peak at 1080p60. Verify it stays flat at year scale; next lever if not: 420 biplanar pixel format instead of BGRA (~2.6× smaller frames).
6. **Tone-mapping quality**: the BT.709 output is correct but reads slightly flatter/milkier than the HDR originals on an HDR screen. Partly inherent to SDR (fully solved only by the post-v1 HDR output option, §4.2); partly the compositor's conversion operator. During polish, compare against a CoreImage tone-mapping pass (`CIToneMapHeadroom`) or `VTPixelTransferSession` conversion for a contrastier SDR result.

## 12. Follow-on simplification (out of scope, enabled by this)

Once export no longer consumes trimmed files, `documentDirectory/trimmedVideos/` exists only for player playback. Later: play trimmed segments with `expo-video` via seek + `timeUpdate` boundaries (no playlist API exists, but single-clip segment playback is trivial), then delete the trim-file cache and the `reTrimVideo` path entirely. `react-native-video-trim` remains only as the trim *UI*.
