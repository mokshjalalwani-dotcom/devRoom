'use client'
import { useState, useEffect } from 'react'

let highlighterPromise: Promise<any> | null = null

export function CodeHighlighter({ code, language = 'text' }: { code: string, language?: string }) {
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    let mounted = true
    if (!highlighterPromise) {
      // Lazy load shiki
      import('shiki').then(({ createHighlighter }) => {
        highlighterPromise = createHighlighter({
          themes: ['github-dark', 'github-light'],
          langs: ['javascript', 'typescript', 'python', 'java', 'rust', 'go', 'c', 'cpp', 'html', 'css', 'json', 'sql', 'bash', 'shell', 'yaml', 'markdown']
        })
        highlighterPromise.then(runHighlight)
      })
    } else {
      highlighterPromise!.then(runHighlight)
    }

    function runHighlight(highlighter: any) {
      if (!mounted) return
      
      const loadedLangs = highlighter.getLoadedLanguages()
      let lang = language
      if (lang === 'command') lang = 'bash'
      
      const resolvedLang = loadedLangs.includes(lang as any) ? lang : 'text'
      
      try {
        const out = highlighter.codeToHtml(code, { 
          lang: resolvedLang, 
          themes: {
            light: 'github-light',
            dark: 'github-dark'
          }
        })
        setHtml(out)
      } catch (e) {
        const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        setHtml(`<pre><code>${escaped}</code></pre>`)
      }
    }
    
    return () => { mounted = false }
  }, [code, language])

  if (!html) {
    return <div className="p-4 text-sm text-zinc-500 font-mono animate-pulse">Loading syntax...</div>
  }

  return (
    <div 
      className="text-sm font-mono overflow-x-auto [&>pre]:!bg-transparent [&>pre]:m-0 [&>pre]:p-4"
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  )
}
