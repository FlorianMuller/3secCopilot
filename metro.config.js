const { getDefaultConfig } = require("expo/metro-config");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// For Drizzle (https://orm.drizzle.team/docs/connect-expo-sqlite#update-config-files)
config.resolver.sourceExts.push("sql");

// For react-reanimated (https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#step-3-wrap-metro-config-with-reanimated-wrapper-recommended)
module.exports = wrapWithReanimatedMetroConfig(config);
