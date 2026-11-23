const { withDangerousMod, withPodfileProperties } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/** SQLCipher's include guards reach the app target and blank the iOS SDK's sqlite3.h; strip them there. */
const HOOK = `
    # Added by plugins/with-sqlcipher-sqlite-fix.js — see that file for why.
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_build_configurations.each_key do |config_name|
        path = aggregate_target.xcconfig_path(config_name)
        next unless File.exist?(path)

        contents = File.read(path)
        patched = contents.gsub(/^(GCC_PREPROCESSOR_DEFINITIONS = .*)$/) do |line|
          line.split(' ').reject { |token|
            token.start_with?('_SQLITE3_H_', '_SQLITE3RTREE_H_')
          }.join(' ')
        end
        File.write(path, patched) unless patched == contents
      end
    end
`;

const MARKER = "with-sqlcipher-sqlite-fix.js";

// Expo's SQLCipher exports these unprefixed; sharing them with XMTP's SQLCipher crashes in sqlite3_step.
const EXPO_SQLCIPHER_EXPORTS = `
sqlcipherCodecAttach sqlcipherCodecGetKey sqlcipherPagerCodec
sqlcipherPagerGetCodec sqlcipherPagerSetCodec sqlcipher_cc_setup
sqlcipher_codec_pragma sqlcipher_extra_init sqlcipher_extra_shutdown
sqlcipher_find_db_index sqlcipher_free sqlcipher_get_provider
sqlcipher_init_memmethods sqlcipher_ismemset sqlcipher_log sqlcipher_malloc
sqlcipher_memcmp sqlcipher_memset sqlcipher_mutex sqlcipher_register_provider
sqlcipher_version sqlite3_data_directory sqlite3_temp_directory sqlite3_version
sqlite3changegroup_add sqlite3changegroup_add_change sqlite3changegroup_add_strm
sqlite3changegroup_delete sqlite3changegroup_new sqlite3changegroup_output
sqlite3changegroup_output_strm sqlite3changegroup_schema sqlite3pager_error
sqlite3pager_is_sj_pgno sqlite3pager_reset sqlite3rebaser_configure
sqlite3rebaser_create sqlite3rebaser_delete sqlite3rebaser_rebase sqlite3rebaser_rebase_strm
`
  .trim()
  .split(/\s+/);

module.exports = function withSqlcipherSqliteFix(config) {
  config = withPodfileProperties(config, (modConfig) => {
    const key = "expo.sqlite.customBuildFlags";
    const flags = new Set((modConfig.modResults[key] ?? "").split(/\s+/).filter(Boolean));
    for (const symbol of EXPO_SQLCIPHER_EXPORTS) flags.add(`-D${symbol}=ex${symbol}`);
    modConfig.modResults[key] = [...flags].join(" ");
    return modConfig;
  });
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const podfile = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfile, "utf8");

      if (contents.includes(MARKER)) return modConfig;

      const opener = "  post_install do |installer|\n";
      if (!contents.includes(opener)) {
        throw new Error(
          "with-sqlcipher-sqlite-fix: no `post_install do |installer|` block in the Podfile. " +
            "The Expo template changed shape — update this plugin rather than dropping it, " +
            "or the iOS build fails on sqlite3ext.h with no hint as to why.",
        );
      }

      // At the end: `react_native_post_install` rewrites the same xcconfigs and would undo an earlier strip.
      const closer = contents.lastIndexOf("\n  end");
      if (closer === -1 || closer < contents.indexOf(opener)) {
        throw new Error("with-sqlcipher-sqlite-fix: could not find the end of the post_install block.");
      }

      fs.writeFileSync(podfile, contents.slice(0, closer) + "\n" + HOOK + contents.slice(closer));
      return modConfig;
    },
  ]);
};
