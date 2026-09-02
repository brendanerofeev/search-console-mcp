import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import {
    isServiceAccountKeyMissing,
    assertServiceAccountKeyReadable,
    AccountConfig,
} from '../src/common/auth/config.js';

describe('service account key file guards', () => {
    let dir: string;
    const cleanup = () => { if (dir) rmSync(dir, { recursive: true, force: true }); };

    afterEach(cleanup);

    function makeAccount(overrides: Partial<AccountConfig> = {}): AccountConfig {
        return {
            id: 'test_1',
            engine: 'ga4',
            alias: 'test',
            ...overrides,
        } as AccountConfig;
    }

    it('returns false when account has no serviceAccountPath', () => {
        expect(isServiceAccountKeyMissing(makeAccount())).toBe(false);
    });

    it('returns false when key file exists and is a file', () => {
        dir = mkdtempSync(join(tmpdir(), 'scmcp-key-'));
        const p = join(dir, 'key.json');
        writeFileSync(p, '{}');
        expect(isServiceAccountKeyMissing(makeAccount({ serviceAccountPath: p }))).toBe(false);
    });

    it('returns true when key file does not exist', () => {
        const p = join(tmpdir(), `scmcp-nonexistent-${Date.now()}.json`);
        expect(isServiceAccountKeyMissing(makeAccount({ serviceAccountPath: p }))).toBe(true);
    });

    it('returns true when path points to a directory', () => {
        dir = mkdtempSync(join(tmpdir(), 'scmcp-keydir-'));
        expect(isServiceAccountKeyMissing(makeAccount({ serviceAccountPath: dir }))).toBe(true);
    });

    it('expands ~ to the home directory', () => {
        const account = makeAccount({ serviceAccountPath: '~/scmcp-definitely-missing.json' });
        try {
            assertServiceAccountKeyReadable(account);
            expect.unreachable();
        } catch (e: any) {
            expect(e.message).toContain(join(homedir(), 'scmcp-definitely-missing.json'));
        }
    });

    it('assert throws KEY_FILE_MISSING with resolution command for missing file', () => {
        const p = join(tmpdir(), `scmcp-nonexistent-${Date.now()}.json`);
        const err = (() => {
            try {
                assertServiceAccountKeyReadable(makeAccount({ engine: 'google', serviceAccountPath: p }));
                return null as any;
            } catch (e) {
                return e as any;
            }
        })();
        expect(err).not.toBeNull();
        expect(err.code).toBe('KEY_FILE_MISSING');
        expect(err.resolution).toEqual({ command: 'search-console-mcp setup --engine=google' });
        expect(err.message).toContain(p);
    });

    it('assert leaves a tilde inside the path alone', () => {
        // Windows 8.3 short names (C:\Users\BRENDA~1\...) put a tilde in the
        // middle of an otherwise ordinary absolute path. An unanchored replace
        // rewrites that one and produces a nonsense path in the error message.
        const p = join(tmpdir(), 'BRENDA~1', `scmcp-nonexistent-${Date.now()}.json`);
        const err = (() => {
            try {
                assertServiceAccountKeyReadable(makeAccount({ engine: 'google', serviceAccountPath: p }));
                return null as any;
            } catch (e) {
                return e as any;
            }
        })();
        expect(err).not.toBeNull();
        expect(err.message).toContain(p);
        expect(err.message).not.toContain(homedir() + '1');
    });

    it('assert still expands a leading tilde', () => {
        const err = (() => {
            try {
                assertServiceAccountKeyReadable(makeAccount({ engine: 'google', serviceAccountPath: '~/scmcp-definitely-not-here.json' }));
                return null as any;
            } catch (e) {
                return e as any;
            }
        })();
        expect(err).not.toBeNull();
        expect(err.message).toContain(join(homedir(), 'scmcp-definitely-not-here.json'));
    });

    it('assert does not throw when file exists', () => {
        dir = mkdtempSync(join(tmpdir(), 'scmcp-key-ok-'));
        const p = join(dir, 'key.json');
        writeFileSync(p, '{"client_email":"x@y.iam.gserviceaccount.com"}');
        expect(() =>
            assertServiceAccountKeyReadable(makeAccount({ engine: 'adsense', serviceAccountPath: p }))
        ).not.toThrow();
    });
});
