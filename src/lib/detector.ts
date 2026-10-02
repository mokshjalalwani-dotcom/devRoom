/**
 * src/lib/detector.ts – v2
 * ─────────────────────────────────────────────────────────────────
 * All v1 detections preserved and tests kept passing.
 * New in v2: log, diff, markdown, curl, jwt, timestamp, base64.
 * ─────────────────────────────────────────────────────────────────
 */
import { scanForSecrets } from './secrets'

export type ContentType =
  | 'url'
  | 'json'
  | 'sql'
  | 'command'
  | 'error'
  | 'code'
  | 'env'
  | 'text'
  // v2 additions
  | 'image'
  | 'log'
  | 'diff'
  | 'markdown'
  | 'curl'
  | 'jwt'
  | 'timestamp'
  | 'base64'

export interface DetectionResult {
  type: ContentType
  language?: string
  meta?: any
}

// ─── helpers ──────────────────────────────────────────────────────

function isLikelyBase64(text: string): boolean {
  // Must be a single "word" of base64 chars, at least 16 chars, padded correctly
  const s = text.trim()
  if (s.length < 16) return false
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return false
  // Must be divisible by 4 when padded
  const padded = s.endsWith('=') ? s : s + '='.repeat((4 - (s.length % 4)) % 4)
  if (padded.length % 4 !== 0) return false
  // Must decode to valid UTF-8 or binary
  try { atob(s.replace(/-/g, '+').replace(/_/g, '/')) } catch { return false }
  return true
}

function isJWT(text: string): boolean {
  // Three base64url segments separated by dots, each at least 4 chars
  const parts = text.trim().split('.')
  if (parts.length !== 3) return false
  return parts.every(p => /^[A-Za-z0-9_=-]+$/.test(p) && p.length >= 4)
}

function decodeJWTPart(part: string): Record<string, any> | null {
  try {
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4)
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch { return null }
}

// ─── main detector ────────────────────────────────────────────────

