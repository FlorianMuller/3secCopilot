// SPIKE — Phase 1 de-risking types only (see doc/export-spec.md §10). Not the production API
// drafted in §6 (no chunking, overlays, missing-day beats, progress events, etc).

export type SpikeConcatResult = {
  success: boolean;
  outputPath?: string;
  durationMs?: number;
  error?: string;
};
