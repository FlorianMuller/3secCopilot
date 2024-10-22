module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // For Drizzle
    plugins: [["inline-import", { "extensions": [".sql"] }]] 
  };
};
