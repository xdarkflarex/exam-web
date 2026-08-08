#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cacheDir = path.join(root, '.ai-cache', 'rag')
const defaultStorePath = path.join(cacheDir, 'store.json')
const defaultModel = 'nomic-embed-text'
const defaultEndpoint = 'http://127.0.0.1:11434'
const allowedExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.md', '.sql', '.json', '.css', '.yml', '.yaml', '.example'])
const skippedDirectories = new Set([
  '.git', '.next', '.ai-cache', '.understand-anything', '.gitnexus',
  '.cocoindex', '.cocoindex_code', 'node_modules',
])
const scanRoots = ['src', 'docs', 'ai', 'scripts', 'supabase/migrations', 'supabase/preflight']
const rootFiles = ['AGENTS.md', 'README.md', '.env.example', 'package.json']
const maxSourceBytes = 800_000
const chunkSize = 1_600
const chunkOverlap = 220

function usage() {
  console.log(`Usage:
  node scripts/ai-rag.mjs doctor [--model nomic-embed-text]
  node scripts/ai-rag.mjs index [--model nomic-embed-text]
  node scripts/ai-rag.mjs query "words to search" [--top 6] [--max-bytes 60000]

Options:
  --endpoint http://127.0.0.1:11434  Local Ollama endpoint only
  --model <name>                    Default: nomic-embed-text
  --top <count>                     Default: 6
  --max-bytes <count>               Default: 60000
  --output <path>                   Default: .ai-cache/rag/query-<slug>.md
`)
}

function parseArguments(argv) {
  const options = { model: defaultModel, endpoint: defaultEndpoint, top: 6, maxBytes: 60_000, output: null, query: [] }
  let command = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!command && !argument.startsWith('-')) command = argument
    else if (argument === '--model') options.model = argv[++index] || ''
    else if (argument === '--endpoint') options.endpoint = argv[++index] || ''
    else if (argument === '--top') options.top = Math.max(1, Math.min(30, Number(argv[++index] || 6)))
    else if (argument === '--max-bytes') options.maxBytes = Math.max(4_000, Number(argv[++index] || 60_000))
    else if (argument === '--output') options.output = argv[++index] || ''
    else if (argument === '--help' || argument === '-h') options.help = true
    else options.query.push(argument)
  }
  return { command, options }
}

function assertLocalEndpoint(rawEndpoint) {
  let endpoint
  try {
    endpoint = new URL(rawEndpoint)
  } catch {
    throw new Error(`Invalid Ollama endpoint: ${rawEndpoint}`)
  }
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  if (!['http:', 'https:'].includes(endpoint.protocol) || !localHosts.has(endpoint.hostname)) {
    throw new Error('Only a loopback Ollama endpoint is allowed; repository text must remain on this machine.')
  }
  return endpoint.toString().replace(/\/$/, '')
}

function relative(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return fallback
  }
}

async function walk(directory) {
  if (!fsSync.existsSync(directory)) return []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && (skippedDirectories.has(entry.name) || entry.name.startsWith('.cocoindex'))) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolutePath))
    else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolutePath)
  }
  return files
}

function chunkFile(file, content) {
  const lines = content.split(/\r?\n/)
  const chunks = []
  let start = 0
  while (start < lines.length) {
    let end = start
    let length = 0
    while (end < lines.length && (length + lines[end].length + 1 <= chunkSize || end === start)) {
      length += lines[end].length + 1
      end += 1
    }
    const text = lines.slice(start, end).join('\n').trim()
    if (text) {
      const contentHash = sha256(text)
      chunks.push({
        id: sha256(`${file}:${start + 1}:${end}:${contentHash}`),
        file,
        startLine: start + 1,
        endLine: end,
        text,
        contentHash,
      })
    }
    if (end >= lines.length) break
    let overlapLength = 0
    let nextStart = end
    while (nextStart > start && overlapLength < chunkOverlap) {
      nextStart -= 1
      overlapLength += lines[nextStart].length + 1
    }
    start = Math.max(start + 1, nextStart)
  }
  return chunks
}

