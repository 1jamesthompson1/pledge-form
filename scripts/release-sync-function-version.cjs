const fs = require('node:fs');
const path = require('node:path');

// semantic-release plugin: set the function package version to the released
// version during `prepare`, before @semantic-release/git builds the commit, so
// the `chore(release)` commit contains the root and function bumps together.
module.exports = {
  prepare(pluginConfig, { nextRelease, logger }) {
    const version = nextRelease.version;
    for (const file of ['functions/package.json', 'functions/package-lock.json']) {
      const filePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(filePath)) continue;
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let changed = false;
      if (json.version !== version) {
        json.version = version;
        changed = true;
      }
      if (json.packages && json.packages[''] && json.packages[''].version !== version) {
        json.packages[''].version = version;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
        logger.log('Set %s to version %s', file, version);
      }
    }
  },
};
