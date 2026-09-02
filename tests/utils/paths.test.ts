import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { expandHome } from '../../src/utils/paths.js';

describe('expandHome', () => {
    it('expands a leading ~/', () => {
        expect(expandHome('~/key.json')).toBe(`${homedir()}/key.json`);
    });

    it('expands a leading ~\\ so Windows-style input behaves the same', () => {
        expect(expandHome('~\\key.json')).toBe(`${homedir()}\\key.json`);
    });

    it('expands a bare ~', () => {
        expect(expandHome('~')).toBe(homedir());
    });

    it('leaves a tilde in the middle of a path alone', () => {
        // Windows 8.3 short names put a tilde mid-path in otherwise ordinary
        // absolute paths, e.g. C:\Users\BRENDA~1\AppData\Local\Temp.
        const p = 'C:\\Users\\BRENDA~1\\AppData\\Local\\Temp\\key.json';
        expect(expandHome(p)).toBe(p);
    });

    it('leaves a tilde that is not a home reference alone', () => {
        expect(expandHome('~notahome/key.json')).toBe('~notahome/key.json');
    });

    it('leaves a path with no tilde untouched', () => {
        expect(expandHome('/etc/key.json')).toBe('/etc/key.json');
    });
});