async function collectChunks() {
  const files = new Set(rootFiles.map((file) => path.join(root, file)))
  for (const scanRoot of scanRoots) for (const file of await walk(path.join(root, scanRoot))) files.add(file)
  const chunks = []
  for (const absolutePath of [...files].sort((a, b) => relative(a).localeCompare(relative(b)))) {
    if (!fsSync.existsSync(absolutePath) || fsSync.statSync(absolutePath).size > maxSourceBytes) continue
    const file = relative(absolutePath)
    if (path.posix.basename(file).startsWith('.env') && file !== '.env.example') continue
    chunks.push(...chunkFile(file, await fs.readFile(absolutePath, 'utf8')))
  }
  return chunks
}

async function requestJson(endpoint, route, body) {
  let response
  try {
    response = await fetch(`${endpoint}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    throw new Error(`Cannot reach local Ollama at ${endpoint}. Start it, then run \`ollama pull ${defaultModel}\`. (${error.message})`)
  }
  if (!response.ok) throw new Error(`Ollama ${route} failed (${response.status}): ${(await response.text()).slice(0, 400)}`)
  return response.json()
}

async function embeddings(endpoint, model, inputs) {
  try {
    const result = await requestJson(endpoint, '/api/embed', { model, input: inputs })
    if (Array.isArray(result.embeddings) && result.embeddings.length === inputs.length) return result.embeddings
  } catch (error) {
    if (!/404/.test(error.message)) throw error
  }
  const vectors = []
  for (const input of inputs) {
    const result = await requestJson(endpoint, '/api/embeddings', { model, prompt: input })
    if (!Array.isArray(result.embedding)) throw new Error('Ollama returned an embedding in an unexpected format.')
    vectors.push(result.embedding)
  }
  return vectors
}

function embeddingInput(chunk) {
  return `Repository file: ${chunk.file}\nLines: ${chunk.startLine}-${chunk.endLine}\n\n${chunk.text}`
}

async function readStore(storePath) {
  if (!fsSync.existsSync(storePath)) return null
  try {
    return JSON.parse(await fs.readFile(storePath, 'utf8'))
  } catch {
    return null
  }
}

async function buildIndex(options) {
  const endpoint = assertLocalEndpoint(options.endpoint)
  const chunks = await collectChunks()
  if (!chunks.length) throw new Error('No repository files matched the local RAG scope.')
  const existing = await readStore(defaultStorePath)
  const reusable = new Map()
  if (existing?.model === options.model && Array.isArray(existing.chunks)) {
    for (const chunk of existing.chunks) if (Array.isArray(chunk.embedding)) reusable.set(chunk.contentHash, chunk.embedding)
  }

  const missing = chunks.filter((chunk) => !reusable.has(chunk.contentHash))
  for (let index = 0; index < missing.length; index += 24) {
    const batch = missing.slice(index, index + 24)
    const vectors = await embeddings(endpoint, options.model, batch.map(embeddingInput))
    vectors.forEach((vector, vectorIndex) => reusable.set(batch[vectorIndex].contentHash, vector))
    console.log(`Embedded ${Math.min(index + batch.length, missing.length)}/${missing.length} changed chunks`)
  }
  const indexedChunks = chunks.map((chunk) => ({ ...chunk, embedding: reusable.get(chunk.contentHash) }))
  const store = {
    schema: 'exam-web-local-rag-v1',
    generatedAt: new Date().toISOString(),
    root: root.replace(/\\/g, '/'),
    head: git(['rev-parse', 'HEAD'], 'unknown'),
    dirty: Boolean(git(['status', '--porcelain'])),
    model: options.model,
    endpoint,
    dimension: indexedChunks[0].embedding.length,
    sourceFingerprint: sha256(indexedChunks.map((chunk) => `${chunk.id}:${chunk.contentHash}`).join('\n')),
    chunks: indexedChunks,
  }
  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(defaultStorePath, `${JSON.stringify(store)}\n`, 'utf8')
  console.log(`Local RAG index: ${relative(defaultStorePath)}`)
  console.log(`${indexedChunks.length} chunks; reused ${indexedChunks.length - missing.length}; model ${options.model}`)
  return store
}

