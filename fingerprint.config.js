/** @type {import('expo/fingerprint').Config} */
module.exports = {
  ignorePaths: [
    'modules/tdjson/ios/Frameworks/**/*',
    'modules/tdjson/android/src/main/jniLibs/**/*',
  ],
  extraSources: [{ type: 'file', filePath: 'scripts/tdlib.sh', reasons: ['tdlib'] }],
};
