/**
 * Bảng đối chiếu hình TikZ với trang PDF gốc.
 *
 * VẤN ĐỀ. Hình trong `_OCR/**\/*_tikz_codes.md` do model vision VẼ LẠI từ ảnh
 * trang PDF, không phải trích ra từ file gốc. Nên nó có thể sai: thiếu một
 * đường, đảo dấu một trục, tô nhầm nửa mặt phẳng. Sai kiểu đó không lộ ra khi
 * đọc mã, và cũng không lộ khi nhìn riêng hình đã dựng — chỉ lộ khi đặt cạnh
 * bản gốc.
 *
 * CÁCH LÀM. Với mỗi hình: dựng SVG từ mã TikZ, rende trang PDF mà mã đó được
 * vẽ lại từ đó, rồi xếp hai thứ cạnh nhau trong một trang HTML kèm nội dung câu
 * hỏi. Người soát cuộn một lượt là xong.
 *
 * Số trang lấy từ chính dòng đầu file tikz ("Vẽ lại từ ảnh PDF gốc (tr 11, 13)")
 * — đó là TRANG TUYỆT ĐỐI của PDF, đã đối chiếu với bảng trang trong
 * `_OCR/00-INDEX.md`.
 *
 * CÁCH CHẠY:
 *   node scripts/tikz-review-sheet.mjs \
 *     --ocr "D:/ToanTHPT/De thi thu thpt + toan 10 + toan 11/2026/ToanMath/_OCR/GK1" \
 *     --pdf "D:/ToanTHPT/De thi thu thpt + toan 10 + toan 11/2026/ToanMath/GK1"
 *
 * CẦN CÓ: `pdftoppm` (poppler), `pdflatex` và `dvisvgm` trong PATH.
 *
 * Hình nào dựng lỗi vẫn hiện trong bảng, kèm dòng lỗi của pdflatex — hình không
 * dựng được cũng là một phát hiện, và giấu nó đi thì người soát tưởng đã xem hết.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

// ==============================================
// THAM SỐ
// ==============================================

function parseArgs(argv) {
  const args = { out: '.ocr-review', dpi: '130' }
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (key && argv[i + 1]) args[key] = argv[i + 1]
  }
  if (!args.ocr || !args.pdf) {
    console.error('Thiếu --ocr hoặc --pdf. Xem phần đầu file để biết cách chạy.')
    process.exit(1)
  }
  return args
}

// ==============================================
// ĐỌC FILE TIKZ
// ==============================================

/** "tr 11, 13" -> [11, 13];  "tr 44-46" -> [44, 45, 46] */
function parsePages(headerLine) {
  const match = /\(tr\s+([^)]+)\)/i.exec(headerLine ?? '')
  if (!match) return []

  const pages = new Set()
  for (const part of match[1].split(',')) {
    const range = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(part)
    if (range) {
      for (let p = Number(range[1]); p <= Number(range[2]); p++) pages.add(p)
      continue
    }
    const single = /^\s*(\d+)\s*$/.exec(part)
    if (single) pages.add(Number(single[1]))
  }
  return [...pages].sort((a, b) => a - b)
}

/** Khối ```latex ... ``` đầu tiên sau một vị trí. */
function nextLatexFence(text, from) {
  const open = /```(?:latex|tikz)?\s*\n/g
  open.lastIndex = from
  const start = open.exec(text)
  if (!start) return null
  const bodyStart = start.index + start[0].length
  const close = text.indexOf('\n```', bodyStart)
  if (close < 0) return null
  return { code: text.slice(bodyStart, close), end: close + 4 }
}

