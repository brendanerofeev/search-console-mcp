// @ts-ignore
import Validator from '@adobe/structured-data-validator';
import * as cheerio from 'cheerio';
import { resolveFullWebUrl } from '../auth/resolver.js';

/**
 * Result of a structured data (schema) validation check.
 */
export interface ValidationResult {
    /** Whether all schemas were found and valid. */
    valid: boolean;
    /** A list of validation errors found across all detected schemas. */
    errors: any[];
    /** The original JSON-LD schemas extracted from the input. */
    schemas: any[];
}

/**
 * Validates structured data (JSON-LD) from a URL, raw HTML, or a JSON string.
 *
 * @param input - The source to validate (URL, HTML string, or JSON string).
 * @param type - The type of input being provided.
 * @returns A result object indicating validity and listing any errors found.
 */
export async function validateSchema(
    input: string,
    type: 'url' | 'html' | 'json'
): Promise<ValidationResult> {
    let schemas: any[] = [];
    const errors: any[] = [];

    try {
        if (type === 'url') {
            try {
                const fullUrl = resolveFullWebUrl(input);
                const response = await fetch(fullUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SearchConsoleMCP/2.0)' }
                });
                if (!response.ok) {
                    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
                }
                const html = await response.text();
                schemas = extractSchemas(html);
            } catch (e: any) {
                return { valid: false, errors: [`Fetch error: ${e.message}`], schemas: [] };
            }
        } else if (type === 'html') {
            schemas = extractSchemas(input);
        } else if (type === 'json') {
            try {
                const parsed = JSON.parse(input);
                schemas = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e: any) {
                return { valid: false, errors: [`JSON Parse error: ${e.message}`], schemas: [] };
            }
        }

        if (schemas.length === 0) {
            return { valid: false, errors: ["No structured data (JSON-LD) found"], schemas: [] };
        }

        const validator = new Validator();
        const validationPromises = schemas.map(async (schema) => {
            try {
                let type = schema['@type'];
                if (Array.isArray(type)) {
                    type = type[0];
                }
                const wrapper = {
                    jsonld: {
                        [type || 'Thing']: [schema]
                    }
                };
                const result = await validator.validate(wrapper);

                if (result && Array.isArray(result) && result.length > 0) {
                    // result is array of errors
                    return result.map((err: any) => ({
                        ...err,
                        schemaType: schema['@type'] || 'Unknown'
                    }));
                }
                return [];
            } catch (e: any) {
                return [{ message: `Validation exception: ${e.message}`, schemaType: schema['@type'] || 'Unknown' }];
            }
        });

        const results = await Promise.all(validationPromises);
        errors.push(...results.flat());

        return {
            valid: errors.length === 0,
            errors,
            schemas
        };

    } catch (err: any) {
        return { valid: false, errors: [err.message], schemas: [] };
    }
}

function extractSchemas(html: string): any[] {
    const $ = cheerio.load(html);
    const schemas: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const content = $(el).html();
            if (content) {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    schemas.push(...parsed);
                } else {
                    schemas.push(parsed);
                }
            }
        } catch (e) {
            // ignore invalid json blocks
        }
    });
    return schemas;
}
