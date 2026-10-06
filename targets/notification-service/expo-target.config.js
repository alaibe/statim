/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'notification-service',
  bundleIdentifier: '.notification-service',
  deploymentTarget: '18.1',
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)im.statim.app.shared'],
    'com.apple.developer.icloud-container-identifiers':
      config.ios.entitlements['com.apple.developer.icloud-container-identifiers'],
    'com.apple.developer.icloud-services':
      config.ios.entitlements['com.apple.developer.icloud-services'],
  },
});
