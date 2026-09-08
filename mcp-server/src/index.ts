/**
 * VIDEON v3 MCP Server – Streamable HTTP (default) or stdio.
 * Spec: specs/domain/mcp-server.md
 *
 * Env: MCP_TRANSPORT, MCP_PORT (3103), MCP_STATELESS, VIDEON_API_URL, VIDEON_API_TOKEN
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerVideonTools } from './tools.js'

const USE_STDIO = process.env.MCP_TRANSPORT === 'stdio'
const PORT = Number(process.env.MCP_PORT) || 3103
const STATELESS = process.env.MCP_STATELESS === 'true' || process.env.MCP_STATELESS === '1'

function log(msg: string): void {
  ;(USE_STDIO ? process.stderr : process.stdout).write(`[VIDEON MCP] ${msg}\n`)
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', reject)
  })
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'videon-mcp', version: '0.1.0' },
    { capabilities: {} },
  )
  registerVideonTools(server)
  return server
}

async function handleStatelessHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  transport.onerror = (err) => log('Stateless transport error: ' + String(err))

  const mcpServer = createMcpServer()
  try {
    await mcpServer.connect(transport)
    await transport.handleRequest(
      req as Parameters<typeof transport.handleRequest>[0],
      res,
      parsedBody,
    )
  } finally {
    await mcpServer.close().catch(() => undefined)
    await transport.close().catch(() => undefined)
  }
}

async function main() {
  const mcpServer = createMcpServer()

  if (USE_STDIO) {
    const transport = new StdioServerTransport(process.stdin, process.stdout)
    await mcpServer.connect(transport)
    if (!process.env.VIDEON_API_URL || !process.env.VIDEON_API_TOKEN) {
      log('VIDEON_API_URL or VIDEON_API_TOKEN not set – tools will return configuration errors.')
    }
    log('Running in stdio mode.')
    return
  }

  process.on('unhandledRejection', (reason) => {
    log('Unhandled rejection: ' + String(reason))
  })

  let requestQueue: Promise<void> = Promise.resolve()
  const sharedTransport = STATELESS
    ? null
    : new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      })

  if (sharedTransport) {
    sharedTransport.onerror = (err) => log('Transport error: ' + String(err))
    await mcpServer.connect(sharedTransport)
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    log(`${req.method} ${req.url ?? '/'}`)
    try {
      const parsedBody = req.method === 'POST' ? await parseBody(req) : undefined

      if (STATELESS) {
        if (req.method === 'GET') {
          void handleStatelessHttpRequest(req, res, parsedBody).catch((err) => {
            log('Stateless GET error: ' + String(err))
            if (!res.headersSent) {
              res.statusCode = 500
              res.end()
            }
          })
        } else {
          requestQueue = requestQueue.then(async () => {
            await handleStatelessHttpRequest(req, res, parsedBody)
          })
          await requestQueue
        }
      } else {
        await sharedTransport!.handleRequest(
          req as Parameters<StreamableHTTPServerTransport['handleRequest']>[0],
          res,
          parsedBody,
        )
      }
    } catch (err) {
      log('Request error: ' + String(err))
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err),
            },
          }),
        )
      }
    }
  })

  server.listen(PORT, () => {
    log(`Server listening on port ${PORT} (stateless=${STATELESS})`)
    if (!process.env.VIDEON_API_URL || !process.env.VIDEON_API_TOKEN) {
      log('VIDEON_API_URL or VIDEON_API_TOKEN not set – tools will return configuration errors.')
    }
  })

  const shutdown = async () => {
    server.close()
    await mcpServer.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  process.stderr.write('[VIDEON MCP] Fatal: ' + String(err) + '\n')
  process.exit(1)
})
