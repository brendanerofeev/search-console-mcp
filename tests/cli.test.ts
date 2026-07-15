import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { createToolRegistrar, runCli, toolsRegistry } from '../src/utils/cli.js';

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

    expect(mcpTool).toHaveBeenCalledWith('echo', 'Echo a query', schemaShape, handler);
    expect(toolsRegistry.get('echo')).toMatchObject({
      name: 'echo',
      description: 'Echo a query',
      schemaShape,
      handler,
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
});
