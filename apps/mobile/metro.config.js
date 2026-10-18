const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
// This repo keeps independent npm installs, so Expo cannot infer a workspace root.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../../packages/garden-sync')]

module.exports = config
