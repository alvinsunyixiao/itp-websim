module.exports = function override(config, env) {
  // rewire for tfjs
  if (process.env.NODE_ENV === 'production') {
    config.resolve.mainFields = ['main'];
  }
  // rewire for worker plugin
  const WorkerPlugin = require('worker-plugin');
  config.plugins.push(new WorkerPlugin());
  return config;
}
