import { describe, test, expect } from 'vitest'
import { detectContent, parseCurl, curlToFetch } from '../src/lib/detector'

// ─── EXISTING V1 TESTS (must stay green) ─────────────────────────

describe('v1 – detectContent', () => {
  test('detects plain text', () => {
    expect(detectContent('hello world').type).toBe('text')
    expect(detectContent('').type).toBe('text')
    expect(detectContent('   ').type).toBe('text')
  })

  test('detects url', () => {
    expect(detectContent('https://example.com').type).toBe('url')
    expect(detectContent('http://localhost:3000/foo/bar').type).toBe('url')
    expect(detectContent('https://github.com/vercel/next.js')).toEqual({
      type: 'url',
      meta: { domain: 'github.com', path: '/vercel/next.js', title: 'vercel/next.js' }
    })
  })

  test('detects json', () => {
    expect(detectContent('{"foo":"bar"}').type).toBe('json')
    expect(detectContent('[1,2,3]').type).toBe('json')
    expect(detectContent('{\n  "a": 1\n}')).toEqual({ type: 'json' })
    expect(detectContent('{foo:bar}')).toEqual({ type: 'text' }) // Invalid JSON
  })

  test('detects sql', () => {
    expect(detectContent('SELECT * FROM users').type).toBe('sql')
    expect(detectContent('insert into foo (bar) values (1)').type).toBe('sql')
  })

  test('detects command', () => {
    expect(detectContent('$ npm run dev').type).toBe('command')
    expect(detectContent('git status').type).toBe('command')
    expect(detectContent('docker ps')).toEqual({ type: 'command' })
  })

  test('detects error', () => {
    expect(detectContent('Error: something went wrong')).toEqual({ type: 'error' })
    expect(detectContent('java.lang.Exception: foo')).toEqual({ type: 'error' })
    expect(detectContent('    at Object.<anonymous> (/app/index.js:1:1)')).toEqual({ type: 'error' })
  })

  test('detects env', () => {
    expect(detectContent('FOO=bar\nBAZ=123')).toEqual({ type: 'env' })
    expect(detectContent('FOO=bar\n# comment\nBAZ=123')).toEqual({ type: 'env' })
  })

  test('detects code', () => {
    expect(detectContent('const x = 1;')).toEqual({ type: 'code', language: 'typescript' })
    expect(detectContent('import { useState } from "react"')).toEqual({ type: 'code', language: 'typescript' })
    expect(detectContent('def foo():\n  pass')).toEqual({ type: 'code', language: 'python' })
    expect(detectContent('public class Foo { }')).toEqual({ type: 'code', language: 'java' })
    expect(detectContent('fn main() { }')).toEqual({ type: 'code', language: 'rust' })
    expect(detectContent('<div>Hello</div>')).toEqual({ type: 'code', language: 'html' })
    expect(detectContent('.foo {\n  color: red;\n}')).toEqual({ type: 'code', language: 'css' })
  })
})

// ─── V2 TESTS: JWT ───────────────────────────────────────────────

