import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const publicUrl = new URL(process.env.HAPPY_PUBLIC_URL || 'http://localhost:3005');
if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.pathname !== '/' || publicUrl.username || publicUrl.password) {
    throw new Error('HAPPY_PUBLIC_URL must be an HTTP(S) origin');
}
const dataDir = process.env.DATA_DIR || '/data';
mkdirSync(dataDir, { recursive: true });
const secretFile = join(dataDir, 'master-secret');
let secret = process.env.HANDY_MASTER_SECRET;
if (!secret) {
    try { secret = readFileSync(secretFile, 'utf8').trim(); }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        secret = randomBytes(32).toString('hex');
        writeFileSync(secretFile, secret, { mode: 0o600, flag: 'wx' });
    }
}
const env = {
    ...process.env,
    HANDY_MASTER_SECRET: secret,
    HAPPY_INJECT_HTML_CONFIG: JSON.stringify({ serverUrl: publicUrl.origin, disableAnalytics: true }),
};
const executable = '/repo/node_modules/.bin/tsx';
let child;
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { child?.kill(signal); });
}
function run(command) {
    return new Promise((resolve, reject) => {
        child = spawn(executable, ['sources/standalone.ts', command], { env, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`Server ${command} exited: ${signal || code}`));
        });
    });
}
await run('migrate');
await run('serve');
