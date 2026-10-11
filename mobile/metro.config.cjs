const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const core = path.resolve(__dirname, '../packages/core/src');
config.watchFolders = [...config.watchFolders, core];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName === '@yavamo/core' ? path.join(core, 'index')
    : moduleName.startsWith('@yavamo/core/') ? path.join(core, moduleName.slice('@yavamo/core/'.length))
    : moduleName;
  return context.resolveRequest(context, target, platform);
};

module.exports = config;
