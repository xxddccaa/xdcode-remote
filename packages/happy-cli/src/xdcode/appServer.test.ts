import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '@/codex/codexAppServerClient';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFileSync: vi.fn() }));
vi.mock('cross-spawn', () => ({ spawn: mocks.spawn }));
vi.mock('node:child_process', () => ({ execSync: vi.fn(), execFileSync: mocks.execFileSync }));
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const requests: any[] = [];
let rejectSettings = false;

beforeEach(() => {
    requests.length = 0;
    rejectSettings = false;
    mocks.execFileSync.mockImplementation((_command, args) => args[0] === '--version' ? 'xdcode 0.165.0' : JSON.stringify({
        current: { model: 'coder', provider: 'service-a' },
        providers: { 'service-a': { name: 'Service A' }, 'service-b': { name: 'Service B' } },
        models: [
            { id: 'a', model: 'coder', provider: 'service-a', reasoning_efforts: ['high'] },
            { id: 'b', model: 'coder', provider: 'service-b', reasoning_efforts: [] },
        ],
    }));
    mocks.spawn.mockImplementation(() => {
        const stdout = new PassThrough();
        const stdin = new Writable({ write(chunk, _encoding, callback) {
            const message = JSON.parse(chunk.toString());
            requests.push(message);
            if (message.id !== undefined) {
                const result = message.method === 'thread/start' || message.method === 'thread/resume'
                    ? { thread: { id: 'thread-a' }, model: 'coder' }
                    : message.method === 'turn/start' ? { turn: { id: 'turn-a' } } : {};
                queueMicrotask(() => stdout.write(JSON.stringify(message.method === 'thread/settings/update' && rejectSettings
                    ? { id: message.id, error: { code: -32602, message: 'Selection rejected' } }
                    : { id: message.id, result }) + '\n'));
            }
            callback();
        } });
        return Object.assign(new EventEmitter(), { stdin, stdout, stderr: new PassThrough(), kill: vi.fn() });
    });
});

describe('xdcode provider selection', () => {
    it('acknowledges the exact catalog entry before starting a turn and preserves it on resume', async () => {
        const client = new CodexAppServerClient(undefined, 'xdcode');
        await client.connect();
        await client.startThread({ model: 'xdcode:a', cwd: '/tmp/project-a' });
        expect(requests.find((request) => request.method === 'thread/start').params)
            .toMatchObject({ model: 'coder', modelProvider: 'service-a', cwd: '/tmp/project-a' });
        await client.sendTurn('continue', { model: 'xdcode:b' });
        const settingsIndex = requests.findIndex((request) => request.method === 'thread/settings/update');
        expect(requests[settingsIndex].params.catalogSelection)
            .toEqual({ catalogId: 'b', provider: 'service-b', model: 'coder', mode: 'default', effort: null });
        const turnIndex = requests.findIndex((request) => request.method === 'turn/start');
        expect(turnIndex).toBeGreaterThan(settingsIndex);
        expect(requests[turnIndex].params.model).toBeUndefined();
        await client.resumeThread();
        expect(requests.find((request) => request.method === 'thread/resume').params.modelProvider).toBe('service-b');
        await client.disconnect();
    });

    it('does not start inference when the server rejects a model change', async () => {
        const client = new CodexAppServerClient(undefined, 'xdcode');
        await client.connect();
        await client.startThread({ model: 'xdcode:a' });
        rejectSettings = true;
        await expect(client.sendTurn('continue', { model: 'xdcode:b' })).rejects.toThrow('Selection rejected');
        expect(requests.some((request) => request.method === 'turn/start')).toBe(false);
        await client.disconnect();
    });
});
