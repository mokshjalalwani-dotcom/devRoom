import { describe, test, expect } from 'vitest'
import { detectContent } from '../src/lib/detector'

describe('detectContent', () => {
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
