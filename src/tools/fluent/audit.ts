import { auditSite } from '../../seo/audit.js';

/** seo_onboarding: the onboarding "get the basics right" audit for a site. */
export async function seoOnboardingHandler(args: { siteUrl: string }) {
    const result = await auditSite(args.siteUrl);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
