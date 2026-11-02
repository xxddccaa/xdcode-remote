import { decodeBase64, encodeBase64 } from '@/encryption/base64';

export type SecretEnvelope = { encryptedSecret: string; secretSalt: string; secretNonce: string };
const copyBuffer = (bytes: Uint8Array): ArrayBuffer => new Uint8Array(bytes).buffer;

/** Separate login proof so the server never receives the password used to unlock the account secret. */
export async function accountPasswordProof(username: string, password: string): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('请使用 HTTPS 或本机地址访问网站。');
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const salt = new TextEncoder().encode(`Happy account login v1:${username.trim().toLowerCase()}`);
    const proof = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, source, 256);
    return encodeBase64(new Uint8Array(proof), 'base64url');
}

async function passwordKey(password: string, salt: Uint8Array) {
    if (!globalThis.crypto?.subtle) throw new Error('请使用 HTTPS 或本机地址访问网站。');
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: copyBuffer(salt), iterations: 310_000, hash: 'SHA-256' }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapAccountSecret(secret: Uint8Array, password: string): Promise<SecretEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const key = await passwordKey(password, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: copyBuffer(nonce) }, key, copyBuffer(secret));
    return { encryptedSecret: encodeBase64(new Uint8Array(cipher), 'base64url'), secretSalt: encodeBase64(salt, 'base64url'), secretNonce: encodeBase64(nonce, 'base64url') };
}

export async function unwrapAccountSecret(envelope: SecretEnvelope, password: string): Promise<Uint8Array> {
    const key = await passwordKey(password, decodeBase64(envelope.secretSalt, 'base64url'));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: copyBuffer(decodeBase64(envelope.secretNonce, 'base64url')) }, key, copyBuffer(decodeBase64(envelope.encryptedSecret, 'base64url')));
    const secret = new Uint8Array(plain);
    if (secret.length !== 32) throw new Error('账户密钥无效。');
    return secret;
}