function cosine(left, right) {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0
}

function queryTokens(query) {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9_/-]+/).filter((token) => token.length > 1))]
}

function lexicalBonus(chunk, tokens) {
  if (!tokens.length) return 0
  const haystack = `${chunk.file}\n${chunk.text}`.toLowerCase()
  return tokens.filter((token) => haystack.includes(token)).length / tokens.length * 0.08
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'query'
}

async function runQuery(options) {
  const query = options.query.join(' ').trim()
  if (!query) throw new Error('Provide a search query after `query`.')
  const endpoint = assertLocalEndpoint(options.endpoint)
  const store = await readStore(defaultStorePath)
  if (!store) throw new Error('No local RAG index exists. Run `node scripts/ai-rag.mjs index` first.')
  if (store.model !== options.model) throw new Error(`Index uses model ${store.model}; rerun index with --model ${options.model}.`)
  const [queryEmbedding] = await embeddings(endpoint, options.model, [query])
  if (queryEmbedding.length !== store.dimension) throw new Error('Embedding dimension changed; rebuild the local RAG index.')
  const tokens = queryTokens(query)
  const ranked = store.chunks.map((chunk) => ({
    ...chunk,
    score: cosine(queryEmbedding, chunk.embedding) + lexicalBonus(chunk, tokens),
  })).sort((left, right) => right.score - left.score).slice(0, options.top)

  const sections = [
    '---',
    'schema: exam-web-local-rag-query-v1',
    `generatedAt: ${new Date().toISOString()}`,
    `model: ${store.model}`,
    `query: ${JSON.stringify(query)}`,
    '---',
    '',
    '# Local RAG results',
    '',
    '> Use one selected file as the seed for `node scripts/ai-context.mjs --file <path> --max-bytes 120000`.',
    '',
  ]
  let bytes = Buffer.byteLength(sections.join('\n'))
  let included = 0
  for (const result of ranked) {
    const section = `## ${result.file}:${result.startLine}-${result.endLine} (score ${result.score.toFixed(3)})\n\n\`\`\`text\n${result.text}\n\`\`\`\n\n`
    if (bytes + Buffer.byteLength(section) > options.maxBytes) break
    sections.push(section)
    bytes += Buffer.byteLength(section)
    included += 1
  }
  const outputPath = options.output ? path.resolve(root, options.output) : path.join(cacheDir, `query-${slugify(query)}.md`)
  if (!outputPath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Output path must stay inside this repository.')
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${sections.join('\n')}\n`, 'utf8')
  console.log(`RAG result: ${relative(outputPath)}`)
  console.log(`Included ${included}/${ranked.length} ranked excerpts; ${bytes} bytes`)
}

async function doctor(options) {
  const endpoint = assertLocalEndpoint(options.endpoint)
  const result = await requestJson(endpoint, '/api/tags')
  const installed = new Set((result.models || []).map((item) => item.name))
  const available = installed.has(options.model) || [...installed].some((name) => name.startsWith(`${options.model}:`))
  console.log(`Ollama reachable: ${endpoint}`)
  console.log(`Embedding model ${options.model}: ${available ? 'installed' : 'missing'}`)
  if (!available) {
    console.log(`Run: ollama pull ${options.model}`)
    process.exitCode = 2
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2))
  if (options.help || !command || !['doctor', 'index', 'query'].includes(command)) {
    usage()
    process.exitCode = command ? 1 : 0
    return
  }
  if (!options.model) throw new Error('A model name is required.')
  if (command === 'doctor') await doctor(options)
  else if (command === 'index') await buildIndex(options)
  else await runQuery(options)
}

main().catch((error) => {
  console.error(`ai-rag failed: ${error.message}`)
  process.exitCode = 1
})
