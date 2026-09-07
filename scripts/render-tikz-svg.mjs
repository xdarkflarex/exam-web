/**
 * Dựng sẵn SVG cho mọi hình TikZ trong kho LaTeX.
 *
 * VÌ SAO CẦN:
 * TikZJax chạy trong trình duyệt không dựng được bộ hình này. Nó không có
 * `tkz-tab` (24 bảng biến thiên) và không biết các màu `Accent`, `Primary`,
 * `TextGray` khai báo trong `preamble.tex` (hơn 380 lần dùng). Còn MathJax thì
 * càng không — gặp `\begin{tikzpicture}` là báo "Unknown environment".
 *
 * Cách làm: biên dịch từng hình bằng chính LaTeX của thầy, với đúng màu và thư
 * viện lấy từ `preamble.tex` + `tri-thuc.sty`, rồi đổi sang SVG. Hình trên web
 * giống hệt hình trong sách in.
 *
 * CÁCH CHẠY:
 *   node --experimental-strip-types scripts/render-tikz-svg.mjs \
 *     --chapters "D:/ToanTHPT/LATEX/HethongtrithucToanTHPT"
 *
 * Chạy lại nhiều lần thoải mái: hình nào đã có SVG thì bỏ qua, chỉ dựng hình
 * mới hoặc hình vừa sửa (khoá đổi theo nội dung). Thêm `--force` để dựng lại
 * tất cả.
 *
 * CẦN CÓ: `pdflatex`, `dvisvgm` và `pdftocairo` trong PATH (MiKTeX hoặc TeX Live
 * đều có sẵn cả ba). `pdftocairo` là đường lui cho hình dùng `opacity=` — xem chú
 * thích trong `renderFigure`.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { tikzFigureKey, normalizeTikzSource } from '../src/lib/theories/tikz-figure-key.ts'

const run = promisify(execFile)
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ==============================================
// THAM SỐ DÒNG LỆNH
// ==============================================

function parseArgs(argv) {
  const args = {
    latexRoot: '',
    out: join(REPO_ROOT, 'public', 'tikz'),
    force: false,
    concurrency: 4,
    only: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--chapters' || flag === '--latex-root') args.latexRoot = argv[++i]
    else if (flag === '--out') args.out = resolve(argv[++i])
    else if (flag === '--force') args.force = true
    else if (flag === '--only') args.only = argv[++i]
    else if (flag === '--concurrency') args.concurrency = Number(argv[++i]) || 4
    else if (flag === '--help' || flag === '-h') args.help = true
  }
  return args
}

const HELP = `
Dựng SVG cho hình TikZ.

  --chapters <thư mục>   Gốc kho LaTeX (chứa preamble.tex và thư mục chapters/)
  --out <thư mục>        Nơi ghi SVG (mặc định public/tikz)
  --only <chuỗi>         Chỉ xử lý file .tex có đường dẫn chứa chuỗi này
  --force                Dựng lại cả những hình đã có SVG
  --concurrency <n>      Số tiến trình pdflatex chạy song song (mặc định 4)
`

// ==============================================
// ĐỌC KHO LATEX
// ==============================================

async function walkTexFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walkTexFiles(path)))
    else if (entry.name.endsWith('.tex')) found.push(path)
  }
  return found
}

/**
 * Lấy phần khai báo cần cho hình từ preamble thật của thầy.
 *
 * Chỉ nhặt màu và thư viện TikZ — không lôi cả `geometry`, `fancyhdr`,
 * `tcolorbox` vào vì `standalone` không hợp với chúng. Nhặt tự động để sau này
 * thầy thêm một màu mới thì hình vẫn dựng được, không phải sửa script.
 */
async function collectPreambleBits(latexRoot) {
  const sources = ['preamble.tex', 'tri-thuc.sty']
  const colors = []
  const libraries = new Set()
  const styles = []

  for (const name of sources) {
    const path = join(latexRoot, name)
    if (!existsSync(path)) continue
    const text = await readFile(path, 'utf8')
    for (const match of text.matchAll(/^\s*\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}/gm)) {
      colors.push(match[0].trim())
    }
    for (const match of text.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) {
      for (const lib of match[1].split(',')) {
        const name = lib.trim()
        if (name) libraries.add(name)
      }
    }
    // Kiểu vẽ dùng chung: `trithuc axis`, `trithuc curve`... Thiếu là hỏng 8 hình.
    for (const block of extractBalancedBlocks(text, '\\tikzset')) styles.push(`\\tikzset{${block}}`)
    for (const block of extractBalancedBlocks(text, '\\pgfplotsset')) styles.push(`\\pgfplotsset{${block}}`)
  }

  // Thư viện hay dùng, thêm sẵn cho chắc — nạp thừa không hại gì
  for (const lib of ['calc', 'arrows.meta', 'positioning', 'patterns', 'angles', 'quotes', 'decorations.pathreplacing', 'intersections', '3d']) {
    libraries.add(lib)
  }

  return { colors, libraries: [...libraries], styles }
}

