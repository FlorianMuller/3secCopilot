import * as FileSystem from "expo-file-system";
import {
  ExportCompleteEvent,
  ExportDiagnostics,
  MontageClip,
  SourceDiagnostic,
} from "../../modules/expo-montage/src/ExpoMontage.types";

// Dev A/V-sync debugging (doc/export-device-checklist.md L91). Writes a structured
// `.debug.jsonl` next to the exported video correlating the JS timeline plan (dates,
// titles, trims, intended insert times) with the native A/V measurements (per source
// clip, per chunk, and the final assembled file). One JSON object per line so it is
// greppable and diff-friendly; scan it to see which day/chunk drifts and by how much.

export interface ExportDiagnosticsContext {
  periodLabel: string;
  renderSize: { width: number; height: number };
  fps: number;
  mode: string;
  quality: string;
}

// Intended duration of one timeline item. Video clips fall back to the native
// clamped duration (the true full-clip length JS cannot know for untrimmed clips).
function intendedDurationMs(
  clip: MontageClip,
  source: SourceDiagnostic | undefined
): number | null {
  switch (clip.type) {
    case "card":
    case "missingDay":
      return clip.durationMs;
    case "video":
      if (source !== undefined) {
        return source.clampedDurationMs;
      }
      if (clip.startMs != null && clip.endMs != null && clip.endMs > clip.startMs) {
        return clip.endMs - clip.startMs;
      }
      return null; // untrimmed clip, native duration unavailable
  }
}

function overlayText(clip: MontageClip): { date?: string; title?: string; description?: string } {
  if (clip.type === "card") {
    return { title: clip.overlayLines.join(" ") };
  }
  const overlay = clip.overlay;
  return {
    date: overlay?.dateText,
    title: overlay?.titleText,
    description: overlay?.descriptionText,
  };
}

function round(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function buildLines(
  clips: MontageClip[],
  diagnostics: ExportDiagnostics,
  event: ExportCompleteEvent,
  context: ExportDiagnosticsContext
): string[] {
  const sourceByIndex = new Map<number, SourceDiagnostic>();
  for (const source of diagnostics.sources) {
    sourceByIndex.set(source.itemIndex, source);
  }

  const assembledDeltaMs = diagnostics.assembled.videoMs - diagnostics.assembled.audioMs;
  const lines: string[] = [];

  lines.push(
    JSON.stringify({
      kind: "meta",
      generatedAt: new Date().toISOString(),
      period: context.periodLabel,
      quality: context.quality,
      renderSize: context.renderSize,
      fps: context.fps,
      mode: context.mode,
      itemCount: clips.length,
      chunkCount: diagnostics.chunks.length,
      outputPath: event.outputPath,
      durationMs: round(event.durationMs),
      fileSizeBytes: event.fileSizeBytes,
      peakMemoryMB: round(event.peakMemoryMB),
      assembledVideoMs: round(diagnostics.assembled.videoMs),
      assembledAudioMs: round(diagnostics.assembled.audioMs),
      // Positive = video track longer than audio (audio finishes early → audio "ahead")
      assembledVideoMinusAudioMs: round(assembledDeltaMs),
      warnings: event.warnings,
    })
  );

  // One line per timeline item, with the cumulative intended insert time and, for
  // video clips, the source A/V gap that feeds cumulative drift.
  let cursorMs = 0;
  for (const [index, clip] of clips.entries()) {
    const source = sourceByIndex.get(index);
    const durationMs = intendedDurationMs(clip, source);
    const text = overlayText(clip);
    const avGapMs = source ? source.sourceAudioMs - source.sourceVideoMs : undefined;
    lines.push(
      JSON.stringify({
        kind: "item",
        index,
        type: clip.type,
        intendedStartMs: round(cursorMs),
        intendedDurationMs: round(durationMs),
        date: text.date ?? null,
        title: text.title ?? null,
        description: text.description ?? null,
        assetId: clip.type === "video" ? clip.assetId : null,
        trimStartMs: clip.type === "video" ? clip.startMs ?? null : null,
        trimEndMs: clip.type === "video" ? clip.endMs ?? null : null,
        source: source
          ? {
              sourceVideoMs: round(source.sourceVideoMs),
              sourceAudioMs: round(source.sourceAudioMs),
              // Positive = source audio longer than source video (the drift trigger)
              sourceAudioMinusVideoMs: round(avGapMs),
              assetDurationMs: round(source.assetDurationMs),
              fps: source.fps,
              minFrameMs: round(source.minFrameMs),
              clampedStartMs: round(source.clampedStartMs),
              clampedDurationMs: round(source.clampedDurationMs),
            }
          : null,
      })
    );
    if (durationMs != null) {
      cursorMs += durationMs;
    }
  }

  // One line per chunk: actual encoded track lengths vs the intended timeline.
  for (const chunk of diagnostics.chunks) {
    lines.push(
      JSON.stringify({
        kind: "chunk",
        index: chunk.index,
        firstItemIndex: chunk.firstItemIndex,
        itemCount: chunk.itemCount,
        mode: chunk.mode,
        intendedMs: round(chunk.intendedMs),
        videoMs: round(chunk.videoMs),
        audioMs: round(chunk.audioMs),
        containerMs: round(chunk.containerMs),
        offsetMs: round(chunk.offsetMs),
        videoMinusAudioMs: round(chunk.videoMs - chunk.audioMs),
        videoMinusIntendedMs: round(chunk.videoMs - chunk.intendedMs),
        audioMinusIntendedMs: round(chunk.audioMs - chunk.intendedMs),
      })
    );
  }

  lines.push(
    JSON.stringify({
      kind: "assembled",
      videoMs: round(diagnostics.assembled.videoMs),
      audioMs: round(diagnostics.assembled.audioMs),
      videoMinusAudioMs: round(assembledDeltaMs),
    })
  );

  return lines;
}

// Derive the sidecar path from the video path: `<name>.mp4` → `<name>.debug.jsonl`.
function sidecarPath(outputPath: string): string {
  return outputPath.replace(/\.mp4$/i, "") + ".debug.jsonl";
}

// Writes the diagnostics sidecar next to the exported video. No-op (returns undefined)
// when the native side did not attach diagnostics (settings.diagnostics was off).
// Errors are logged, never thrown — a debug artifact must not fail the export flow.
export async function writeExportDiagnostics(
  clips: MontageClip[],
  event: ExportCompleteEvent,
  context: ExportDiagnosticsContext
): Promise<string | undefined> {
  if (event.diagnostics === undefined) {
    return undefined;
  }
  const path = sidecarPath(event.outputPath);
  try {
    const contents = buildLines(clips, event.diagnostics, event, context).join("\n") + "\n";
    await FileSystem.writeAsStringAsync(path, contents);
    return path;
  } catch (error) {
    console.warn("[exportDebug] failed to write diagnostics sidecar:", error);
    return undefined;
  }
}