function parseTikzFile(text) {
  const lines = text.split('\n')
  const headerLine = lines.find((line) => /Vẽ lại từ ảnh PDF gốc/i.test(line)) ?? ''
  const pages = parsePages(headerLine)

  // Preamble: khối fence đầu tiên, TRƯỚC mục `## ` đầu tiên.
  const firstSection = text.indexOf('\n## ')
  const preambleFence = nextLatexFence(text.slice(0, firstSection > 0 ? firstSection : undefined), 0)
  const preamble = preambleFence?.code ?? '\\usepackage{tikz}'

  const figures = []
  const heading = /^## (.+)$/gm
  let match
  while ((match = heading.exec(text)) !== null) {
    const sectionStart = match.index
    heading.lastIndex = match.index + match[0].length
    const nextHeading = text.indexOf('\n## ', heading.lastIndex)
    const section = text.slice(sectionStart, nextHeading < 0 ? undefined : nextHeading)

    const cau = /^-\s*Câu:\s*(\d+)/m.exec(section)
    const hinh = /^-\s*Hình:\s*(\d+)/m.exec(section)
    const fence = nextLatexFence(section, 0)
    if (!fence) continue

    figures.push({
      id: match[1].trim(),
      cau: cau ? Number(cau[1]) : null,
      hinh: hinh ? Number(hinh[1]) : null,
      code: fence.code.trim(),
    })
  }

  return { pages, preamble, figures }
}

/** Nội dung câu N trong file đề, cắt gọn để đọc lướt. */
function findQuestionText(questionMd, cau) {
  if (cau === null) return ''
  const pattern = new RegExp(`^Câu ${cau}:.*$`, 'm')
  const line = pattern.exec(questionMd ?? '')
  return line ? line[0].slice(0, 400) : ''
}

// ==============================================
// DỰNG HÌNH
// ==============================================

