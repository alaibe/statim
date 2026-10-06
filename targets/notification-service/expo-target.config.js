/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = {
  type: 'notification-service',
  bundleIdentifier: '.notification-service',
  deploymentTarget: '18.1',
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)im.statim.app.shared'],
    'com.apple.developer.icloud-container-identifiers': ['iCloud.im.statim.app'],
    'com.apple.developer.icloud-services': ['CloudKit'],
  },
};
