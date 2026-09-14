module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }],
    './scripts/release-sync-function-version.cjs',
    [
      '@semantic-release/git',
      {
        assets: [
          'package.json',
          'package-lock.json',
          'functions/package.json',
          'functions/package-lock.json',
        ],
        message: 'chore(release): ${nextRelease.version}',
      },
    ],
    '@semantic-release/github',
  ],
};
