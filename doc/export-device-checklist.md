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

## Phase 3 — Export MVP (✅ sim-verified end-to-end 2026-07-07; forensics partially pending)

Sim-proven: full chunked export of a 188-day period (7 chunks incl. beats-only ones),
duration exactly as predicted, monotonic progress, error surfacing, temp cleanup.
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
      boundaries for pops/clicks (§5.2 continuous-AAC design).

## Phase 4 — Beats & overlays (pending)

## Phase 5 — Preview & polish (pending)
