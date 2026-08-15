import { describe, it, expect } from 'vitest';
import { classifySerpIntent, passesIntentGate } from './intent.js';

const org = (links: string[], titles: string[] = []) =>
    links.map((link, i) => ({ position: i + 1, link, title: titles[i] ?? '', snippet: '' }));

describe('classifySerpIntent', () => {
    it('rejects the SERP that caused this gate to exist', () => {
        // Verbatim top-10 for "technology consultant" (AU), which showed
        // 390 searches/month and keyword difficulty 0.
        const r = classifySerpIntent({
            query: 'technology consultant',
            organic: org([
                'https://jobs-au.pwc.com/au/en/technology-consultants',
                'https://www.reddit.com/r/Big4/comments/18llmsa/what_exactly_do_consultants',
                'https://www.courses.com.au/career/technology-consultant',
                'https://www.consultancy.com.au/rankings/top-consulting-firms-in-australia',
                'https://au.linkedin.com/jobs/technology-consultant-jobs',
                'https://www.bain.com/industry-expertise/technology/',
                'https://au.seek.com/technical-consultant-jobs/in-All-Melbourne-VIC',
                'https://www.coursera.org/articles/what-is-technology-consulting',
                'https://www.brightnetwork.co.uk/career-path-guides/technology-consulting',
            ]),
        });
        expect(r.verdict).toBe('reject');
        expect(passesIntentGate(r)).toBe(false);
        expect(['jobs', 'informational']).toContain(r.intent);
    });

    it('accepts a genuinely commercial SERP', () => {
        const r = classifySerpIntent({
            query: 'blocked drains brisbane',
            organic: org([
                'https://www.lwplumbing.com.au/blocked-drains',
                'https://allkindplumbing.com.au/services/blocked-drains',
                'https://www.hipages.com.au/find/blocked_drains/qld/brisbane',
                'https://fixlyplumbing.com.au/blocked-drain-plumber',
                'https://bttd.au/blocked-drains-brisbane',
            ], ['Blocked Drain Services Brisbane', 'Blocked Drains - Get a Quote', '', 'Blocked Drain Plumber', '']),
        });
        expect(r.verdict).toBe('accept');
        expect(r.intent).toBe('commercial');
    });

    it('treats an informational SERP as supporting, not a target', () => {
        const r = classifySerpIntent({
            query: 'what is systems integration',
            organic: org([
                'https://en.wikipedia.org/wiki/System_integration',
                'https://www.techtarget.com/searchitoperations/definition/systems-integration',
                'https://www.geeksforgeeks.org/system-integration/',
                'https://www.coursera.org/articles/systems-integration',
            ]),
        });
        expect(r.verdict).toBe('supporting');
        expect(passesIntentGate(r)).toBe(false);
    });

    it('rejects a navigational SERP owned by one brand', () => {
        const r = classifySerpIntent({
            query: 'servicem8',
            organic: org([
                'https://www.servicem8.com/',
                'https://www.servicem8.com/pricing',
                'https://www.servicem8.com/au/features',
                'https://www.servicem8.com/support',
                'https://apps.apple.com/app/servicem8',
            ]),
        });
        expect(r.verdict).toBe('reject');
        expect(r.intent).toBe('navigational');
    });

    it('rejects rather than guesses when there are no results', () => {
        const r = classifySerpIntent({ query: 'x', organic: [] });
        expect(r.verdict).toBe('reject');
        expect(r.confidence).toBe(0);
    });

    it('flags map pack and AI Overview without changing the verdict', () => {
        const base = org(['https://example.com.au/services/plumbing'], ['Plumbing Services Brisbane']);
        const plain = classifySerpIntent({ query: 'plumber brisbane', organic: base });
        const rich = classifySerpIntent({ query: 'plumber brisbane', organic: base, mapPack: true, aiOverview: true });
        expect(rich.verdict).toBe(plain.verdict);
        expect(rich.mapPack).toBe(true);
        expect(rich.aiOverview).toBe(true);
        expect(rich.notes.join(' ')).toMatch(/Map pack/i);
        expect(rich.notes.join(' ')).toMatch(/AI Overview/i);
    });

    it('weights the top three results more heavily than the tail', () => {
        // Jobs at 1-3, commercial in the tail: jobs must still win.
        const r = classifySerpIntent({
            query: 'x consultant',
            organic: org([
                'https://au.seek.com/x-jobs',
                'https://au.indeed.com/q-x-jobs.html',
                'https://jobs.example.com/x',
                'https://agency-one.com.au/services',
                'https://agency-two.com.au/services',
                'https://agency-three.com.au/services',
            ]),
        });
        expect(r.intent).toBe('jobs');
        expect(r.verdict).toBe('reject');
    });
});
