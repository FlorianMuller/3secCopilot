# Export feature — device review checklist

> For Florian's final review on a real iPhone. Everything below is already verified on the
> iOS simulator (functional behavior, screenshots, output-file inspection); these items are
> the ones a simulator fundamentally cannot prove. Updated by Claude after each phase.

## Phase 2 — Export tab UI shell (✅ sim-verified 2026-07-07)

- [ ] Export tab: PeriodList shows your real periods (calendar + "age" grouping mode) with
      correct completion counts and thumbnails from the real library.
- [ ] ExportScreen stats look right for a real, sparse year (missing-day list expands, totals
      plausible), and the Preview / "Create the video" buttons are reachable by scrolling past
      the floating tab bar.
- [ ] Options persist across app restarts and are shared between periods.

## Phase 3 — Export MVP (✅ sim-verified end-to-end 2026-07-07; forensics ✅ passed 2026-07-07)

Sim-proven: full chunked export of a 188-day period (7 chunks incl. beats-only ones),
duration exactly as predicted, monotonic progress, error surfacing, temp cleanup.
Forensics pass (ffprobe/frame/audio): H.264 High 1080p30 + AAC confirmed, card/beat
frames exact black (Y=16), no boundary clicks (digital-zero silence, 0 click events),
strictly monotonic pts/dts, single-entry edit list, cancel + no-overwrite verified.
Found & fixed: chunk-boundary stutter (1–2 empty-edit frames + 1 dropped frame per
boundary, from B-frame reorder delay vs duration-based retiming) — writer now encodes
with frame reordering disabled (no B-frames) + per-segment first-sample anchoring.
Device items:

- [ ] Export a real period: encode speed & battery on real hardware (VideoToolbox; the
      sim used its software encoder), peak memory at year scale (device release spike
      baseline: ~325 MB — the `peakMB` value is in the done screen / autoexport log).
- [ ] iCloud-offloaded assets: export with iCloud-optimized storage, watch the
      "Downloading…" phase, try on cellular.
- [ ] Real footage correctness: HDR (tone-mapped, not washed out), slow-mo, Live Photos,
      portrait/landscape mix, a clip re-edited in Photos after trimming (clamping).
- [ ] Cancel mid-export (mid-download and mid-encode): returns to idle, no partial file
      in Documents/exports, no leftover montage-* dirs in tmp (Files app shows both).
- [ ] Done screen: Save to Photos, Share (YouTube app target), Delete. Two consecutive
      exports produce two files (no overwrite).
- [ ] Keep-awake: screen stays on during a long export; backgrounding kills the export
      with a sane error (accepted v1 behavior, §9.5).
- [ ] Audio: clip sound plays, silent clips stay silent, listen at ~monthly chunk
      boundaries for pops/clicks (§5.2 continuous-AAC design; sim seed had silence at
      most boundaries — listen with real clip audio spanning a boundary).
- [ ] Quality of the no-B-frames encode (forensics fix disabled frame reordering) on
      real 1080p/4K footage at the §4.2 bitrates — confirm still "Premiere-class"
      visually and that file size stays near the estimate.

## Phase 4 — Beats & overlays (✅ sim-verified 2026-07-07)

Sim-proven: card text centered, beat date over black, clip date/hour/title/description
bottom-left with scrim (hour smaller when enabled), click audible at every beat on both
audio paths, duration/pts/peakMB regressions clean. Device items:

- [ ] Click sound character/loudness on real speakers (authored −12 dBFS, 100 ms,
      1150 Hz blip) — tweak level or timbre if it reads harsh.
- [ ] Overlay legibility over real bright/busy footage (scrim black α0.35; sizes are
      the §7 "first draft" — nudge in Phase 5 preview if off).
- [ ] A really long title: truncates with ellipsis at ~90% width — check it looks OK.
- [ ] Sideload build: `ExpoMontage.bundle` resolves and the click plays (resource
      bundle loading only proven on the sim dev build; a main-bundle fallback exists).
- [ ] French device: dates render in French (device locale), hour as "12:39".

## Phase 5 — Preview & quality picker (✅ sim-verified 2026-07-07)

Sim-proven: analyzeClips ground-truth-correct, quality picker (3 combos) + live size
estimate, preview exact duration/renderSize with matching overlay proportions, 720p60
full-export regression clean, preview invalidation on option change. Device items:

- [ ] Inline preview player: scroll to it after "Preview" finishes, plays with sound,
      looks right (sim check was log-level only — player sits below the fold).
- [ ] Tap an option while a preview is ready → preview invalidates (sim verified the
      code path + a cross-session variant, not a literal in-session tap).
- [ ] analyzeClips at year scale (365 assets): "Analyzing…" resolves in acceptable
      seconds on a real library, incl. iCloud-optimized storage (it never downloads).
- [ ] Quality picker on real footage: combos present match your library (e.g. 4K60),
      default is the sensible mode, picking a lower tier visibly shrinks estimate.
- [ ] Preview render speed on device + it never blocks a later full export (shared
      one-at-a-time slot; a ready preview looping during an export = possible media
      contention to watch for).

## Deferred post-v1 (recorded, not device items)

- Audio normalization (§11.3) — deferred: needs per-clip PCM measurement + AVAudioMix
  fencing around click segments; the beats-only silence path bypasses the mix.
- HDR (HLG/HEVC) output option (§4.2); tone-mapping contrast compare (§11.6).
- Quality picker row may crowd with 4+ combos (cosmetic).
