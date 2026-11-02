import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import nacl from 'tweetnacl';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/storage/db', () => ({ db: new Proxy({}, { get: (_target, property) => {
    const value = state.db[property]; return typeof value === 'function' ? value.bind(state.db) : value;
} }) }));
vi.mock('@/utils/log', () => ({ log: vi.fn(), debug: vi.fn() }));
vi.mock('@/app/auth/auth', () => ({ auth: {
    createToken: async (id: string) => `test:${id}`,
    verifyToken: async (token: string) => token.startsWith('test:') ? { userId: token.slice(5) } : null,
} }));

import { privateSiteRoutes } from './privateSiteRoutes';
import { authRoutes } from './authRoutes';
import { enableAuthentication } from '../utils/enableAuthentication';
import { runMigrations } from '@/standalone';

let directory: string;
let pg: PGlite;
let app: Fastify;
const passwordProof = Buffer.alloc(32, 7).toString('base64url');
function payload(username: string, extra: Record<string, unknown> = {}) {
    const pair = nacl.sign.keyPair.fromSeed(randomBytes(32));
    const challenge = randomBytes(32);
    return { username, passwordProof, publicKey: Buffer.from(pair.publicKey).toString('base64'), challenge: challenge.toString('base64'),
        signature: Buffer.from(nacl.sign.detached(challenge, pair.secretKey)).toString('base64'),
        encryptedSecret: Buffer.alloc(48).toString('base64url'), secretSalt: Buffer.alloc(16).toString('base64url'), secretNonce: Buffer.alloc(12).toString('base64url'), ...extra };
}
async function bootstrap() {
    const result = await app.inject({ method: 'POST', url: '/v1/site/bootstrap', payload: payload('owner') });
    expect(result.statusCode).toBe(200); return result.json().token;
}
async function invite(token: string, maxUses = 1) {
    const result = await app.inject({ method: 'POST', url: '/v1/admin/invites', headers: { authorization: `Bearer ${token}` }, payload: { maxUses } });
    expect(result.statusCode).toBe(200); return result.json();
}
describe('private website registration with a real database', () => {
    beforeAll(async () => {
        vi.stubEnv('HAPPY_PRIVATE_SITE', 'true');
        directory = mkdtempSync(join(tmpdir(), 'happy-registration-test-'));
        await runMigrations({ pgliteDir: directory, migrationsDir: join(process.cwd(), 'prisma/migrations') });
        pg = new PGlite(directory);
        state.db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
        await state.db.$connect();
    }, 60_000);
    beforeEach(async () => {
        if (app) await app.close();
        await state.db.accountLogin.deleteMany(); await state.db.siteSettings.deleteMany();
        await state.db.registrationInvite.deleteMany(); await state.db.account.deleteMany();
        const instance = fastify(); instance.setValidatorCompiler(validatorCompiler); instance.setSerializerCompiler(serializerCompiler);
        app = instance.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
        enableAuthentication(app); privateSiteRoutes(app); authRoutes(app); await app.ready();
    });
    afterAll(async () => {
        if (app) await app.close(); if (state.db) await state.db.$disconnect(); if (pg) await pg.close();
        if (directory) rmSync(directory, { recursive: true }); vi.unstubAllEnvs();
    });
    it('allows only one first administrator even for concurrent setup requests', async () => {
        const responses = await Promise.all(['owner-a', 'owner-b'].map((name) => app.inject({ method: 'POST', url: '/v1/site/bootstrap', payload: payload(name) })));
        expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 409]);
        expect(await state.db.accountLogin.count({ where: { role: 'admin' } })).toBe(1);
        expect(await state.db.account.count()).toBe(1);
    });
    it('blocks direct legacy registration and validates a login password', async () => {
        const token = await bootstrap(); const proof = payload('intruder');
        expect((await app.inject({ method: 'POST', url: '/v1/auth', payload: proof })).statusCode).toBe(403);
        expect((await app.inject({ method: 'POST', url: '/v1/site/register', payload: proof })).statusCode).toBe(403);
        expect((await app.inject({ method: 'POST', url: '/v1/site/login', payload: { username: 'owner', passwordProof: Buffer.alloc(32, 8).toString('base64url') } })).statusCode).toBe(401);
        const login = await app.inject({ method: 'POST', url: '/v1/site/login', payload: { username: 'OWNER', passwordProof } });
        expect(login.statusCode).toBe(200); expect(login.json().role).toBe('admin');
        expect(login.json()).not.toHaveProperty('passwordHash');
        expect((await app.inject({ method: 'GET', url: '/v1/site/me', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    });
    it('consumes a single-use invite once under concurrent registration', async () => {
        const code = await invite(await bootstrap());
        const responses = await Promise.all(['friend-a', 'friend-b'].map((name) => app.inject({ method: 'POST', url: '/v1/site/register', payload: payload(name, { inviteCode: code.code, role: 'admin' }) })));
        expect(responses.map((result) => result.statusCode).sort()).toEqual([200, 403]);
        expect(await state.db.accountLogin.count({ where: { role: 'user' } })).toBe(1);
        expect(await state.db.accountLogin.count({ where: { role: 'admin' } })).toBe(1);
        expect((await state.db.registrationInvite.findUnique({ where: { id: code.id } })).usedCount).toBe(1);
    });
    it('rolls back invite consumption when the chosen username is already taken', async () => {
        const code = await invite(await bootstrap());
        const rejected = await app.inject({ method: 'POST', url: '/v1/site/register', payload: payload('owner', { inviteCode: code.code }) });
        expect(rejected.statusCode).toBe(409);
        expect((await state.db.registrationInvite.findUnique({ where: { id: code.id } })).usedCount).toBe(0);
        expect((await app.inject({ method: 'POST', url: '/v1/site/register', payload: payload('friend', { inviteCode: code.code }) })).statusCode).toBe(200);
    });
    it('rejects expired and revoked invites and prevents ordinary users from managing the site', async () => {
        const owner = await bootstrap(); const expired = await invite(owner); const revoked = await invite(owner);
        await state.db.registrationInvite.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
        expect((await app.inject({ method: 'DELETE', url: `/v1/admin/invites/${revoked.id}`, headers: { authorization: `Bearer ${owner}` } })).statusCode).toBe(200);
        for (const code of [expired.code, revoked.code]) expect((await app.inject({ method: 'POST', url: '/v1/site/register', payload: payload('friend', { inviteCode: code }) })).statusCode).toBe(403);
        const valid = await invite(owner); const friend = await app.inject({ method: 'POST', url: '/v1/site/register', payload: payload('friend', { inviteCode: valid.code }) });
        expect((await app.inject({ method: 'GET', url: '/v1/admin/invites', headers: { authorization: `Bearer ${friend.json().token}` } })).statusCode).toBe(403);
        expect((await app.inject({ method: 'GET', url: '/v1/admin/invites' })).statusCode).toBe(401);
    });
});
