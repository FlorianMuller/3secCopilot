module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // For Drizzle
      ["inline-import", { extensions: [".sql"] }],
      // 'react-native-reanimated/plugin' should be listed last
      //  https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#step-2-add-reanimateds-babel-plugin
      "react-native-reanimated/plugin",
    ],
  };
};