/** Lấy phần trong `{...}` của mọi `\lệnh{...}`, đếm ngoặc cân bằng. */
function extractBalancedBlocks(text, command) {
  const blocks = []
  let cursor = 0
  while (true) {
    const at = text.indexOf(`${command}{`, cursor)
    if (at === -1) return blocks
    let depth = 0
    let i = at + command.length
    for (; i < text.length; i++) {
      const ch = text[i]
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth !== 0) return blocks
    blocks.push(text.slice(at + command.length + 1, i))
    cursor = i + 1
  }
}

function buildStandaloneDocument(tikzCode, { colors, libraries, styles }) {
  return [
    '\\documentclass[border=3pt,varwidth]{standalone}',
    '\\usepackage[T5]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[vietnamese]{babel}',
    '\\usepackage{newtxtext}',
    '\\usepackage{newtxmath}',
    // Không nạp amssymb: newtxmath đã có sẵn ký hiệu AMS, nạp thêm là đụng
    // `\Bbbk`. Đúng như preamble.tex của bộ bài.
    '\\usepackage{amsmath}',
    '\\usepackage{xcolor}',
    ...colors,
    '\\usepackage{tikz}',
    '\\usepackage{tkz-tab}',
    `\\usetikzlibrary{${libraries.join(',')}}`,
    ...styles,
    '\\begin{document}',
    tikzCode,
    '\\end{document}',
    '',
  ].join('\n')
}

// ==============================================
// DỰNG MỘT HÌNH
// ==============================================

