import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';
import { Prisma } from '@prisma/client';

const derivePassword = promisify(scrypt);
export const isPrivateSite = () => process.env.HAPPY_PRIVATE_SITE !== 'false';
export const inviteHash = (code: string) => createHash('sha256').update(code.trim()).digest('hex');
export const normalizeUsername = (username: string) => username.trim().toLowerCase();
export const siteDefaults = {
    title: 'Happy', icpNumber: '京ICP备2025125963号-1', icpUrl: 'https://beian.miit.gov.cn/',
    policeNumber: '京公网安备11010502056950号', policeUrl: 'https://beian.mps.gov.cn/#/query/webSearch',
};

export class PrivateAccountError extends Error {
    constructor(public readonly code: string, public readonly status = 403) { super(code); }
}

export type Registration = {
    username: string; passwordProof: string; publicKey: string;
    encryptedSecret: string; secretSalt: string; secretNonce: string;
    inviteCode?: string;
};

export async function accountCanLogin(accountId: string): Promise<boolean> {
    return !isPrivateSite() || !!await db.accountLogin.findUnique({ where: { accountId }, select: { accountId: true } });
}

export async function createPrivateAccount(input: Registration, bootstrap: boolean) {
    if (bootstrap && await db.siteSettings.findUnique({ where: { id: 'site' } })) throw new PrivateAccountError('already_initialized', 409);
    if (!bootstrap) {
        if (!input.inviteCode) throw new PrivateAccountError('invite_required');
        const invite = await db.registrationInvite.findUnique({ where: { codeHash: inviteHash(input.inviteCode) } });
        if (!invite || invite.revokedAt || invite.expiresAt <= new Date() || invite.usedCount >= invite.maxUses) throw new PrivateAccountError('invalid_invite');
    }
    const passwordSalt = randomBytes(16).toString('hex');
    const passwordHash = (await derivePassword(input.passwordProof, passwordSalt, 64) as Buffer).toString('hex');
    try {
        return await inTx(async (tx) => {
            const site = await tx.siteSettings.findUnique({ where: { id: 'site' } });
            if (bootstrap && site) throw new PrivateAccountError('already_initialized', 409);
            if (!bootstrap && !site) throw new PrivateAccountError('not_initialized', 409);
            const existing = await tx.account.findUnique({ where: { publicKey: input.publicKey } });
            if (existing && await tx.accountLogin.findUnique({ where: { accountId: existing.id } })) {
                throw new PrivateAccountError('account_exists', 409);
            }
            if (!bootstrap) {
                if (!input.inviteCode) throw new PrivateAccountError('invite_required');
                const invite = await tx.registrationInvite.findUnique({ where: { codeHash: inviteHash(input.inviteCode) } });
                const now = new Date();
                if (!invite || invite.revokedAt || invite.expiresAt <= now || invite.usedCount >= invite.maxUses) {
                    throw new PrivateAccountError('invalid_invite');
                }
                const consumed = await tx.registrationInvite.updateMany({
                    where: { id: invite.id, usedCount: invite.usedCount, revokedAt: null, expiresAt: { gt: now } },
                    data: { usedCount: { increment: 1 } },
                });
                if (consumed.count !== 1) throw new PrivateAccountError('invalid_invite');
            }
            const account = existing ?? await tx.account.create({ data: { publicKey: input.publicKey } });
            await tx.accountLogin.create({ data: {
                accountId: account.id, username: normalizeUsername(input.username), passwordSalt, passwordHash,
                encryptedSecret: input.encryptedSecret, secretSalt: input.secretSalt, secretNonce: input.secretNonce,
                role: bootstrap ? 'admin' : 'user',
            } });
            if (bootstrap) await tx.siteSettings.create({ data: { id: 'site', administratorAccountId: account.id } });
            return account;
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            if (bootstrap && await db.siteSettings.findUnique({ where: { id: 'site' } })) {
                throw new PrivateAccountError('already_initialized', 409);
            }
            throw new PrivateAccountError('username_taken', 409);
        }
        throw error;
    }
}

export async function loginPrivateAccount(username: string, password: string) {
    const login = await db.accountLogin.findUnique({ where: { username: normalizeUsername(username) } });
    const salt = login?.passwordSalt ?? '00000000000000000000000000000000';
    const candidate = await derivePassword(password, salt, 64) as Buffer;
    const expected = login ? Buffer.from(login.passwordHash, 'hex') : Buffer.alloc(64);
    if (!login || expected.length !== candidate.length || !timingSafeEqual(candidate, expected)) {
        throw new PrivateAccountError('invalid_credentials', 401);
    }
    return login;
}
