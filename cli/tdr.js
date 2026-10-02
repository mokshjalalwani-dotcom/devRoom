#!/usr/bin/env node

/**
 * tdr - Temporal Dev Room CLI
 * Usage:
 *   cat file.log | tdr <room-id> [passcode]
 *   tdr <room-id> [passcode] "some text"
 */

const https = require('https')
const http = require('http')

const roomId = process.argv[2]
if (!roomId) {
  console.error('Usage: tdr <room-id> [passcode] [text]')
  process.exit(1)
}

let passcode = process.argv[3]
let content = process.argv[4]

// If there are only 3 args (tdr roomId text), second is text not passcode.
if (!content && process.argv.length === 4) {
  content = passcode
  passcode = null
}

const submit = (text) => {
  if (!text || !text.trim()) {
    console.error('No content provided')
    process.exit(1)
  }

  const baseUrl = process.env.TDR_URL || 'https://tdr.app'
  const url = new URL(`/api/cli`, baseUrl)
  const reqLib = url.protocol === 'https:' ? https : http

  const data = JSON.stringify({ roomId, content: text, passcode })

  const req = reqLib.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    let resBody = ''
    res.on('data', d => resBody += d)
    res.on('end', () => {
      if (res.statusCode >= 400) {
        console.error('Error:', resBody)
        process.exit(1)
      } else {
        console.log('Successfully pushed to room:', roomId)
      }
    })
  })

  req.on('error', (e) => {
    console.error('Network error:', e.message)
  })

  req.write(data)
  req.end()
}

if (!process.stdin.isTTY) {
  let piped = ''
  process.stdin.on('data', chunk => piped += chunk)
  process.stdin.on('end', () => submit(piped + (content ? '\n' + content : '')))
} else {
  submit(content)
}
