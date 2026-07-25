#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const manifestPath = path.join(root, 'ai', 'project.manifest.json')
const cacheDir = path.join(root, '.ai-cache')
const indexPath = path.join(cacheDir, 'index.json')
const summaryPath = path.join(cacheDir, 'SUMMARY.md')
const sourceExtensions = new Set(['.ts', '.tsx', '.mts'])
const skippedDirectories = new Set([
  '.git',
  '.next',
  '.ai-cache',
  '.understand-anything',
  '.gitnexus',
  '.cocoindex',
  '.cocoindex_code',
  'node_modules',
])
const dataOperations = new Set([
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
])
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

function posix(value) {
  return value.split(path.sep).join('/')
}

function relative(absolutePath) {
  return posix(path.relative(root, absolutePath))
}

function sortStrings(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && (skippedDirectories.has(entry.name) || entry.name.startsWith('.cocoindex'))) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolutePath))
    else if (entry.isFile()) files.push(absolutePath)
  }

  return files
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
}

function collectExportNames(sourceFile) {
  const names = []

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      names.push('default')
      continue
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.push(element.name.text)
      } else {
        names.push('*')
      }
      continue
    }

    if (!hasExportModifier(statement)) continue

    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) {
      names.push(statement.name?.text || 'default')
      continue
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
      }
    }
  }

  return sortStrings(names)
}

function isClientModule(sourceFile) {
  const first = sourceFile.statements[0]
  return Boolean(
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'
  )
}

function collectChainOperations(callExpression) {
  const operations = new Set()
  let current = callExpression.parent

  while (current) {
    if (ts.isPropertyAccessExpression(current)) {
      if (dataOperations.has(current.name.text)) operations.add(current.name.text)
      current = current.parent
      continue
    }
    if (ts.isCallExpression(current)) {
      current = current.parent
      continue
    }
    break
  }

  return [...operations].sort()
}

function resolveImport(specifier, containingFile, compilerOptions) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null

  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName

  if (!resolved) return null
  const absolute = path.resolve(resolved.replace(/\.d\.ts$/, '.ts'))
  const rel = relative(absolute)
  if (rel.startsWith('../') || rel.includes('/node_modules/')) return null
  return rel
}

function moduleKind(file) {
  if (file.startsWith('src/app/')) return 'app'
  if (file.startsWith('src/components/')) return 'component'
  if (file.startsWith('src/lib/')) return 'lib'
  if (file.startsWith('src/hooks/')) return 'hook'
  if (file.startsWith('src/types/')) return 'type'
  if (file.startsWith('src/contexts/')) return 'context'
  if (file === 'src/middleware.ts') return 'middleware'
  return 'source'
}

function parseRoute(file, exports, manifest) {
  const appPrefix = 'src/app/'
  if (!file.startsWith(appPrefix)) return null

  const baseName = path.posix.basename(file)
  let kind = null
  if (baseName === 'page.tsx' || baseName === 'page.ts') kind = 'page'
  if (baseName === 'route.ts' || baseName === 'route.tsx') kind = 'handler'
  if (baseName === 'layout.tsx' || baseName === 'layout.ts') kind = 'layout'
  if (!kind) return null

  const rawSegments = file.slice(appPrefix.length).split('/').slice(0, -1)
  const routeGroups = rawSegments.filter((segment) => /^\(.+\)$/.test(segment))
  const urlSegments = rawSegments.filter((segment) => !/^\(.+\)$/.test(segment))
  const url = urlSegments.length ? `/${urlSegments.join('/')}` : '/'
  const dynamicParams = urlSegments
    .filter((segment) => segment.startsWith('[') && segment.endsWith(']'))
    .map((segment) => segment.replace(/^\[+|\]+$/g, ''))

  const rule = manifest.routeAccessRules.find(({ pattern }) => {
    if (pattern === '/**') return true
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3)
      return url === prefix || url.startsWith(`${prefix}/`)
    }
    return url === pattern
  })

  return {
    id: `${kind}:${url}:${file}`,
    url,
    kind,
    file,
    methods: kind === 'handler' ? exports.filter((name) => httpMethods.has(name)) : [],
    routeGroups,
    dynamicParams,
    access: rule?.access || 'unknown',
    accessSource: rule?.source || null,
  }
}

