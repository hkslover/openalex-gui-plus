const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: path.resolve(__dirname, 'server/sea-entry.js'),
  output: {
    path: path.resolve(__dirname, '.local-build'),
    filename: 'sea-main.cjs',
    libraryTarget: 'commonjs2',
    clean: true,
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  externalsPresets: {
    node: true,
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.BannerPlugin({
      raw: true,
      banner: '#!/usr/bin/env node',
    }),
  ],
  node: {
    __dirname: false,
    __filename: false,
  },
};
