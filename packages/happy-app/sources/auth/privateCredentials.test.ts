import { describe, expect, it } from 'vitest';
import { wrapAccountSecret, unwrapAccountSecret, accountPasswordProof } from './privateCredentials';

describe('password account recovery', () => {
    it('derives a separate login proof with a canonical username', async () => {
        const proof = await accountPasswordProof('Owner', 'test-password-123');
        expect(proof).toHaveLength(43);
        expect(proof).not.toContain('test-password-123');
        expect(await accountPasswordProof(' owner ', 'test-password-123')).toBe(proof);
        expect(await accountPasswordProof('owner', 'another-password')).not.toBe(proof);
    });
    it('restores exactly the same account secret with the correct password', async () => {
        const secret = crypto.getRandomValues(new Uint8Array(32));
        const envelope = await wrapAccountSecret(secret, 'a-test-password-123');
        expect(await unwrapAccountSecret(envelope, 'a-test-password-123')).toEqual(secret);
        expect(envelope.encryptedSecret).toHaveLength(64);
    });
    it('rejects an incorrect password and a modified encrypted secret', async () => {
        const envelope = await wrapAccountSecret(crypto.getRandomValues(new Uint8Array(32)), 'a-test-password-123');
        await expect(unwrapAccountSecret(envelope, 'wrong-password')).rejects.toThrow();
        const modified = { ...envelope, encryptedSecret: (envelope.encryptedSecret[0] === 'A' ? 'B' : 'A') + envelope.encryptedSecret.slice(1) };
        await expect(unwrapAccountSecret(modified, 'a-test-password-123')).rejects.toThrow();
    });
});
