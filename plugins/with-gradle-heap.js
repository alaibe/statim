const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4g -XX:MaxMetaspaceSize=512m';

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (modConfig) => {
    const entry = modConfig.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'
    );
    if (entry) entry.value = JVM_ARGS;
    else
      modConfig.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return modConfig;
  });
};