export function detectContent(text: string): DetectionResult {
  const trimmed = text.trim()
  if (!trimmed) return { type: 'text' }

  // ─── 1. URL ──────────────────────────────────────────────────────
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.hostname === 'github.com') {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          const owner = parts[0], repo = parts[1]
          let title = `${owner}/${repo}`
          if (parts.length >= 4 && (parts[2] === 'issues' || parts[2] === 'pull')) title += `#${parts[3]}`
          return { type: 'url', meta: { domain: url.hostname, path: url.pathname, title } }
        }
      }
      return { type: 'url', meta: { domain: url.hostname, path: url.pathname } }
    }
  } catch { /* not a single valid URL */ }

  // ─── 2. JWT ──────────────────────────────────────────────────────
  if (isJWT(trimmed)) {
    const parts = trimmed.split('.')
    const header = decodeJWTPart(parts[0])
    const payload = decodeJWTPart(parts[1])
    const now = Math.floor(Date.now() / 1000)
    const exp = payload?.exp
    const iat = payload?.iat
    return {
      type: 'jwt',
      meta: {
        header,
        payload,
        expired: exp ? exp < now : false,
        expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
        issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
        alg: header?.alg || 'unknown'
      }
    }
  }

  // ─── 3. JSON ─────────────────────────────────────────────────────
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return { type: 'json' } } catch { /* not valid JSON */ }
  }

  // ─── 4. SQL ──────────────────────────────────────────────────────
  const sqlKeywords = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i
  if (sqlKeywords.test(trimmed)) return { type: 'sql' }

  const lines = trimmed.split('\n')
  const firstLine = lines[0].trim()

  // ─── 5. curl ─────────────────────────────────────────────────────
  if (/^curl\s/i.test(firstLine)) {
    return { type: 'curl', meta: parseCurl(trimmed) }
  }

  // ─── 6. Command ──────────────────────────────────────────────────
  const commandPatterns = [
    /^\$\s+/,
    /^(npm|npx|yarn|pnpm|git|docker|kubectl|pip|python|node|cd|ls|cat|sudo|bash|sh|zsh|brew|apt|apt-get|yum)\b/
  ]
  if (lines.length <= 5 && commandPatterns.some(p => p.test(firstLine))) {
    return { type: 'command' }
  }

  // ─── 7. Error / stack trace ──────────────────────────────────────
  const errorPatterns = [
    /\bError:/i, /\bException\b/i, /Traceback \(most recent call last\):/i,
    /^\s*at\s+/m, /ECONNREFUSED/, /EADDRINUSE/, /panic:/, /FATAL:/,
    /^(ERROR|FATAL|CRITICAL)\s+/   // standalone log-level line treated as error
  ]
  if (errorPatterns.some(p => p.test(trimmed))) return { type: 'error' }

  // ─── 8. Base64 ───────────────────────────────────────────────────
  // Must come before env check: btoa() output can match KEY=value pattern.
  // Only detect single-line blobs of base64 chars, length >= 20.
  if (
    !trimmed.includes(' ') &&
    !trimmed.includes('\n') &&
    trimmed.length >= 20 &&
    !/^[A-Z0-9_]+=/.test(trimmed) && // exclude ENV_KEY=value style
    isLikelyBase64(trimmed)
  ) {
    return { type: 'base64' }
  }

  // ─── 9. Env file ─────────────────────────────────────────────────
  const envPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)=(.+)$/
  const envLines = lines.filter(l => l.trim().length > 0)
  const isEnv = envLines.length > 0 && envLines.every(l => {
    const t = l.trim()
    return envPattern.test(t) || t.startsWith('#')
  })
  if (isEnv) return { type: 'env' }

  // ─── 10. Unified diff ────────────────────────────────────────────
  if (/^(diff --git|--- |\+\+\+ |@@)/m.test(trimmed) &&
    (trimmed.includes('\n+') || trimmed.includes('\n-'))) {
    return { type: 'diff' }
  }

  // ─── 11. Log lines ───────────────────────────────────────────────
  const logLevelPat = /\b(ERROR|WARN|INFO|DEBUG|TRACE|CRITICAL|WARNING)\b/
  const logTimePat = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/
  const logLines = lines.filter(l => l.trim())
  const logMatches = logLines.filter(l => logLevelPat.test(l) || logTimePat.test(l))
  if (logLines.length >= 2 && logMatches.length >= Math.ceil(logLines.length * 0.5)) {
    return { type: 'log' }
  }

  // ─── 12. Markdown ────────────────────────────────────────────────
  const mdPatterns = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /`{3}[\s\S]*`{3}/,
    /\[.+\]\(.+\)/,
    /\*\*.+\*\*/,
  ]
  const mdScore = mdPatterns.filter(p => p.test(trimmed)).length
  if (mdScore >= 2) return { type: 'markdown' }

  // ─── 13. Timestamp ───────────────────────────────────────────────
  if (/^\d{10}$/.test(trimmed)) {
    const ts = parseInt(trimmed)
    if (ts > 978307200 && ts < 4102444800) {
      return { type: 'timestamp', meta: { unix: ts, iso: new Date(ts * 1000).toISOString() } }
    }
  }
  if (/^\d{13}$/.test(trimmed)) {
    const ts = parseInt(trimmed)
    return { type: 'timestamp', meta: { unix: Math.floor(ts / 1000), iso: new Date(ts).toISOString() } }
  }
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(trimmed) && !isNaN(Date.parse(trimmed))) {
    const d = new Date(trimmed)
    return { type: 'timestamp', meta: { unix: Math.floor(d.getTime() / 1000), iso: d.toISOString() } }
  }

  // ─── 14. Code heuristics ─────────────────────────────────────────
  if (/<[a-z][\s\S]*>/i.test(trimmed) && trimmed.includes('</')) {
    return { type: 'code', language: 'html' }
  }

  // Python (check BEFORE TypeScript to avoid false positives from 'import')
  if (
    /^(def\s+\w+\(|from\s+[\w.]+\s+import|import\s+(os|sys|json|math|time|datetime|re|django|flask|requests|numpy|pandas|torch|sklearn)\b)/m.test(trimmed) ||
    (/:\s*$/m.test(trimmed) && /^\s*(class|def|if|elif|else|for|while|try|except|with)\b/m.test(trimmed))
  ) {
    return { type: 'code', language: 'python' }
  }

  // TypeScript / JavaScript
  if (
    /^(const|let|var|function|export\s+default|interface|type\s+\w+\s*=)\b/m.test(trimmed) ||
    /=>/.test(trimmed) ||
    /import\s+.*?from\s+['"]/.test(trimmed) ||
    /console\.log/.test(trimmed) ||
    /^\s*class\s+\w+\s*(extends\s+\w+)?\s*\{/m.test(trimmed)
  ) {
    return { type: 'code', language: 'typescript' }
  }

  if (/^(public|private|protected)\s+(class|interface|enum)\b/.test(trimmed)) {
    return { type: 'code', language: 'java' }
  }

  if (/^(fn|pub|struct|impl|use)\b/.test(trimmed) && !trimmed.includes('=>')) {
    return { type: 'code', language: 'rust' }
  }

  if (/^(package\s+\w|func\s+\w|import\s*\(|type\s+\w+\s+struct)/.test(trimmed)) {
    return { type: 'code', language: 'go' }
  }

  if (/^(#include|int\s+main)/.test(trimmed)) {
    return { type: 'code', language: 'cpp' }
  }

  if (trimmed.includes('{') && trimmed.includes('}') && /^[.#a-zA-Z0-9_-]+[ \t]*\{/m.test(trimmed)) {
    return { type: 'code', language: 'css' }
  }

  if (trimmed.includes('{') && trimmed.includes('}') && trimmed.includes(';')) {
    return { type: 'code', language: 'javascript' }
  }

  // ─── 15. Fallback ────────────────────────────────────────────────
  return { type: 'text' }
}

// ─── curl parser ─────────────────────────────────────────────────

export interface CurlParsed {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  isJson: boolean
}

export function parseCurl(curlText: string): CurlParsed {
  // Flatten line continuations
  const flat = curlText.replace(/\\\n\s*/g, ' ').trim()

  const result: CurlParsed = { url: '', method: 'GET', headers: {}, body: null, isJson: false }

  // Tokenise (simple split — good enough for structured curl commands)
  const tokens = flat.split(/\s+/)

  // Flags that consume the NEXT token as their argument
  const consumingFlags = new Set(['-X', '--request', '-H', '--header', '-d', '--data',
    '--data-raw', '--data-binary', '-u', '--user', '-o', '--output', '--json',
    '-A', '--user-agent', '--max-time', '-m', '--connect-timeout', '--proxy'])

  let i = 1 // skip 'curl'
  while (i < tokens.length) {
    const t = tokens[i]
    if (consumingFlags.has(t) || consumingFlags.has(t.split('=')[0])) {
      i += 2  // skip flag AND its value
      continue
    }
    if (t.startsWith('-')) { i++; continue }
    // First non-flag token is the URL
    result.url = t.replace(/^['"]|['"]$/g, '')
    break
  }


  // -X / --request method
  const methodMatch = flat.match(/-X\s+(\w+)|--request\s+(\w+)/)
  if (methodMatch) result.method = methodMatch[1] || methodMatch[2]

  // -H / --header
  const headerMatches = [...flat.matchAll(/-H\s+['"]([^'"]+)['"]/g)]
  for (const m of headerMatches) {
    const [key, ...rest] = m[1].split(':')
    result.headers[key.trim()] = rest.join(':').trim()
    if (key.trim().toLowerCase() === 'content-type' && rest.join(':').includes('json')) result.isJson = true
  }

  // --json flag (implies POST + content-type: application/json)
  if (flat.includes('--json')) {
    result.isJson = true
    if (result.method === 'GET') result.method = 'POST'
  }

  // -d / --data / --data-raw / --json
  const dataMatch = flat.match(/(?:-d|--data(?:-raw)?|--json)\s+(['"])([\s\S]*?)\1/)
  if (dataMatch) {
    result.body = dataMatch[2]
    if (result.method === 'GET') result.method = 'POST'
  }

  // Scan Authorization headers for secrets
  if (result.headers['Authorization']) {
    scanForSecrets(result.headers['Authorization'])
  }

  return result
}

/**
 * Convert a parsed curl command to a JavaScript fetch snippet.
 */
export function curlToFetch(parsed: CurlParsed): string {
  const lines: string[] = []
  const opts: string[] = [`  method: '${parsed.method}'`]

  if (Object.keys(parsed.headers).length > 0) {
    const hLines = Object.entries(parsed.headers).map(([k, v]) => `    '${k}': '${v}'`)
    opts.push(`  headers: {\n${hLines.join(',\n')}\n  }`)
  }

  if (parsed.body) {
    opts.push(`  body: ${parsed.isJson ? `JSON.stringify(${parsed.body})` : `'${parsed.body}'`}`)
  }

  lines.push(`const response = await fetch('${parsed.url}', {`)
  lines.push(opts.join(',\n'))
  lines.push('});')
  lines.push('const data = await response.json();')
  return lines.join('\n')
}
