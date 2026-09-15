export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 640 }}>
      <h1>Design System MCP Server</h1>
      <p>
        Internal MCP server for Carbon design-system governance and pattern
        reuse across the Claude Design → Claude Code → GitHub → Vercel
        pipeline. Not a public-facing app.
      </p>
      <p>
        MCP endpoint: <code>/api/mcp</code> (Streamable HTTP, bearer token
        required)
      </p>
    </main>
  )
}
