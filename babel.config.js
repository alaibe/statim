/** `babel-preset-expo` already injects `react-native-worklets/plugin`, so do not list it here. */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
