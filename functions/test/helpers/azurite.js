import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AZURITE = process.env.AZURITE_BIN || path.join(here, '../../node_modules/.bin/azurite');

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (value) => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

// Starts a throwaway Azurite on the default ports, or reuses one that is already
// listening (e.g. the developer's own `azurite`). Returns a stop() that is a
// no-op when an existing instance was reused.
export async function ensureAzurite() {
  if (await portOpen(10000)) {
    return { reused: true, stop: async () => {} };
  }
  if (!existsSync(AZURITE)) {
    throw new Error(`Azurite not found at ${AZURITE}. Run \`npm install\` in functions/.`);
  }
  const location = await mkdtemp(path.join(os.tmpdir(), 'pledge-azurite-'));
  const child = spawn(AZURITE, ['--silent', '--location', location], { stdio: 'ignore', detached: true });
  child.unref();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await portOpen(10000)) {
      return { reused: false, location, stop: async () => { child.kill(); } };
    }
    await delay(100);
  }
  child.kill();
  throw new Error('Azurite did not start listening on port 10000');
}
