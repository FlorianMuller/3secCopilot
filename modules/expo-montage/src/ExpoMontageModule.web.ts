import { registerWebModule, NativeModule } from 'expo';

// ExpoMontageModule is not available on the web platform.
class ExpoMontageModule extends NativeModule<{}> {}

export default registerWebModule(ExpoMontageModule, 'ExpoMontageModule');
