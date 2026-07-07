import { NativeModule, requireNativeModule } from "expo";

import {
  ClipAnalysis,
  ExpoMontageModuleEvents,
  MontageClip,
  MontageSettings,
  SpikeClip,
  SpikeOptions,
  SpikeResult,
} from "./ExpoMontage.types";

declare class ExpoMontageModule extends NativeModule<ExpoMontageModuleEvents> {
  spikeConcat(clips: SpikeClip[], options: SpikeOptions): Promise<SpikeResult>;
  /**
   * Metadata-only scan (§4.1): resolution & frame rate per asset, no decode, no
   * iCloud download. Unresolvable assets (offloaded, Live Photos, deleted) are
   * missing from the result instead of rejecting the whole call.
   */
  analyzeClips(assetIds: string[]): Promise<ClipAnalysis[]>;
  /**
   * Starts an export and returns immediately; progress/completion/errors are
   * reported through the onExport* events (doc/export-spec.md §7).
   * Rejects if an export is already running (one at a time).
   */
  exportMontage(clips: MontageClip[], settings: MontageSettings): Promise<{ taskId: string }>;
  /** Aborts the running export — it then emits onExportError with message "cancelled". */
  cancelExport(taskId: string): Promise<void>;
}

export default requireNativeModule<ExpoMontageModule>("ExpoMontage");
