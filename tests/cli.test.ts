import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { createToolRegistrar, runCli, toolsRegistry, isCliRun } from '../src/utils/cli.js';

describe('CLI runner', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    toolsRegistry.clear();
    log.mockClear();
    error.mockClear();
  });

  afterEach(() => {
    toolsRegistry.clear();
  });

  it('registers tools with the MCP server unchanged while adding them to the CLI registry', async () => {
    const mcpTool = vi.fn();
    const server = { tool: mcpTool };
    const schemaShape = { query: z.string() };
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: args.query }] }));

    const registerTool = createToolRegistrar(server);
    registerTool('echo', 'Echo a query', schemaShape, handler);

    expect(mcpTool).toHaveBeenCalledWith('echo', 'Echo a query', schemaShape, expect.any(Function));
    expect(toolsRegistry.get('echo')).toMatchObject({
      name: 'echo',
      description: 'Echo a query',
      schemaShape,
      handler: expect.any(Function),
    });
  });

  it('coerces CLI arguments using the registered Zod schema', async () => {
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }));
    toolsRegistry.set('demo', {
      name: 'demo',
      description: 'Demo tool',
      schemaShape: {
        limit: z.number(),
        enabled: z.boolean(),
        dimensions: z.array(z.string()),
      },
      schema: z.object({
        limit: z.number(),
        enabled: z.boolean(),
        dimensions: z.array(z.string()),
      }),
      handler,
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'demo', '--limit=10', '--enabled=true', '--dimensions=date,query']);

    expect(exitCode).toBe(0);
    expect(handler).toHaveBeenCalledWith({ limit: 10, enabled: true, dimensions: ['date', 'query'] });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ limit: 10, enabled: true, dimensions: ['date', 'query'] }, null, 2));
  });

  it('prints CSV output when requested', async () => {
    toolsRegistry.set('rows', {
      name: 'rows',
      description: 'Rows tool',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify([{ a: 'x', b: 2 }]) }] }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'rows', '--format=csv']);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith('a,b\nx,2');
  });

  it('supports --no-boolean flags, JSON array values, and table output', async () => {
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: JSON.stringify([args]) }] }));
    toolsRegistry.set('table_demo', {
      name: 'table_demo',
      description: 'Table demo tool',
      schemaShape: {
        enabled: z.boolean(),
        dimensions: z.array(z.string()),
      },
      schema: z.object({
        enabled: z.boolean(),
        dimensions: z.array(z.string()),
      }),
      handler,
    });

    const exitCode = await runCli([
      'node',
      'bin',
      'run',
      'table_demo',
      '--no-enabled',
      '--dimensions=["page","country"]',
      '--format=table',
    ]);

    expect(exitCode).toBe(0);
    expect(handler).toHaveBeenCalledWith({ enabled: false, dimensions: ['page', 'country'] });
    expect(log).toHaveBeenCalledWith([
      '+---------+--------------------+',
      '| enabled | dimensions         |',
      '+---------+--------------------+',
      '| false   | ["page","country"] |',
      '+---------+--------------------+',
    ].join('\n'));
  });

  it('correctly detects if it is a CLI run', () => {
    expect(isCliRun(['node', 'bin', 'run'])).toBe(true);
    expect(isCliRun(['node', 'bin', 'help'])).toBe(false);
  });

  it('prints general help and returns 0 when no args or help arg is passed to runCli', async () => {
    const exitCodeEmpty = await runCli(['node', 'bin', 'run']);
    expect(exitCodeEmpty).toBe(0);
    expect(log).toHaveBeenCalled();

    log.mockClear();
    const exitCodeHelp = await runCli(['node', 'bin', 'run', '--help']);
    expect(exitCodeHelp).toBe(0);
    expect(log).toHaveBeenCalled();
  });

  it('prints tool-specific help and returns 0 when --help is passed for a valid tool', async () => {
    toolsRegistry.set('help_tool', {
      name: 'help_tool',
      description: 'Help tool desc',
      schemaShape: {
        num: z.number().optional().default(10),
      },
      schema: z.object({ num: z.number().optional().default(10) }),
      handler: async () => ({ content: [] }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'help_tool', '--help']);
    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalled();
  });

  it('returns 1 when tool is unknown', async () => {
    const exitCode = await runCli(['node', 'bin', 'run', 'unknown_tool']);
    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown tool: unknown_tool'));
  });

  it('returns 1 when argument validation fails', async () => {
    toolsRegistry.set('valid_tool', {
      name: 'valid_tool',
      description: 'valid tool desc',
      schemaShape: {
        num: z.number(),
      },
      schema: z.object({ num: z.number() }),
      handler: async () => ({ content: [] }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'valid_tool', '--num=not_a_number']);
    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalled();
  });

  it('handles tool execution failures (handler rejection) by returning 1', async () => {
    toolsRegistry.set('fail_tool', {
      name: 'fail_tool',
      description: 'fails',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => {
        throw new Error('Something went wrong');
      },
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'fail_tool']);
    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Something went wrong'));
  });

  it('handles tool execution failures (returned error object) by returning 1', async () => {
    toolsRegistry.set('err_obj_tool', {
      name: 'err_obj_tool',
      description: 'returns error object',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({
        isError: true,
        content: [{ type: 'text', text: 'Google API error' }],
      }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'err_obj_tool']);
    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('Google API error');
  });

  it('correctly coerces JSON objects and fallback array parsing', async () => {
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }));
    toolsRegistry.set('coerce_tool', {
      name: 'coerce_tool',
      description: 'coerces',
      schemaShape: {
        meta: z.any(),
        list: z.array(z.string()),
      },
      schema: z.object({ meta: z.any(), list: z.array(z.string()) }),
      handler,
    });

    const exitCode = await runCli([
      'node',
      'bin',
      'run',
      'coerce_tool',
      '--meta={"key":"value"}',
      '--list=[invalid_json_but_fallback_array',
    ]);
    expect(exitCode).toBe(0);
  });

  it('prints empty line for empty table data', async () => {
    toolsRegistry.set('empty_table', {
      name: 'empty_table',
      description: 'empty table',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({ content: [{ type: 'text', text: '[]' }] }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'empty_table', '--format=table']);
    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith('');
  });

  it('supports space-separated arguments and string fields', async () => {
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }));
    toolsRegistry.set('space_args', {
      name: 'space_args',
      description: 'space args',
      schemaShape: {
        name: z.string(),
        limit: z.number(),
      },
      schema: z.object({ name: z.string(), limit: z.number() }),
      handler,
    });

    const exitCode = await runCli([
      'node',
      'bin',
      'run',
      'space_args',
      'extra_ignored_arg',
      '--name', 'john',
      '--limit', '25',
    ]);
    expect(exitCode).toBe(0);
    expect(handler).toHaveBeenCalledWith({ name: 'john', limit: 25 });
  });

  it('covers legacy Zod type fallbacks and schemas without _def', async () => {
    const legacyOpt = {
      _def: {
        typeName: 'ZodOptional',
        innerType: {
          _def: {
            typeName: 'ZodString',
          },
        },
      },
    };
    const schemaNoDef = {};

    toolsRegistry.set('legacy_zod', {
      name: 'legacy_zod',
      description: 'legacy',
      schemaShape: {
        opt: legacyOpt as any,
        nodef: schemaNoDef as any,
      },
      schema: z.object({}),
      handler: async () => ({ content: [] }),
    });

    const exitCode = await runCli(['node', 'bin', 'run', 'legacy_zod', '--help']);
    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalled();
  });

  it('handles non-text MCP results and formats primitive results', async () => {
    toolsRegistry.set('non_text', {
      name: 'non_text',
      description: 'non-text result',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({
        content: [{ type: 'image', data: 'xyz' }],
      }),
    });

    const exitCodeJson = await runCli(['node', 'bin', 'run', 'non_text']);
    expect(exitCodeJson).toBe(0);

    const exitCodeCsv = await runCli(['node', 'bin', 'run', 'non_text', '--format=csv']);
    expect(exitCodeCsv).toBe(0);

    const exitCodeTable = await runCli(['node', 'bin', 'run', 'non_text', '--format=table']);
    expect(exitCodeTable).toBe(0);
  });

  it('handles invalid JSON inputs gracefully by returning raw values', async () => {
    const handler = vi.fn(async (args) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }));
    toolsRegistry.set('raw_fallback', {
      name: 'raw_fallback',
      description: 'raw fallback',
      schemaShape: {
        val: z.any(),
      },
      schema: z.object({ val: z.any() }),
      handler,
    });

    const exitCode = await runCli([
      'node',
      'bin',
      'run',
      'raw_fallback',
      '--val={"invalid_json_object',
    ]);
    expect(exitCode).toBe(0);
    expect(handler).toHaveBeenCalledWith({ val: '{"invalid_json_object' });
  });

  it('covers all parser, formatter, and Zod type branches', async () => {
    // 1. Flag without value followed by another flag (covers line 103 branch)
    const handler = vi.fn(async () => ({ content: [] }));
    toolsRegistry.set('flag_seq', {
      name: 'flag_seq',
      description: 'flag sequence',
      schemaShape: {
        flagA: z.boolean().optional(),
        flagB: z.boolean().optional(),
      },
      schema: z.object({ flagA: z.boolean().optional(), flagB: z.boolean().optional() }),
      handler,
    });
    await runCli(['node', 'bin', 'run', 'flag_seq', '--flagA', '--flagB']);
    expect(handler).toHaveBeenCalledWith({ flagA: true, flagB: true });

    // 2. schema with in/schema defs (covers line 149 ?? coalescing)
    const mockZodPipe = {
      _def: {
        typeName: 'pipe',
        in: {
          _def: {
            typeName: 'number',
          },
        },
      },
    };
    const mockZodSchema = {
      _def: {
        typeName: 'optional',
        schema: {
          _def: {
            typeName: 'string',
          },
        },
      },
    };
    toolsRegistry.set('zod_coalesce', {
      name: 'zod_coalesce',
      description: 'coalesce',
      schemaShape: {
        pipe: mockZodPipe as any,
        sch: mockZodSchema as any,
      },
      schema: z.object({}),
      handler: async () => ({ content: [] }),
    });
    await runCli(['node', 'bin', 'run', 'zod_coalesce', '--help']);

    // 3. flattenForDisplay branches (covers line 181 null/array/primitive checks)
    toolsRegistry.set('flatten_check', {
      name: 'flatten_check',
      description: 'flatten check',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify([
            null,
            'primitive_string',
            [1, 2, 3],
            { a: 'hello', b: null, c: { nested: 1 } }
          ])
        }],
      }),
    });
    // Print in CSV (covers map(flattenForDisplay))
    await runCli(['node', 'bin', 'run', 'flatten_check', '--format=csv']);
    // Print in Table with different keys (covers row[key] ?? "" and printTable)
    await runCli(['node', 'bin', 'run', 'flatten_check', '--format=table']);

    // 4. Non-string error responses (covers line 71 typeof unwrapped !== "string")
    toolsRegistry.set('non_str_err', {
      name: 'non_str_err',
      description: 'non-string error',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 500, detail: 'Failed' }) }],
      }),
    });
    await runCli(['node', 'bin', 'run', 'non_str_err']);

    // 5. Thrown primitive/string error (covers line 77 error !instanceof Error)
    toolsRegistry.set('throw_primitive', {
      name: 'throw_primitive',
      description: 'throws primitive',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => {
        throw 'Raw string error thrown';
      },
    });
    await runCli(['node', 'bin', 'run', 'throw_primitive']);

    // 6. Plain string tool output (covers line 177 typeof data === "string")
    toolsRegistry.set('plain_string_output', {
      name: 'plain_string_output',
      description: 'plain string output',
      schemaShape: {},
      schema: z.object({}),
      handler: async () => ({
        content: [{ type: 'text', text: 'plain_non_json_string' }],
      }),
    });
    await runCli(['node', 'bin', 'run', 'plain_string_output']);
  });

  it('appends update notice in MCP server mode (isCliRun is false)', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'bin', 'stdio'];

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    } as any);

    const mcpTool = vi.fn();
    const server = { tool: mcpTool };
    const registerTool = createToolRegistrar(server, '1.0.0');

    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: 'response' }] }));
    registerTool('test_notice', 'desc', {}, handler);

    const wrappedHandler = mcpTool.mock.calls[0][3];
    const res = await wrappedHandler({});

    expect(res.content[0].text).toContain('[SYSTEM NOTICE: A newer version v9.9.9');
    process.argv = originalArgv;
  });
});