describe('v2 – JWT detection', () => {
  // A real-ish JWT (header.payload.sig all base64url)
  const sampleJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

  test('detects a JWT', () => {
    expect(detectContent(sampleJWT).type).toBe('jwt')
  })

  test('JWT meta has header and payload', () => {
    const result = detectContent(sampleJWT)
    expect(result.meta?.header?.alg).toBe('HS256')
    expect(result.meta?.payload?.sub).toBe('1234567890')
  })

  test('JWT meta includes issuedAt', () => {
    const result = detectContent(sampleJWT)
    expect(result.meta?.issuedAt).toBeTruthy()
  })

  test('expired JWT is flagged', () => {
    // payload with exp in the past
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const payload = btoa(JSON.stringify({ exp: 1000000, iat: 900000 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const expired = `${header}.${payload}.signature`
    const result = detectContent(expired)
    expect(result.type).toBe('jwt')
    expect(result.meta?.expired).toBe(true)
  })

  test('non-JWT three-part string is not jwt', () => {
    // contains dots but isn't base64url
    expect(detectContent('a.b.c').type).not.toBe('jwt')
  })
})

// ─── V2 TESTS: Diff ──────────────────────────────────────────────

describe('v2 – unified diff detection', () => {
  test('detects git diff output', () => {
    const diff = `diff --git a/foo.js b/foo.js
--- a/foo.js
+++ b/foo.js
@@ -1,3 +1,3 @@
-const x = 1;
+const x = 2;
 const y = 3;`
    expect(detectContent(diff).type).toBe('diff')
  })

  test('detects --- +++ @@ format without git diff header', () => {
    const diff = `--- a/file.py
+++ b/file.py
@@ -1,2 +1,3 @@
-old line
+new line
+added`
    expect(detectContent(diff).type).toBe('diff')
  })

  test('does not false-positive on plus signs in JSON', () => {
    expect(detectContent('{"key":"+value"}')).toEqual({ type: 'json' })
  })
})

// ─── V2 TESTS: Log detection ─────────────────────────────────────

describe('v2 – log detection', () => {
  test('detects multi-line log output with level tags', () => {
    const log = `2024-01-01 12:00:00 INFO  Server started
2024-01-01 12:00:01 ERROR Connection refused
2024-01-01 12:00:02 WARN  Retry attempt 1`
    expect(detectContent(log).type).toBe('log')
  })

  test('detects logs with bracketed levels', () => {
    const log = `[INFO] Starting app
[ERROR] Database unreachable
[DEBUG] Query took 120ms`
    expect(detectContent(log).type).toBe('log')
  })

  test('single line log is NOT detected as log (too little signal)', () => {
    // Single line with ERROR could be an error type
    expect(detectContent('ERROR something failed').type).toBe('error')
  })
})

// ─── V2 TESTS: Markdown ──────────────────────────────────────────

describe('v2 – markdown detection', () => {
  test('detects markdown with heading + list', () => {
    const md = `# Title\n\n- Item one\n- Item two\n`
    expect(detectContent(md).type).toBe('markdown')
  })

  test('detects markdown with link and bold', () => {
    const md = `See **this** [link](https://example.com) for more info`
    expect(detectContent(md).type).toBe('markdown')
  })

  test('detects markdown with fenced code block', () => {
    const md = `# Heading\n\n\`\`\`js\nconsole.log(1)\n\`\`\``
    expect(detectContent(md).type).toBe('markdown')
  })

  test('plain text with one asterisk is not markdown', () => {
    expect(detectContent('price is 2*5 dollars').type).toBe('text')
  })
})

// ─── V2 TESTS: curl ──────────────────────────────────────────────

describe('v2 – curl detection and parsing', () => {
  test('detects curl command', () => {
    expect(detectContent('curl https://api.example.com/data').type).toBe('curl')
  })

  test('parses method from -X flag', () => {
    const result = parseCurl('curl -X POST https://api.example.com')
    expect(result.method).toBe('POST')
    expect(result.url).toBe('https://api.example.com')
  })

  test('parses headers', () => {
    const result = parseCurl(`curl -H 'Authorization: Bearer token123' https://api.example.com`)
    expect(result.headers['Authorization']).toBe('Bearer token123')
  })

  test('parses -d body and sets method to POST', () => {
    const result = parseCurl(`curl -d '{"key":"val"}' https://api.example.com`)
    expect(result.method).toBe('POST')
    expect(result.body).toBeTruthy()
  })

  test('curlToFetch generates valid fetch snippet', () => {
    const parsed = parseCurl('curl -X GET https://api.example.com/items')
    const snippet = curlToFetch(parsed)
    expect(snippet).toContain('fetch(')
    expect(snippet).toContain('https://api.example.com/items')
  })

  test('curlToFetch includes headers', () => {
    const parsed = parseCurl(`curl -H 'Content-Type: application/json' https://api.example.com`)
    const snippet = curlToFetch(parsed)
    expect(snippet).toContain('Content-Type')
    expect(snippet).toContain('application/json')
  })
})

// ─── V2 TESTS: Timestamp ─────────────────────────────────────────

describe('v2 – timestamp detection', () => {
  test('detects Unix seconds timestamp', () => {
    const result = detectContent('1700000000')
    expect(result.type).toBe('timestamp')
    expect(result.meta?.unix).toBe(1700000000)
    expect(result.meta?.iso).toBeTruthy()
  })

  test('detects Unix milliseconds timestamp', () => {
    const result = detectContent('1700000000000')
    expect(result.type).toBe('timestamp')
    expect(result.meta?.unix).toBe(1700000000)
  })

  test('detects ISO date string', () => {
    const result = detectContent('2024-01-15T10:30:00.000Z')
    expect(result.type).toBe('timestamp')
    expect(result.meta?.iso).toBeTruthy()
  })

  test('does not detect arbitrary 10-digit number as timestamp', () => {
    // Out of range (year 1900)
    expect(detectContent('0000000001').type).not.toBe('timestamp')
  })

  test('detects ISO date without time', () => {
    const result = detectContent('2024-06-15')
    expect(result.type).toBe('timestamp')
  })
})

// ─── V2 TESTS: Base64 ────────────────────────────────────────────

describe('v2 – base64 detection', () => {
  test('detects valid base64 string', () => {
    const b64 = btoa('Hello, this is a test string for base64!')
    expect(detectContent(b64).type).toBe('base64')
  })

  test('does not detect short strings as base64', () => {
    expect(detectContent('aGVsbG8=').type).not.toBe('base64') // too short (8 chars)
  })

  test('does not detect strings with spaces as base64', () => {
    expect(detectContent('hello world base 64').type).not.toBe('base64')
  })

  test('does not detect URLs as base64', () => {
    expect(detectContent('https://example.com').type).toBe('url')
  })
})

// ─── V2 TESTS: Python vs TypeScript disambiguation ────────────────

describe('v2 – Python vs TypeScript disambiguation', () => {
  test('Python import os is python', () => {
    expect(detectContent('import os\nprint(os.getcwd())').type).toBe('code')
    expect(detectContent('import os\nprint(os.getcwd())').language).toBe('python')
  })

  test('def function is python', () => {
    expect(detectContent('def greet(name: str) -> str:\n    return f"Hello {name}"').language).toBe('python')
  })

  test('import from react is typescript', () => {
    expect(detectContent('import React from "react"').language).toBe('typescript')
  })

  test('Python with class and colon', () => {
    expect(detectContent('class MyClass:\n    def __init__(self):\n        self.x = 1').language).toBe('python')
  })

  test('TypeScript interface is not python', () => {
    expect(detectContent('interface Foo {\n  bar: string\n}').language).toBe('typescript')
  })
})

// ─── V2 TESTS: additional code languages ─────────────────────────

describe('v2 – extended code detection', () => {
  test('detects Go package declaration', () => {
    expect(detectContent('package main\n\nfunc main() {\n  fmt.Println("hi")\n}').language).toBe('go')
  })

  test('detects Rust fn main', () => {
    expect(detectContent('fn main() {\n  println!("hi");\n}').language).toBe('rust')
  })

  test('detects C++ include', () => {
    expect(detectContent('#include <iostream>\nint main() { return 0; }').language).toBe('cpp')
  })

  test('detects SQL UPDATE', () => {
    expect(detectContent('UPDATE users SET email = ? WHERE id = ?').type).toBe('sql')
  })

  test('detects SQL DELETE', () => {
    expect(detectContent('DELETE FROM sessions WHERE expires_at < NOW()').type).toBe('sql')
  })

  test('detects SQL WITH CTE', () => {
    expect(detectContent('WITH cte AS (SELECT id FROM rooms) SELECT * FROM cte').type).toBe('sql')
  })
})
