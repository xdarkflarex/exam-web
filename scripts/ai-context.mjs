#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const indexPath = path.join(root, '.ai-cache', 'index.json')
const contextDir = path.join(root, '.ai-cache', 'context')

function usage() {
  console.log(`Usage:
  node scripts/ai-context.mjs --file <path> [--depth 1] [--max-bytes 400000] [--no-refresh]
  node scripts/ai-context.mjs --route </path>
  node scripts/ai-context.mjs --table <name>
  node scripts/ai-context.mjs --changed
  node scripts/ai-context.mjs <search words>
`)
}

function parseArguments(argv) {
  const options = {
    files: [],
    routes: [],
    tables: [],
    changed: false,
    depth: 1,
    maxBytes: 400000,
    refresh: true,
    query: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--file') options.files.push(argv[++index] || '')
    else if (argument === '--route') options.routes.push(argv[++index] || '')
    else if (argument === '--table') options.tables.push(argv[++index] || '')
    else if (argument === '--changed') options.changed = true
    else if (argument === '--depth') options.depth = Math.max(0, Number(argv[++index] || 1))
    else if (argument === '--max-bytes') options.maxBytes = Math.max(20000, Number(argv[++index] || 400000))
    else if (argument === '--query') options.query.push(argv[++index] || '')
    else if (argument === '--no-refresh') options.refresh = false
    else if (argument === '--help' || argument === '-h') options.help = true
    else options.query.push(argument)
  }

  options.files = options.files.filter(Boolean)
  options.routes = options.routes.filter(Boolean)
  options.tables = options.tables.filter(Boolean)
  options.query = options.query.filter(Boolean)
  return options
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'context'
}

function languageFor(file) {
  const extension = path.extname(file).slice(1)
  if (extension === 'tsx') return 'tsx'
  if (extension === 'ts' || extension === 'mts') return 'ts'
  if (extension === 'sql') return 'sql'
  if (extension === 'json') return 'json'
  return 'text'
}

async function ensureIndex(forceRefresh) {
  if (!forceRefresh && fsSync.existsSync(indexPath)) return
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'ai-index.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0 || !fsSync.existsSync(indexPath)) {
    throw new Error('Could not create .ai-cache/index.json')
  }
}

function normalizeRoute(value) {
  if (!value || value === '/') return '/'
  return `/${value.split('/').filter(Boolean).join('/')}`
}

function routeMatchesTemplate(template, actual) {
  const templateSegments = normalizeRoute(template).split('/').filter(Boolean)
  const actualSegments = normalizeRoute(actual).split('/').filter(Boolean)
  let actualIndex = 0

  for (let templateIndex = 0; templateIndex < templateSegments.length; templateIndex += 1) {
    const segment = templateSegments[templateIndex]
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true
    if (/^\[\.\.\..+\]$/.test(segment)) return actualIndex < actualSegments.length
    if (actualIndex >= actualSegments.length) return false
    if (!/^\[[^/]+\]$/.test(segment) && segment !== actualSegments[actualIndex]) return false
    actualIndex += 1
  }

  return actualIndex === actualSegments.length
}

function normalizeRepoFile(value) {
  const absolutePath = path.resolve(root, value)
  const rootPrefix = `${path.resolve(root)}${path.sep}`
  if (!absolutePath.startsWith(rootPrefix)) return null
  return path.relative(root, absolutePath).split(path.sep).join('/')
}

