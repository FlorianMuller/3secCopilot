const { getDefaultConfig } = require("expo/metro-config");
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");
module.exports = config;

// From 3.16, react-native-reanimated has a metro wrapper that help with debuging
// https://github.com/software-mansion/react-native-reanimated/issues/6507#issuecomment-2355056286
// todo: add the wrapper when using 3.16 (not sure expo can use it for now)

// const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");
// module.exports = wrapWithReanimatedMetroConfig(config);
