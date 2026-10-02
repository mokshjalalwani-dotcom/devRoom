export type ContentType = 'url' | 'json' | 'sql' | 'command' | 'error' | 'code' | 'env' | 'text'

export interface DetectionResult {
  type: ContentType
  language?: string
  meta?: any
}

export function detectContent(text: string): DetectionResult {
  const trimmed = text.trim()
  if (!trimmed) return { type: 'text' }

  // 1. URL
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      // Check if it's a GitHub URL
      if (url.hostname === 'github.com') {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          const owner = parts[0]
          const repo = parts[1]
          let title = `${owner}/${repo}`
          if (parts.length >= 4 && (parts[2] === 'issues' || parts[2] === 'pull')) {
            title += `#${parts[3]}`
          }
          return { type: 'url', meta: { domain: url.hostname, path: url.pathname, title } }
        }
      }
      return { type: 'url', meta: { domain: url.hostname, path: url.pathname } }
    }
  } catch (e) {
    // not a single valid URL
  }

  // 2. JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return { type: 'json' }
    } catch (e) {
      // not valid JSON
    }
  }

  // 3. SQL
  const sqlKeywords = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i
  if (sqlKeywords.test(trimmed)) {
    return { type: 'sql' }
  }

  const lines = trimmed.split('\n')
  const firstLine = lines[0].trim()

  // 4. Command
  const commandLinePatterns = [
    /^\$\s+/,
    /^(npm|npx|yarn|pnpm|git|docker|kubectl|curl|pip|python|node|cd|ls|cat|sudo)\b/
  ]
  if (lines.length <= 5) {
    if (commandLinePatterns.some(p => p.test(firstLine))) {
      return { type: 'command' }
    }
  }

  // 5. Error
  const errorPatterns = [
    /\bError:/i,
    /\bException\b/i,
    /Traceback \(most recent call last\):/i,
    /^\s*at\s+/m,
    /ECONNREFUSED/,
    /EADDRINUSE/,
    /panic:/,
    /FATAL:/
  ]
  if (errorPatterns.some(p => p.test(trimmed))) {
    return { type: 'error' }
  }

  // 6. Env
  const envPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)=(.+)$/
  const envLines = lines.filter(l => l.trim().length > 0)
  const isEnv = envLines.length > 0 && envLines.every(l => {
    const t = l.trim()
    return envPattern.test(t) || t.startsWith('#')
  })
  if (isEnv) {
    return { type: 'env' }
  }

  // 7. Code Heuristics
  if (/<[a-z][\s\S]*>/i.test(trimmed) && trimmed.includes('</')) {
    return { type: 'code', language: 'html' }
  }
  
  if (/^(const|let|var|function|import|export|class|interface|type)\b/m.test(trimmed) || /=>/.test(trimmed)) {
    return { type: 'code', language: 'typescript' }
  }
  
  if (/^(def|class|import|from)\b/m.test(trimmed) || /if __name__ == .__main__.:/.test(trimmed)) {
    return { type: 'code', language: 'python' }
  }
  
  if (/^(public|private|protected)\s+(class|interface|enum)\b/.test(trimmed)) {
    return { type: 'code', language: 'java' }
  }
  
  if (/^(fn|pub|struct|impl|use)\b/.test(trimmed)) {
    return { type: 'code', language: 'rust' }
  }
  
  if (/^(package|func|import|type.*struct)\b/.test(trimmed)) {
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

  // 8. Fallback
  return { type: 'text' }
}