async function renderFigure(figure, preambleBits, outDir) {
  const workDir = await mkdtemp(join(tmpdir(), 'tikzsvg-'))
  const jobName = 'figure'
  const texPath = join(workDir, `${jobName}.tex`)

  try {
    await writeFile(texPath, buildStandaloneDocument(figure.code, preambleBits), 'utf8')

    await run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', `-jobname=${jobName}`, texPath], {
      cwd: workDir,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    })

    await run(
      'dvisvgm',
      ['--pdf', '--no-fonts', '--exact-bbox', `--output=${jobName}.svg`, `${jobName}.pdf`],
      { cwd: workDir, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    )

    let svg = await readFile(join(workDir, `${jobName}.svg`), 'utf8')
    let converter = 'dvisvgm'

    /*
      DVISVGM 3.6 DỊCH `opacity=` CỦA TIKZ THÀNH 0.

      TikZ hiện `opacity=0.7` bằng ExtGState trong PDF. Bản dvisvgm này đọc không
      ra và ghi `opacity='0'` — không phải cho riêng nét mờ, mà cho MỌI nét vẽ sau
      đó. Kết quả là một SVG hợp lệ: đúng kích thước, đủ path, đủ màu, và trắng
      tinh khi mở ra.

      Đó là lớp lỗi tệ nhất vì không khâu nào kêu. pdflatex xong sạch, dvisvgm xong
      sạch, file ghi ra bình thường, phép kiểm "đã có SVG chưa" thấy đủ. Bảy hình
      không gian (hình hộp, hình chóp, hệ trục Oxyz, mặt cầu) nằm im như vậy trên
      bản chạy thật cho tới khi có người nhìn bằng mắt.

      `pdftocairo` (đi kèm MiKTeX, không phải cài thêm) đọc đúng ExtGState: cùng
      file PDF đó cho ra `fill-opacity="0.7"` và `stroke-opacity="1"`, đúng như bản
      in. Cả hai công cụ đều đổi chữ thành hình vector nên SVG vẫn không cần font.

      Vẫn để dvisvgm làm chính: nó dựng đúng 104 hình còn lại và `--exact-bbox` cắt
      sát hơn. Chỉ đổi tay lái khi thấy đúng dấu hiệu hỏng.
    */
    if (svg.includes("opacity='0'")) {
      await run('pdftocairo', ['-svg', `${jobName}.pdf`, `${jobName}-cairo.svg`], {
        cwd: workDir,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      })
      svg = await readFile(join(workDir, `${jobName}-cairo.svg`), 'utf8')
      converter = 'pdftocairo'
    }

    /*
      CHẶN CUỐI: không bao giờ ghi ra một hình vô hình.

      Nếu mọi nét vẽ đều trong suốt thì hình đó chắc chắn trắng tinh trên web. Thà
      dừng và báo, còn hơn ghi đè một SVG tốt bằng một SVG trắng rồi vài tuần sau
      mới có người phát hiện.
    */
    const soPath = (svg.match(/<path/g) || []).length
    const soTrongSuot = (svg.match(/opacity=['"]0['"]/g) || []).length
    if (soPath > 0 && soTrongSuot >= soPath) {
      return { ok: false, detail: `hình trong suốt hoàn toàn (${soTrongSuot}/${soPath} nét opacity 0) — không ghi` }
    }

    await writeFile(join(outDir, `${figure.key}.svg`), svg, 'utf8')
    return { ok: true, bytes: Buffer.byteLength(svg), converter }
  } catch (error) {
    // Log của pdflatex nói rõ lỗi hơn stderr rất nhiều
    let detail = error?.message || String(error)
    try {
      const log = await readFile(join(workDir, `${jobName}.log`), 'utf8')
      const firstError = log.split('\n').find(line => line.startsWith('! '))
      if (firstError) detail = firstError.trim()
    } catch {
      // không có log thì thôi
    }
    return { ok: false, detail }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

// ==============================================
// MAIN
// ==============================================

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.latexRoot) {
    console.log(HELP)
    process.exit(args.help ? 0 : 1)
  }

  const latexRoot = resolve(args.latexRoot)
  const chaptersDir = existsSync(join(latexRoot, 'chapters')) ? join(latexRoot, 'chapters') : latexRoot
  if (!existsSync(chaptersDir)) {
    console.error(`Không thấy thư mục: ${chaptersDir}`)
    process.exit(1)
  }

  await mkdir(args.out, { recursive: true })
  const preambleBits = await collectPreambleBits(latexRoot)
  console.log(
    `Màu lấy được: ${preambleBits.colors.length}; thư viện TikZ: ${preambleBits.libraries.length}; khối kiểu vẽ: ${preambleBits.styles.length}`,
  )

  // Gom hình, khử trùng lặp theo khoá
  const texFiles = (await walkTexFiles(chaptersDir))
    .filter(path => !args.only || path.includes(args.only))
    .sort()
  const byKey = new Map()

  for (const path of texFiles) {
    const text = await readFile(path, 'utf8')
    for (const match of text.matchAll(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g)) {
      const code = normalizeTikzSource(match[0])
      const key = tikzFigureKey(code)
      if (!byKey.has(key)) {
        byKey.set(key, { key, code, source: relative(chaptersDir, path).replace(/\\/g, '/') })
      }
    }
  }

  const figures = [...byKey.values()]
  const todo = args.force
    ? figures
    : figures.filter(figure => !existsSync(join(args.out, `${figure.key}.svg`)))

  console.log(`${texFiles.length} file .tex → ${figures.length} hình khác nhau, cần dựng ${todo.length}.`)
  if (!todo.length) {
    await writeManifest(figures, args.out, chaptersDir)
    return
  }

  let done = 0
  const failures = []
  const results = await mapWithLimit(todo, args.concurrency, async figure => {
    const result = await renderFigure(figure, preambleBits, args.out)
    done++
    const label = `${String(done).padStart(3)}/${todo.length}`
    if (result.ok) {
      console.log(`  ${label} ✓ ${figure.key}  ${basename(figure.source)}  (${(result.bytes / 1024).toFixed(0)} KB)`)
    } else {
      console.log(`  ${label} ✗ ${figure.key}  ${figure.source}\n        ${result.detail}`)
      failures.push({ ...figure, detail: result.detail })
    }
    return result
  })

  await writeManifest(figures, args.out, chaptersDir)

  const okCount = results.filter(r => r.ok).length
  console.log(`\nDựng được ${okCount}/${todo.length} hình. SVG nằm ở ${args.out}`)
  if (failures.length) {
    console.log('\nHình chưa dựng được:')
    for (const failure of failures) console.log(`  - ${failure.source}: ${failure.detail}`)
    process.exitCode = 1
  }
}

/** Danh mục để tra ngược khoá → file nguồn khi cần soi lỗi. */
async function writeManifest(figures, outDir, chaptersDir) {
  const entries = []
  for (const figure of figures) {
    const svgPath = join(outDir, `${figure.key}.svg`)
    if (!existsSync(svgPath)) continue
    const info = await stat(svgPath)
    entries.push({ key: figure.key, source: figure.source, bytes: info.size })
  }
  entries.sort((a, b) => a.source.localeCompare(b.source) || a.key.localeCompare(b.key))
  await writeFile(
    join(outDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), chaptersDir, figures: entries }, null, 2) + '\n',
    'utf8',
  )
}

await main()
