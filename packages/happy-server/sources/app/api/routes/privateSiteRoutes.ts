import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/storage/db';
import { auth } from '@/app/auth/auth';
import { createPrivateAccount, inviteHash, isPrivateSite, loginPrivateAccount, PrivateAccountError, siteDefaults } from '@/app/auth/privateAccounts';
import type { Fastify } from '../types';

const credentials = z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9_.-]{3,32}$/), passwordProof: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const registration = credentials.extend({
    publicKey: z.string().max(100), challenge: z.string().max(100), signature: z.string().max(200),
    encryptedSecret: z.string().regex(/^[A-Za-z0-9_-]{64}$/),
    secretSalt: z.string().regex(/^[A-Za-z0-9_-]{22}$/), secretNonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    inviteCode: z.string().max(128).optional(),
});
const httpUrl = z.string().url().refine((url) => ['https:', 'http:'].includes(new URL(url).protocol));

export function privateSiteRoutes(app: Fastify) {
    const attempts = new Map<string, { count: number; expires: number }>();
    const limit = async (request: any, reply: any) => {
        const now = Date.now();
        for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
        const key = request.ip;
        const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
        if (entry.count >= 15 || attempts.size >= 10_000) return reply.code(429).header('Retry-After', '60').send({ error: 'too_many_attempts' });
        entry.count++;
        attempts.set(key, entry);
    };
    const privateOnly = async (_request: any, reply: any) => {
        if (!isPrivateSite()) return reply.code(404).send({ error: 'not_found' });
    };
    const adminOnly = async (request: any, reply: any) => {
        const login = await db.accountLogin.findUnique({ where: { accountId: request.userId } });
        const site = await db.siteSettings.findUnique({ where: { id: 'site' } });
        if (login?.role !== 'admin' || site?.administratorAccountId !== request.userId) {
            return reply.code(403).send({ error: 'admin_required' });
        }
    };
    const report = (error: unknown, reply: any) => {
        if (error instanceof PrivateAccountError) return reply.code(error.status).send({ error: error.code });
        throw error;
    };

    app.get('/v1/site', {}, async () => {
        const site = isPrivateSite() ? await db.siteSettings.findUnique({ where: { id: 'site' } }) : null;
        return {
            privateSite: isPrivateSite(), initialized: !!site,
            ...siteDefaults,
            ...(site ? { icpNumber: site.icpNumber, icpUrl: site.icpUrl, policeNumber: site.policeNumber, policeUrl: site.policeUrl } : {}),
        };
    });

    for (const [route, bootstrap] of [['bootstrap', true], ['register', false]] as const) {
        app.post(`/v1/site/${route}`, { preHandler: [privateOnly, limit], schema: { body: registration } }, async (request, reply) => {
            const nacl = (await import('tweetnacl')).default;
            const publicKey = Buffer.from(request.body.publicKey, 'base64');
            const challenge = Buffer.from(request.body.challenge, 'base64');
            const signature = Buffer.from(request.body.signature, 'base64');
            if (publicKey.length !== 32 || challenge.length !== 32 || signature.length !== 64 || !nacl.sign.detached.verify(challenge, signature, publicKey)) {
                return reply.code(401).send({ error: 'invalid_signature' });
            }
            try {
                const account = await createPrivateAccount({ ...request.body, publicKey: publicKey.toString('hex') }, bootstrap);
                return { token: await auth.createToken(account.id), username: request.body.username.toLowerCase(), role: bootstrap ? 'admin' : 'user' };
            } catch (error) { return report(error, reply); }
        });
    }

    app.post('/v1/site/login', { preHandler: [privateOnly, limit], schema: { body: credentials } }, async (request, reply) => {
        try {
            const login = await loginPrivateAccount(request.body.username, request.body.passwordProof);
            const account = await db.account.findUniqueOrThrow({ where: { id: login.accountId }, select: { publicKey: true } });
            return {
                token: await auth.createToken(login.accountId), username: login.username, role: login.role,
                encryptedSecret: login.encryptedSecret, secretSalt: login.secretSalt, secretNonce: login.secretNonce,
                publicKey: account.publicKey,
            };
        } catch (error) { return report(error, reply); }
    });

    app.get('/v1/site/me', { preHandler: app.authenticate }, async (request, reply) => {
        const login = await db.accountLogin.findUnique({ where: { accountId: request.userId } });
        if (!login) return reply.code(401).send({ error: 'account_not_registered' });
        return { username: login.username, role: login.role };
    });

    app.get('/v1/admin/invites', { preHandler: [privateOnly, app.authenticate, adminOnly] }, async () => ({
        invites: await db.registrationInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: {
            id: true, label: true, maxUses: true, usedCount: true, expiresAt: true, revokedAt: true, createdAt: true,
        } }),
    }));
    app.post('/v1/admin/invites', {
        preHandler: [privateOnly, app.authenticate, adminOnly],
        schema: { body: z.object({ label: z.string().max(100).default(''), maxUses: z.number().int().min(1).max(100).default(1), expiresInDays: z.number().int().min(1).max(365).default(7) }) },
    }, async (request) => {
        const code = randomBytes(24).toString('base64url');
        const invite = await db.registrationInvite.create({ data: {
            codeHash: inviteHash(code), label: request.body.label, maxUses: request.body.maxUses,
            expiresAt: new Date(Date.now() + request.body.expiresInDays * 86400_000),
        } });
        return { id: invite.id, code, expiresAt: invite.expiresAt, maxUses: invite.maxUses };
    });
    app.delete('/v1/admin/invites/:id', { preHandler: [privateOnly, app.authenticate, adminOnly], schema: { params: z.object({ id: z.string() }) } }, async (request) => {
        await db.registrationInvite.updateMany({ where: { id: request.params.id, revokedAt: null }, data: { revokedAt: new Date() } });
        return { success: true };
    });
    app.put('/v1/admin/site', {
        preHandler: [privateOnly, app.authenticate, adminOnly],
        schema: { body: z.object({ icpNumber: z.string().min(1).max(100), icpUrl: httpUrl, policeNumber: z.string().min(1).max(100), policeUrl: httpUrl }) },
    }, async (request) => {
        await db.siteSettings.update({ where: { id: 'site' }, data: request.body });
        return { success: true };
    });
}
