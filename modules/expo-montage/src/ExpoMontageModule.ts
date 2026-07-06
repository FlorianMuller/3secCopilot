import { NativeModule, requireNativeModule } from "expo";

import { SpikeClip, SpikeOptions, SpikeResult } from "./ExpoMontage.types";

declare class ExpoMontageModule extends NativeModule {
  spikeConcat(clips: SpikeClip[], options: SpikeOptions): Promise<SpikeResult>;
}

export default requireNativeModule<ExpoMontageModule>("ExpoMontage");
