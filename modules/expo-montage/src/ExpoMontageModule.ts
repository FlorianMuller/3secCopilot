import { NativeModule, requireNativeModule } from "expo";

import { SpikeConcatResult } from "./ExpoMontage.types";

// SPIKE — Phase 1 de-risking module only (see doc/export-spec.md §10). Not the production API
// drafted in the spec's §6 (no chunking, overlays, missing-day beats, progress events, etc).
declare class ExpoMontageModule extends NativeModule<{}> {
  spikeConcat(
    assetIds: string[],
    renderSize: { width: number; height: number },
    outputPath: string
  ): Promise<SpikeConcatResult>;
}

export default requireNativeModule<ExpoMontageModule>("ExpoMontage");
