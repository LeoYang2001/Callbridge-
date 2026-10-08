// The app imports the types and client logic it shares with the server and the web app from
// ../shared, which sits outside this folder, so Metro has to watch it too.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

module.exports = config;