function isPackableFile(file) {
  const normalized = normalizeRepoFile(file)
  if (!normalized) return false
  const segments = normalized.split('/')
  if (segments.some((segment) => ['.git', '.next', '.ai-cache', '.understand-anything', '.gitnexus', 'node_modules'].includes(segment) || segment.startsWith('.cocoindex'))) return false
  if (path.posix.basename(normalized).startsWith('.env') && normalized !== '.env.example') return false
  const extension = path.posix.extname(normalized).toLowerCase()
  const allowedExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.css', '.toml', '.yml', '.yaml', '.example'])
  if (!allowedExtensions.has(extension)) return false
  const absolutePath = path.join(root, ...normalized.split('/'))
  try {
    return fsSync.statSync(absolutePath).isFile()
  } catch {
    return false
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }
  if (!options.files.length && !options.routes.length && !options.tables.length &&
      !options.changed && !options.query.length) {
    usage()
    process.exitCode = 1
    return
  }

  await ensureIndex(options.refresh)
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const moduleMap = new Map(index.modules.map((sourceModule) => [sourceModule.file, sourceModule]))
  const score = new Map()
  const reasons = new Map()

  function add(file, points, reason) {
    const normalized = normalizeRepoFile(file)
    if (!normalized || !isPackableFile(normalized)) return
    score.set(normalized, (score.get(normalized) || 0) + points)
    const current = reasons.get(normalized) || new Set()
    current.add(reason)
    reasons.set(normalized, current)
  }

  for (const wanted of options.files) {
    const exactFile = normalizeRepoFile(wanted)
    if (exactFile && isPackableFile(exactFile)) add(exactFile, 180, `file:${wanted}`)
    const normalized = wanted.replaceAll('\\', '/').toLowerCase()
    for (const sourceModule of index.modules) {
      if (sourceModule.file.toLowerCase() === normalized) add(sourceModule.file, 150, `file:${wanted}`)
      else if (sourceModule.file.toLowerCase().includes(normalized)) add(sourceModule.file, 100, `file-match:${wanted}`)
    }
  }

  for (const wanted of options.routes) {
    const normalized = normalizeRoute(wanted)
    const exact = index.routes.filter((route) => normalizeRoute(route.url) === normalized)
    const templated = exact.length ? [] : index.routes.filter((route) => routeMatchesTemplate(route.url, normalized))
    const matches = exact.length ? exact : templated.length ? templated : index.routes.filter((route) => route.url.includes(normalized))
    for (const route of matches) add(route.file, 150, `route:${route.url}`)
  }

  for (const table of options.tables) {
    const dataObject = index.data.objects.find((item) => item.name === table)
    for (const file of dataObject?.definedIn || []) add(file, 190, `definition:${table}`)
    const rpc = index.data.rpcs.find((item) => item.name === table)
    for (const file of rpc?.definedIn || []) add(file, 190, `rpc-definition:${table}`)
    for (const sourceModule of index.modules) {
      if (sourceModule.dataRefs.some((reference) => reference.name === table)) add(sourceModule.file, 120, `table:${table}`)
      if (sourceModule.rpcRefs.includes(table)) add(sourceModule.file, 120, `rpc:${table}`)
      if (sourceModule.storageRefs.includes(table)) add(sourceModule.file, 120, `storage:${table}`)
    }
  }

  if (options.changed) {
    const changed = new Set([
      ...gitLines(['diff', '--name-only']),
      ...gitLines(['diff', '--cached', '--name-only']),
      ...gitLines(['ls-files', '--others', '--exclude-standard']),
    ].map((file) => file.replaceAll('\\', '/')))
    for (const file of changed) add(file, 140, 'changed')
  }

  const queryTokens = options.query.join(' ').toLowerCase().split(/[^a-z0-9_/-]+/).filter(Boolean)
  if (queryTokens.length) {
    const routeByFile = new Map(index.routes.map((route) => [route.file, route.url]))
    for (const sourceModule of index.modules) {
      const haystack = [
        sourceModule.file,
        ...(sourceModule.exports || []),
        ...(sourceModule.dataRefs || []).map((item) => item.name),
        ...(sourceModule.rpcRefs || []),
        routeByFile.get(sourceModule.file) || '',
      ].join(' ').toLowerCase()
      const matches = queryTokens.filter((token) => haystack.includes(token)).length
      if (matches) add(sourceModule.file, matches * 25, `query:${options.query.join(' ')}`)
    }
  }

  if (!score.size) throw new Error('No indexed source file matched the requested focus')

  let frontier = [...score.keys()]
  for (let depth = 0; depth < options.depth; depth += 1) {
    const next = new Set()
    for (const file of frontier) {
      const sourceModule = moduleMap.get(file)
      if (!sourceModule) continue
      for (const item of sourceModule.imports || []) {
        if (item.resolved && moduleMap.has(item.resolved)) {
          add(item.resolved, Math.max(8, 30 - depth * 8), `dependency-of:${file}`)
          next.add(item.resolved)
        }
      }
      for (const importer of sourceModule.importedBy || []) {
        add(importer, Math.max(6, 22 - depth * 6), `imports:${file}`)
        next.add(importer)
      }
    }
    frontier = [...next]
  }

  const ranked = [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 50)

  const focus = [
    ...options.files.map((item) => `file:${item}`),
    ...options.routes.map((item) => `route:${item}`),
    ...options.tables.map((item) => `table:${item}`),
    ...(options.changed ? ['changed'] : []),
    ...(options.query.length ? [`query:${options.query.join(' ')}`] : []),
  ].join(', ')
  const contextSlug = slugify(focus)
  const outputPath = path.join(contextDir, `${contextSlug}.md`)
  const includedFiles = []
  const omittedFiles = []
  let byteCount = 0
  let truncated = false

  const sections = [
    '---',
    'schema: exam-web-ai-context-v1',
    `generatedAt: ${new Date().toISOString()}`,
    `head: ${index.generated.head}`,
    `dirty: ${index.generated.dirty}`,
    `fingerprint: ${index.generated.sourceFingerprint}`,
    `focus: ${JSON.stringify(focus)}`,
    `depth: ${options.depth}`,
    `maxBytes: ${options.maxBytes}`,
    '---',
    '',
    '# AI context pack',
    '',
    `> Generated local artifact. Index refresh: ${options.refresh ? 'automatic' : 'skipped by --no-refresh'}. AGENTS.md remains authoritative.`,
    '',
    '## Ranked files',
    '',
    '| Score | File | Reason |',
    '|---:|---|---|',
    ...ranked.map(([file, points]) => `| ${points} | \`${file}\` | ${[...reasons.get(file)].join('; ')} |`),
    '',
  ]
  byteCount = Buffer.byteLength(sections.join('\n'))

  const guardrails = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8')
  const guardrailSection = `## Repository guardrails\n\n${guardrails}\n`
  if (byteCount + Buffer.byteLength(guardrailSection) <= options.maxBytes) {
    sections.push(guardrailSection)
    byteCount += Buffer.byteLength(guardrailSection)
  }

  for (const [file] of ranked) {
    const absolutePath = path.resolve(root, file)
    if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`) || !fsSync.existsSync(absolutePath)) {
      omittedFiles.push(file)
      continue
    }
    const content = await fs.readFile(absolutePath, 'utf8')
    const section = `## Source: ${file}\n\n\`\`\`\`${languageFor(file)}\n${content}\n\`\`\`\`\n`
    const sectionBytes = Buffer.byteLength(section)
    if (byteCount + sectionBytes > options.maxBytes) {
      omittedFiles.push(file)
      truncated = true
      continue
    }
    sections.push(section)
    byteCount += sectionBytes
    includedFiles.push(file)
  }

  sections.push(
    '## Pack manifest',
    '',
    `- Included files: ${includedFiles.length}`,
    `- Omitted files: ${omittedFiles.length}`,
    `- Truncated: ${truncated}`,
    `- Bytes: ${byteCount}`,
    '',
    ...(omittedFiles.length ? ['Omitted:', '', ...omittedFiles.map((file) => `- \`${file}\``), ''] : []),
  )

  await fs.mkdir(contextDir, { recursive: true })
  await fs.writeFile(outputPath, `${sections.join('\n')}\n`, 'utf8')
  console.log(`Context pack: ${path.relative(root, outputPath)}`)
  console.log(`Included ${includedFiles.length} files; omitted ${omittedFiles.length}; truncated=${truncated}`)
}

main().catch((error) => {
  console.error(`ai-context failed: ${error.message}`)
  process.exitCode = 1
})
