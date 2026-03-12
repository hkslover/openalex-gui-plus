const { startLocalApp } = require('./local-app');

startLocalApp({
  preferSeaAssets: true,
  requireBuiltDist: false,
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