async function renderTikz(code, preamble) {
  const workDir = await mkdtemp(join(tmpdir(), 'tikzreview-'))
  const job = 'figure'
  try {
    const doc = [
      '\\documentclass[border=3pt,varwidth]{standalone}',
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage{amsmath}',
      '\\usepackage{xcolor}',
      preamble,
      '\\begin{document}',
      code,
      '\\end{document}',
      '',
    ].join('\n')

    await writeFile(join(workDir, `${job}.tex`), doc, 'utf8')
    await run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', `-jobname=${job}`, `${job}.tex`], {
      cwd: workDir,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    })
    await run('dvisvgm', ['--pdf', '--no-fonts', '--exact-bbox', `--output=${job}.svg`, `${job}.pdf`], {
      cwd: workDir,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    })
    return { ok: true, svg: await readFile(join(workDir, `${job}.svg`), 'utf8') }
  } catch (error) {
    // Log của pdflatex nói rõ lỗi hơn stderr rất nhiều.
    let detail = error?.message || String(error)
    try {
      const log = await readFile(join(workDir, `${job}.log`), 'utf8')
      const first = log.split('\n').find((line) => line.startsWith('! '))
      if (first) detail = first.trim()
    } catch {
      // không có log thì giữ message gốc
    }
    return { ok: false, detail }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Render một trang PDF ra PNG. Trả về đường dẫn tương đối, hoặc null. */
async function renderPdfPage(pdfPath, page, outDir, prefix, dpi) {
  const stem = `${prefix}-tr${page}`
  try {
    await run(
      'pdftoppm',
      ['-f', String(page), '-l', String(page), '-r', dpi, '-png', '-singlefile', pdfPath, join(outDir, stem)],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )
    return `${stem}.png`
  } catch {
    return null
  }
}

// ==============================================
// HTML
// ==============================================

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function buildHtml(title, entries) {
  const blocks = entries
    .map((entry) => {
      const pdfSide = entry.pages.length
        ? entry.pages
            .map((p) =>
              p.file
                ? `<figure><img src="${p.file}" alt="trang ${p.page}"><figcaption>PDF trang ${p.page}</figcaption></figure>`
                : `<p class="loi">Không render được trang ${p.page}</p>`,
            )
            .join('')
        : '<p class="loi">File tikz không ghi số trang PDF — phải mở tay để đối chiếu.</p>'

      const tikzSide = entry.svg
        ? `<div class="svg">${entry.svg}</div>`
        : `<p class="loi">Dựng hình lỗi: ${escapeHtml(entry.error ?? '')}</p>`

      return `<section>
  <h2>${escapeHtml(entry.id)}</h2>
  <p class="cau">${escapeHtml(entry.questionText || `Câu ${entry.cau ?? '?'}`)}</p>
  <div class="doi-chieu">
    <div class="cot"><h3>Bản gốc (PDF)</h3>${pdfSide}</div>
    <div class="cot"><h3>TikZ đã dựng</h3>${tikzSide}</div>
  </div>
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
  h1 { font-size: 20px; }
  section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  h2 { font-size: 14px; font-family: ui-monospace, monospace; color: #0f766e; margin: 0 0 6px; }
  .cau { font-size: 14px; margin: 0 0 12px; color: #334155; }
  .doi-chieu { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .cot h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 0 0 8px; }
  figure { margin: 0 0 12px; }
  img { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }
  figcaption { font-size: 11px; color: #64748b; margin-top: 4px; }
  .svg svg { max-width: 100%; height: auto; }
  .loi { color: #b91c1c; font-size: 13px; background: #fef2f2; padding: 8px; border-radius: 6px; }
  @media (max-width: 900px) { .doi-chieu { grid-template-columns: 1fr; } }
</style></head>
<body><h1>${escapeHtml(title)}</h1>
${blocks}
</body></html>`
}

// ==============================================
// CHÍNH
// ==============================================

async function findPdf(pdfDir, lop, slug) {
  let files
  try {
    files = await readdir(join(pdfDir, lop))
  } catch {
    return null
  }
  // Tên file OCR là tiền tố của tên PDF: OCR bỏ bớt phần đuôi mô tả
  // ("...-co-loi-giai-chi-tiet"). So theo tiền tố dài nhất khớp được.
  const candidates = files
    .filter((name) => name.toLowerCase().endsWith('.pdf') && slug.startsWith(name.slice(0, 40).replace(/\.pdf$/i, '')))
    .sort((a, b) => b.length - a.length)
  return candidates[0] ? join(pdfDir, lop, candidates[0]) : null
}

async function main() {
  const args = parseArgs(process.argv)
  const ocrDir = resolve(args.ocr)
  const pdfDir = resolve(args.pdf)
  const outDir = resolve(args.out)
  await mkdir(outDir, { recursive: true })

  const lops = (await readdir(ocrDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  let totalFigures = 0
  let totalFailed = 0

  for (const lop of lops) {
    const files = (await readdir(join(ocrDir, lop))).filter((name) => name.endsWith('_tikz_codes.md'))

    for (const file of files) {
      const stem = basename(file, '_tikz_codes.md')
      const slug = stem.split('--')[0]
      const raw = await readFile(join(ocrDir, lop, file), 'utf8')
      const { pages, preamble, figures } = parseTikzFile(raw)

      let questionMd = ''
      try {
        questionMd = await readFile(join(ocrDir, lop, `${stem}.md`), 'utf8')
      } catch {
        // Không có file đề thì vẫn đối chiếu được hình, chỉ thiếu phần chữ.
      }

      const pdfPath = await findPdf(pdfDir, lop, slug)
      const pageFiles = []
      for (const page of pages) {
        const file = pdfPath ? await renderPdfPage(pdfPath, page, outDir, stem, args.dpi) : null
        pageFiles.push({ page, file })
      }

      const entries = []
      for (const figure of figures) {
        const rendered = await renderTikz(figure.code, preamble)
        totalFigures++
        if (!rendered.ok) totalFailed++
        entries.push({
          ...figure,
          questionText: findQuestionText(questionMd, figure.cau),
          // Mọi hình của một đề dùng chung danh sách trang: file tikz ghi số
          // trang ở mức CẢ ĐỀ, không theo từng hình.
          pages: pageFiles,
          svg: rendered.ok ? rendered.svg : null,
          error: rendered.ok ? null : rendered.detail,
        })
      }

      const htmlPath = join(outDir, `${stem}.html`)
      await writeFile(htmlPath, buildHtml(`${lop} · ${stem}`, entries), 'utf8')
      console.log(
        `${stem}: ${figures.length} hình, ${pageFiles.filter((p) => p.file).length}/${pages.length} trang PDF` +
          (pdfPath ? '' : '  [KHÔNG TÌM THẤY PDF]'),
      )
    }
  }

  console.log(`\nXong. ${totalFigures} hình, ${totalFailed} hình dựng lỗi.`)
  console.log(`Mở: ${outDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
