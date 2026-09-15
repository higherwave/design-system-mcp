import { z } from 'zod'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { loadTokens, loadComponents, searchPatterns, getPattern, type Pattern } from '../../../lib/registry'
import { validatePage } from '../../../lib/validateRules'
import { openRegisterPatternPR } from '../../../lib/githubWrite'

export const runtime = 'nodejs'

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_design_tokens',
      {
        title: 'List design tokens',
        description: 'Returns Carbon design token categories (color, spacing, typography) and how to consume them.',
      },
      async () => ({
        content: [{ type: 'text', text: JSON.stringify(loadTokens(), null, 2) }],
      }),
    )

    server.registerTool(
      'list_components',
      {
        title: 'List components',
        description: 'Returns the allowed Carbon component list with import paths and usage notes.',
      },
      async () => ({
        content: [{ type: 'text', text: JSON.stringify(loadComponents(), null, 2) }],
      }),
    )

    server.registerTool(
      'search_patterns',
      {
        title: 'Search patterns',
        description: 'Deterministically search the pattern registry by tags, page type, and/or components used. Call this before generating a new page.',
        inputSchema: z.object({
          tags: z.array(z.string()).optional(),
          pageType: z.string().optional(),
          componentsUsed: z.array(z.string()).optional(),
        }),
      },
      async ({ tags, pageType, componentsUsed }) => {
        const results = searchPatterns({ tags, pageType, componentsUsed })
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
      },
    )

    server.registerTool(
      'get_pattern',
      {
        title: 'Get pattern',
        description: 'Fetch full detail (including source snippet) for one pattern by id.',
        inputSchema: z.object({ id: z.string() }),
      },
      async ({ id }) => {
        const pattern = getPattern(id)
        if (!pattern) {
          return {
            content: [{ type: 'text', text: `No pattern found with id "${id}"` }],
            isError: true,
          }
        }
        return { content: [{ type: 'text', text: JSON.stringify(pattern, null, 2) }] }
      },
    )

    server.registerTool(
      'validate_page',
      {
        title: 'Validate page',
        description: 'Deterministically validate generated page code against design-system governance rules (Carbon tokens, allowed components, basic a11y). Call after generating, before committing.',
        inputSchema: z.object({ code: z.string() }),
      },
      async ({ code }) => {
        const result = validatePage(code)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.registerTool(
      'register_pattern',
      {
        title: 'Register pattern',
        description: 'Open a PR adding a newly built page to the pattern registry, so future searches can match against it.',
        inputSchema: z.object({
          id: z.string(),
          tags: z.array(z.string()),
          pageType: z.string(),
          componentsUsed: z.array(z.string()),
          sourceRepo: z.string(),
          sourcePath: z.string(),
          sourceUrl: z.string(),
          liveUrl: z.string().nullable().optional(),
          description: z.string(),
          snippet: z.string().nullable().optional(),
        }),
      },
      async (input) => {
        const pattern: Pattern = {
          ...input,
          liveUrl: input.liveUrl ?? null,
          snippet: input.snippet ?? null,
        }
        try {
          const pr = await openRegisterPatternPR(pattern)
          return { content: [{ type: 'text', text: `Opened PR #${pr.number}: ${pr.url}` }] }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Failed to open PR: ${(err as Error).message}` }],
            isError: true,
          }
        }
      },
    )
  },
  { serverInfo: { name: 'design-system-mcp', version: '0.1.0' } },
)

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  const expected = process.env.MCP_SHARED_TOKEN
  if (!expected || !bearerToken || bearerToken !== expected) return undefined
  return {
    token: bearerToken,
    scopes: ['governance'],
    clientId: 'design-system-client',
  }
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
