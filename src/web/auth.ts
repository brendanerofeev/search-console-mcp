/**
 * Single-user session auth for the reporting UI.
 *
 * Deliberately minimal: one shared password, a signed cookie, no user table.
 * This is an internal dashboard for one person. It is NOT a multi-tenant auth
 * model — when customers get their own logins, replace this wholesale rather
 * than extending it, and add per-tenant row filtering at the query layer.
 *
 * It exists at all because the dashboard is published on the public internet
 * and shows several customers' data; "no auth yet" is not an option for that.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import type { IncomingMessage } from 'http';

const COOKIE_NAME = 'sc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Signing key; ephemeral if unset, which just means sessions die on restart. */
let signingKey: string | null = null;
function getSigningKey(): string {
    signingKey ??= process.env.UI_SESSION_SECRET ?? randomBytes(32).toString('hex');
    return signingKey;
}

export function uiPassword(): string | undefined {
    return process.env.UI_PASSWORD;
}

/** Whether the UI is enabled at all. */
export function uiEnabled(): boolean {
    return !!uiPassword();
}

function sign(value: string): string {
    return createHmac('sha256', getSigningKey()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Mint a signed session token valid for SESSION_TTL_MS. */
export function createSession(): string {
    const expires = String(Date.now() + SESSION_TTL_MS);
    return `${expires}.${sign(expires)}`;
}

function validSession(token: string | undefined): boolean {
    if (!token) return false;
    const [expires, signature] = token.split('.');
    if (!expires || !signature) return false;
    if (!safeEqual(signature, sign(expires))) return false;
    return Number(expires) > Date.now();
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}

/** True when the request carries a valid UI session. */
export function hasSession(req: IncomingMessage): boolean {
    return validSession(readCookie(req, COOKIE_NAME));
}

/** Constant-time password check. */
export function passwordMatches(candidate: string): boolean {
    const expected = uiPassword();
    return !!expected && safeEqual(candidate, expected);
}

export function sessionCookie(token: string): string {
    // Secure: the dashboard is only served over HTTPS via the Cloudflare tunnel.
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${
        SESSION_TTL_MS / 1000
    }`;
}

export function clearCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}
