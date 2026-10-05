const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Builds simulator slices for arm64 only.
 *
 * The XMTP SDK ships `LibXMTPSwiftFFI.xcframework` without an x86_64 simulator
 * slice, so its pod excludes that architecture, but nothing depending on it
 * does. A generic simulator build (what EAS runs) compiles every target for
 * both architectures, so `XMTPReactNative` fails on x86_64 with "could not find
 * module 'XMTP' for target 'x86_64-apple-ios-simulator'". A local build for one
 * Apple-silicon simulator never asks for x86_64.
 */
const MARKER = 'with-arm64-simulator.js';

const HOOK = `
    # Added by plugins/with-arm64-simulator.js — see that file for why.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
      end
    end
    installer.aggregate_targets.map(&:user_project).uniq.each do |project|
      project.native_targets.each do |target|
        target.build_configurations.each do |config|
          config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
        end
      end
      project.save
    end
`;

module.exports = function withArm64Simulator(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const podfile = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');
      if (contents.includes(MARKER)) return modConfig;

      const opener = '  post_install do |installer|\n';
      const closer = contents.lastIndexOf('\n  end');
      if (!contents.includes(opener) || closer === -1 || closer < contents.indexOf(opener)) {
        throw new Error(
          'with-arm64-simulator: no `post_install do |installer|` block in the Podfile. ' +
            'The Expo template changed shape; update this plugin rather than dropping it, ' +
            'or EAS simulator builds fail on XMTPReactNative for x86_64.'
        );
      }

      fs.writeFileSync(podfile, contents.slice(0, closer) + '\n' + HOOK + contents.slice(closer));
      return modConfig;
    },
  ]);
};
