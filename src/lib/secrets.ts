export interface SecretMatch {
  name: string
  matchedString: string
}

const secretPatterns: Array<{ name: string, pattern: RegExp }> = [
  { name: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS Secret Key', pattern: /aws_secret_access_key\s*=?\s*["']?[A-Za-z0-9/+=]{40}["']?/i },
  { name: 'GitHub Token', pattern: /\b(ghp|gho|github_pat)_[a-zA-Z0-9_]+\b/ },
  { name: 'Stripe Key', pattern: /\bstripe_key_fake_[a-zA-Z0-9]+\b/ },
  { name: 'Slack Token', pattern: /\bxox[baprs]-[0-9a-zA-Z]+\b/ },
  { name: 'JWT Token', pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/ },
  { name: 'Private Key', pattern: /-----BEGIN [\w\s]+ PRIVATE KEY-----/ },
  { name: 'Database URL with Password', pattern: /(postgresql|postgres|mysql|mongodb)(?:\+srv)?:\/\/[^:]+:[^@]+@/ },
  { name: 'Generic Secret', pattern: /(api_key|secret|token|password)\s*[=:]\s*["']?[^"'\s;]{8,}["']?/i }
]

export function scanForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  
  for (const { name, pattern } of secretPatterns) {
    const match = text.match(pattern)
    if (match) {
      matches.push({ name, matchedString: match[0] })
    }
  }

  return matches.filter((m, i, self) => i === self.findIndex(s => s.name === m.name))
}