function parseSqlDefinitions(file, content) {
  const definitions = []
  const expression = /create\s+(?:or\s+replace\s+)?(materialized\s+view|table|view|function)\s+(?:if\s+not\s+exists\s+)?(?:(?:public\.)|(?:"public"\.))?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi
  let match

  while ((match = expression.exec(content)) !== null) {
    definitions.push({
      name: match[2],
      kind: match[1].toLowerCase().replace(/\s+/g, '-'),
      file,
    })
  }

  return definitions
}

async function main() {
  if (!fsSync.existsSync(manifestPath)) {
    throw new Error('Missing ai/project.manifest.json. Run from the repository root.')
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const configFile = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)

  const moduleRoots = manifest.indexScope?.moduleRoots || [manifest.project.sourceRoot]
  const sourceFiles = (await Promise.all(moduleRoots.map(async (directory) => {
    const absoluteRoot = path.join(root, directory)
    return fsSync.existsSync(absoluteRoot) ? walk(absoluteRoot) : []
  }))).flat()
    .filter((file) => sourceExtensions.has(path.extname(file)))
    .sort((a, b) => relative(a).localeCompare(relative(b)))

  const sqlDefinitionRoots = manifest.indexScope?.sqlDefinitionRoots || ['supabase/migrations']
  const sqlFiles = (await Promise.all(sqlDefinitionRoots.map(async (directory) => {
    const absoluteRoot = path.join(root, directory)
    return fsSync.existsSync(absoluteRoot)
      ? (await walk(absoluteRoot)).filter((file) => path.extname(file) === '.sql')
      : []
  }))).flat()
  for (const file of manifest.indexScope?.referenceSqlFiles || ['database/SUPABASE_SCHEMA.sql']) {
    const absolutePath = path.join(root, file)
    if (fsSync.existsSync(absolutePath)) sqlFiles.push(absolutePath)
  }

  const modules = []
  const fingerprintParts = []
  const sqlDefinitions = []

  for (const absolutePath of sourceFiles) {
    const file = relative(absolutePath)
    const content = await fs.readFile(absolutePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      absolutePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const exports = collectExportNames(sourceFile)
    const imports = []
    const dataRefMap = new Map()
    const rpcRefs = new Set()
    const storageRefs = new Set()

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const specifier = statement.moduleSpecifier.text
      imports.push({
        specifier,
        resolved: resolveImport(specifier, absolutePath, parsedConfig.options),
        typeOnly: Boolean(statement.importClause?.isTypeOnly),
      })
    }

    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text
        const firstArgument = node.arguments[0]
        if (firstArgument && ts.isStringLiteralLike(firstArgument)) {
          if (method === 'from') {
            const receiver = node.expression.expression
            const isStorage = ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'storage'
            if (isStorage) {
              storageRefs.add(firstArgument.text)
            } else {
              const operations = dataRefMap.get(firstArgument.text) || new Set()
              for (const operation of collectChainOperations(node)) operations.add(operation)
              dataRefMap.set(firstArgument.text, operations)
            }
          }
          if (method === 'rpc') rpcRefs.add(firstArgument.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    const dataRefs = [...dataRefMap.entries()]
      .map(([name, operations]) => ({ name, kind: 'table-or-view', ops: [...operations].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const route = parseRoute(file, exports, manifest)
    modules.push({
      file,
      kind: moduleKind(file),
      client: isClientModule(sourceFile),
      lines: content === '' ? 0 : content.split(/\r?\n/).length,
      exports,
      imports: imports.sort((a, b) => a.specifier.localeCompare(b.specifier)),
      importedBy: [],
      dataRefs,
      rpcRefs: [...rpcRefs].sort(),
      storageRefs: [...storageRefs].sort(),
      route,
    })

    const contentHash = crypto.createHash('sha256').update(content).digest('hex')
    fingerprintParts.push(`${file}\0${contentHash}`)
  }

  for (const absolutePath of [...new Set(sqlFiles)].sort((a, b) => relative(a).localeCompare(relative(b)))) {
    const file = relative(absolutePath)
    const content = await fs.readFile(absolutePath, 'utf8')
    sqlDefinitions.push(...parseSqlDefinitions(file, content))
    const contentHash = crypto.createHash('sha256').update(content).digest('hex')
    fingerprintParts.push(`${file}\0${contentHash}`)
  }

  const manifestContent = await fs.readFile(manifestPath, 'utf8')
  fingerprintParts.push(`ai/project.manifest.json\0${crypto.createHash('sha256').update(manifestContent).digest('hex')}`)

  const contextFingerprintFiles = []
  for (const entry of manifest.indexScope?.contextFingerprintFiles || []) {
    if (entry.endsWith('/**/*.md')) {
      const directory = path.join(root, entry.slice(0, -'/**/*.md'.length))
      if (fsSync.existsSync(directory)) {
        contextFingerprintFiles.push(...(await walk(directory)).filter((file) => path.extname(file) === '.md'))
      }
      continue
    }
    const absolutePath = path.join(root, entry)
    if (fsSync.existsSync(absolutePath)) contextFingerprintFiles.push(absolutePath)
  }
  for (const absolutePath of [...new Set(contextFingerprintFiles)].sort((a, b) => relative(a).localeCompare(relative(b)))) {
    const file = relative(absolutePath)
    const content = await fs.readFile(absolutePath, 'utf8')
    fingerprintParts.push(`${file}\0${crypto.createHash('sha256').update(content).digest('hex')}`)
  }

  const moduleMap = new Map(modules.map((sourceModule) => [sourceModule.file, sourceModule]))
  for (const sourceModule of modules) {
    for (const dependency of sourceModule.imports) {
      const imported = dependency.resolved ? moduleMap.get(dependency.resolved) : null
      if (imported) imported.importedBy.push(sourceModule.file)
    }
  }
  for (const sourceModule of modules) sourceModule.importedBy = sortStrings(sourceModule.importedBy)

  const definitionMap = new Map()
  for (const definition of sqlDefinitions) {
    const current = definitionMap.get(definition.name) || { kinds: new Set(), files: new Set() }
    current.kinds.add(definition.kind)
    current.files.add(definition.file)
    definitionMap.set(definition.name, current)
  }

  const usageMap = new Map()
  for (const sourceModule of modules) {
    for (const reference of sourceModule.dataRefs) {
      const users = usageMap.get(reference.name) || new Set()
      users.add(sourceModule.file)
      usageMap.set(reference.name, users)
    }
  }

  const objectNames = sortStrings([...definitionMap.keys(), ...usageMap.keys()])
  const dataObjects = objectNames.map((name) => {
    const definition = definitionMap.get(name)
    return {
      name,
      kinds: definition ? [...definition.kinds].sort() : ['unknown'],
      definedIn: definition ? [...definition.files].sort() : [],
      usedBy: usageMap.has(name) ? [...usageMap.get(name)].sort() : [],
    }
  })

  const rpcNames = sortStrings(modules.flatMap((sourceModule) => sourceModule.rpcRefs))
  const rpcs = rpcNames.map((name) => ({
    name,
    definedIn: definitionMap.has(name) ? [...definitionMap.get(name).files].sort() : [],
    usedBy: modules.filter((sourceModule) => sourceModule.rpcRefs.includes(name)).map((sourceModule) => sourceModule.file).sort(),
  }))
  const storageBuckets = sortStrings(modules.flatMap((sourceModule) => sourceModule.storageRefs)).map((name) => ({
    name,
    usedBy: modules.filter((sourceModule) => sourceModule.storageRefs.includes(name)).map((sourceModule) => sourceModule.file).sort(),
  }))

  const routes = modules
    .filter((sourceModule) => sourceModule.route)
    .map((sourceModule) => ({
      ...sourceModule.route,
      client: sourceModule.client,
      imports: sourceModule.imports.filter((item) => item.resolved).map((item) => item.resolved),
      dataRefs: sourceModule.dataRefs.map((item) => item.name),
      rpcRefs: sourceModule.rpcRefs,
      storageRefs: sourceModule.storageRefs,
    }))
    .sort((a, b) => `${a.url}:${a.kind}:${a.file}`.localeCompare(`${b.url}:${b.kind}:${b.file}`))

  const hotspots = modules
    .map((sourceModule) => ({
      file: sourceModule.file,
      lines: sourceModule.lines,
      fanIn: sourceModule.importedBy.length,
      fanOut: sourceModule.imports.filter((item) => item.resolved).length,
      dataFanOut: sourceModule.dataRefs.length + sourceModule.rpcRefs.length + sourceModule.storageRefs.length,
    }))
    .sort((a, b) =>
      (b.fanIn * 5 + b.dataFanOut * 3 + b.fanOut + b.lines / 200) -
      (a.fanIn * 5 + a.dataFanOut * 3 + a.fanOut + a.lines / 200) ||
      a.file.localeCompare(b.file)
    )
    .slice(0, 30)

  const index = {
    schemaVersion: 1,
    generated: {
      at: new Date().toISOString(),
      head: git(['rev-parse', 'HEAD'], 'unknown'),
      dirty: Boolean(git(['status', '--porcelain', '--untracked-files=no', '--ignore-submodules=all'])),
      sourceFingerprint: crypto.createHash('sha256').update(fingerprintParts.sort().join('\n')).digest('hex'),
    },
    project: {
      name: packageJson.name,
      framework: manifest.project.framework,
      packageManager: manifest.project.packageManager,
      tsconfig: manifest.project.tsconfig,
      aliases: configFile.config.compilerOptions?.paths || {},
      commands: packageJson.scripts || {},
    },
    stats: {
      sourceFiles: modules.length,
      sourceLines: modules.reduce((sum, sourceModule) => sum + sourceModule.lines, 0),
      clientModules: modules.filter((sourceModule) => sourceModule.client).length,
      pages: routes.filter((route) => route.kind === 'page').length,
      routeHandlers: routes.filter((route) => route.kind === 'handler').length,
      layouts: routes.filter((route) => route.kind === 'layout').length,
      dataObjects: dataObjects.length,
      rpcs: rpcs.length,
    },
    routes,
    modules,
    data: {
      objects: dataObjects,
      rpcs,
      storageBuckets,
    },
    hotspots,
    diagnostics: [],
  }

  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  const summary = [
    '# AI index summary',
    '',
    `- Generated: ${index.generated.at}`,
    `- HEAD: ${index.generated.head}`,
    `- Dirty: ${index.generated.dirty}`,
    `- Fingerprint: ${index.generated.sourceFingerprint}`,
    `- Source: ${index.stats.sourceFiles} files / ${index.stats.sourceLines} lines`,
    `- Routes: ${index.stats.pages} pages / ${index.stats.routeHandlers} handlers / ${index.stats.layouts} layouts`,
    `- Data: ${index.stats.dataObjects} objects / ${index.stats.rpcs} RPCs`,
    '',
    '## Hotspots',
    '',
    '| File | Lines | Imported by | Imports | Data refs |',
    '|---|---:|---:|---:|---:|',
    ...hotspots.slice(0, 20).map((item) =>
      `| \`${item.file}\` | ${item.lines} | ${item.fanIn} | ${item.fanOut} | ${item.dataFanOut} |`
    ),
    '',
    'Use `node scripts/ai-context.mjs --route <path>` or `--table <name>` to build a bounded context pack.',
    '',
  ].join('\n')
  await fs.writeFile(summaryPath, summary, 'utf8')

  console.log(`AI index: ${relative(indexPath)}`)
  console.log(`Summary:  ${relative(summaryPath)}`)
  console.log(`${index.stats.sourceFiles} source files, ${index.stats.pages} pages, ${index.stats.dataObjects} data objects`)
}

main().catch((error) => {
  console.error(`ai-index failed: ${error.message}`)
  process.exitCode = 1
})
