#!/usr/bin/env node
/**
 * Benchmark chất lượng chấm tự luận bằng AI.
 *
 * MỤC ĐÍCH: `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 8 đặt việc chạy benchmark
 * trên fixture thật làm điều kiện BẮT BUỘC trước khi được phép bật
 * `ESSAY_AI_AUTO_FINALIZE`. Script này tạo ra con số cho điều kiện đó.
 *
 * Nó gọi ĐÚNG `src/lib/essay-ai/grading-provider.ts` mà worker dùng, không
 * viết lại prompt hay parser riêng — một benchmark chạy trên đường code khác
 * với production thì đo sai thứ.
 *
 * TỐN TIỀN THẬT: mỗi fixture là một lượt gọi provider. Chạy `--dry-run` trước
 * để xem sẽ gọi bao nhiêu lượt.
 *
 * BẢO MẬT (AGENTS.md mục 5)
 * - Fixture phải ẩn danh và có quyền sử dụng. KHÔNG dùng bài học sinh thật.
 *   Script chạy `assertNoIdentifiers` trên từng fixture và DỪNG nếu phát hiện
 *   tên, email, số điện thoại — nó không tự xoá giúp, vì im lặng sửa dữ liệu
 *   là cách để một fixture chứa tên thật lọt qua mà không ai biết.
 * - Không in nội dung bài làm ra stdout hay file báo cáo. Chỉ in số và
 *   `fixture_id`.
 *
 * Cách chạy:
 *   node scripts/essay-ai-benchmark.mjs --dry-run
 *   node scripts/essay-ai-benchmark.mjs
 *   node scripts/essay-ai-benchmark.mjs --dir fixtures/essay-ai --out report.json
 *   node scripts/essay-ai-benchmark.mjs --ocr        # đo riêng độ chính xác OCR
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

/**
 * Hook phân giải import cho Node.
 *
 * Cần vì `grading-provider.ts` dùng alias `@/*` (tsconfig) và import không kèm
 * đuôi `.ts` — Node không hiểu cả hai. Phương án còn lại là dựng bản build
 * riêng cho benchmark, nhưng thế thì benchmark không còn chạy trên đúng code
 * mà production chạy nữa.
 */
const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')

function resolveToFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {
      // Không tồn tại; thử ứng viên tiếp theo.
    }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null
    if (specifier.startsWith('@/')) {
      base = path.join(SRC_DIR, specifier.slice(2))
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    }
    if (base) {
      const hit = resolveToFile(base)
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { createDeepSeekGradingProvider } = await import('../src/lib/essay-ai/grading-provider.ts')
const { createOcrProvider } = await import('../src/lib/essay-ai/ocr-provider.ts')
const { readGradingConfig, readOcrConfig } = await import('../src/lib/essay-ai/model-allowlist.ts')
const { assertNoIdentifiers, redactPii } = await import('../src/lib/essay-ai/redaction.ts')
const { normalizeAnswerText, hashText } = await import('../src/lib/essay-ai/normalize.ts')

const DEFAULT_FIXTURE_DIR = 'fixtures/essay-ai'
/** Lệch quá 20% thang điểm = sai nghiêm trọng (kế hoạch mục 7). */
const SERIOUS_ERROR_RATIO = 0.2
/** Nghỉ giữa các lượt gọi để không đụng rate limit. */
const DELAY_BETWEEN_CALLS_MS = 1200

function usage() {
  console.log(`Benchmark chấm tự luận AI

  node scripts/essay-ai-benchmark.mjs [tuỳ chọn]

Tuỳ chọn:
  --dir <path>     Thư mục fixture. Mặc định: ${DEFAULT_FIXTURE_DIR}
  --out <path>     Ghi báo cáo JSON. Mặc định: chỉ in ra màn hình.
  --dry-run        Chỉ kiểm tra fixture, KHÔNG gọi provider, không tốn tiền.
  --ocr            Đo thêm độ chính xác OCR trên các fixture có ảnh.
  --limit <n>      Chỉ chạy n fixture đầu tiên.
  --help

Biến môi trường bắt buộc (khi không dùng --dry-run):
  DEEPSEEK_API_KEY, DEEPSEEK_MODEL
Thêm khi dùng --ocr:
  OCR_PROVIDER, OCR_API_KEY (hoặc GEMINI_API_KEY), OCR_MODEL — xem .env.example.
`)
}

function parseArgs(argv) {
  const options = {
    dir: DEFAULT_FIXTURE_DIR,
    out: null,
    dryRun: false,
    ocr: false,
    limit: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--ocr') options.ocr = true
    else if (arg === '--dir') options.dir = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg === '--limit') options.limit = Number(argv[++index])
    else {
      console.error(`Tham số không hiểu: ${arg}`)
      return { help: true, invalid: true }
    }
  }
  if (!options.dir) {
    console.error('--dir cần một đường dẫn.')
    return { help: true, invalid: true }
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    console.error('--limit phải là số nguyên >= 1.')
    return { help: true, invalid: true }
  }
  return options
}

/**
 * Đọc và kiểm tra một fixture.
 *
 * Trả `{ fixture }` hoặc `{ error }`. Fixture sai cấu trúc là LỖI DỪNG chứ
 * không phải cảnh báo: một fixture bị bỏ qua âm thầm làm mẫu benchmark nhỏ đi
 * mà báo cáo vẫn trông đầy đủ, và đó chính là cách một chỉ số "đạt" ra đời từ
 * ba bài dễ.
 */
function readFixture(fileName, raw) {
  const id = path.basename(fileName, '.json')
  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return { error: `${id}: không phải JSON hợp lệ (${error.message}).` }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: `${id}: phải là một JSON object.` }
  }

  const required = ['question', 'reference_answer', 'student_answer', 'rubric', 'max_score']
  for (const key of required) {
    if (!(key in value)) return { error: `${id}: thiếu trường "${key}".` }
  }
  for (const key of ['question', 'reference_answer', 'student_answer']) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
      return { error: `${id}: "${key}" phải là chuỗi không rỗng.` }
    }
  }
  if (typeof value.max_score !== 'number' || !(value.max_score > 0)) {
    return { error: `${id}: "max_score" phải là số dương.` }
  }
  if (!Array.isArray(value.rubric) || value.rubric.length === 0) {
    return { error: `${id}: "rubric" phải là mảng không rỗng.` }
  }

  const seen = new Set()
  let rubricTotal = 0
  for (const criterion of value.rubric) {
    if (!criterion || typeof criterion !== 'object') {
      return { error: `${id}: rubric có phần tử không phải object.` }
    }
    for (const key of ['criterion_id', 'title', 'description']) {
      if (typeof criterion[key] !== 'string' || criterion[key].length === 0) {
        return { error: `${id}: tiêu chí thiếu "${key}".` }
      }
    }
    if (typeof criterion.max_score !== 'number' || !(criterion.max_score > 0)) {
      return { error: `${id}: tiêu chí "${criterion.criterion_id}" có max_score không hợp lệ.` }
    }
    if (seen.has(criterion.criterion_id)) {
      return { error: `${id}: criterion_id "${criterion.criterion_id}" bị trùng.` }
    }
    seen.add(criterion.criterion_id)
    rubricTotal += criterion.max_score
  }
  // Cùng ràng buộc mà `parseEssayGradingSuggestion` và RPC áp: tổng rubric phải
  // khớp max_score. Fixture lệch sẽ làm validator từ chối MỌI kết quả và
  // benchmark báo 100% validator_rejected — nhìn như AI tệ, thật ra fixture sai.
  if (Math.abs(rubricTotal - value.max_score) > 0.0001) {
    return {
      error: `${id}: tổng max_score của rubric (${rubricTotal}) phải bằng max_score (${value.max_score}).`,
    }
  }

  if ('expected_score' in value && value.expected_score !== null) {
    if (
      typeof value.expected_score !== 'number' ||
      value.expected_score < 0 ||
      value.expected_score > value.max_score
    ) {
      return { error: `${id}: "expected_score" phải nằm trong 0..${value.max_score}.` }
    }
  }
  if ('human_scores' in value && value.human_scores !== null) {
    if (
      !Array.isArray(value.human_scores) ||
      value.human_scores.some(
        (score) => typeof score !== 'number' || score < 0 || score > value.max_score
      )
    ) {
      return { error: `${id}: "human_scores" phải là mảng số trong 0..${value.max_score}.` }
    }
  }

  // Chặn dữ liệu định danh, hai tầng vì hai hàm bắt hai thứ khác nhau:
  //
  // - `assertNoIdentifiers` chỉ soi TÊN TRƯỜNG (student_id, email, profile…).
  //   Nó không đọc nội dung chuỗi, nên một cái tên nằm trong `student_answer`
  //   đi qua nó mà không hề gì.
  // - `redactPii` là hàm bắt nội dung: tên có nhãn, email, số điện thoại, mã
  //   lớp, mã học sinh. Ở đây dùng nó làm máy phát hiện chứ không phải máy sửa
  //   — `redacted === true` là lỗi dừng. Tự thay bằng placeholder rồi chạy tiếp
  //   sẽ khiến một fixture chứa tên thật lọt qua mà không ai biết, và bản gốc
  //   vẫn nằm trong repo.
  try {
    assertNoIdentifiers({
      question: value.question,
      reference_answer: value.reference_answer,
      student_answer: value.student_answer,
      rubric: value.rubric,
    })
  } catch (error) {
    return { error: `${id}: ${error.message}` }
  }

  for (const field of ['question', 'reference_answer', 'student_answer']) {
    const detection = redactPii(value[field])
    if (detection.redacted) {
      const kinds = Object.entries(detection.counts)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${kind} x${count}`)
        .join(', ')
      return {
        error:
          `${id}: "${field}" chứa dữ liệu có thể định danh học sinh (${kinds}). ` +
          'Ẩn danh lại fixture rồi chạy lại — script không tự xoá giúp, vì bản ' +
          'gốc vẫn sẽ nằm trong repo.',
      }
    }
  }

  return {
    fixture: {
      id,
      question: value.question,
      referenceAnswer: value.reference_answer,
      studentAnswer: value.student_answer,
      rubric: value.rubric,
      maxScore: value.max_score,
      expectedScore: typeof value.expected_score === 'number' ? value.expected_score : null,
      humanScores: Array.isArray(value.human_scores) ? value.human_scores : [],
      /** Đường dẫn ảnh (tương đối so với thư mục fixture) để đo OCR. */
      imagePath: typeof value.image === 'string' ? value.image : null,
      /** Text kỳ vọng OCR đọc ra, nếu fixture có ảnh. */
      expectedOcrText: typeof value.expected_ocr_text === 'string' ? value.expected_ocr_text : null,
      note: typeof value.note === 'string' ? value.note : null,
    },
  }
}

async function loadFixtures(dir) {
  const absolute = path.resolve(ROOT, dir)
  let entries
  try {
    entries = await fsp.readdir(absolute)
  } catch {
    throw new Error(
      `Không đọc được thư mục fixture "${dir}". Tạo thư mục và thêm fixture trước ` +
        'khi chạy benchmark — xem fixtures/essay-ai/README.md.'
    )
  }

  const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort()
  if (jsonFiles.length === 0) {
    // Từ chối chạy thay vì báo 0/0 đạt: "0/0" đọc như "không có lỗi nào".
    throw new Error(
      `Thư mục "${dir}" không có fixture nào. Benchmark từ chối chạy: một báo cáo ` +
        'trên 0 fixture sẽ trông như đã đạt. Xem fixtures/essay-ai/README.md để tạo fixture.'
    )
  }

  const fixtures = []
  const errors = []
  for (const name of jsonFiles) {
    const raw = await fsp.readFile(path.join(absolute, name), 'utf8')
    const result = readFixture(name, raw)
    if (result.error) errors.push(result.error)
    else fixtures.push(result.fixture)
  }
  return { fixtures, errors, absolute }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Trung bình, hoặc null nếu mảng rỗng. */
function mean(values) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Điểm tham chiếu của một fixture: ưu tiên trung bình điểm người chấm (nhiều
 * người thì đáng tin hơn), lùi về `expected_score` nếu không có.
 */
function referenceScore(fixture) {
  if (fixture.humanScores.length > 0) return mean(fixture.humanScores)
  return fixture.expectedScore
}

async function gradeOne(provider, fixture) {
  const normalized = normalizeAnswerText(fixture.studentAnswer)
  const answerHash = hashText(normalized.text)
  const startedAt = Date.now()
  try {
    const result = await provider.grade({
      // `grading_ref` thật là answer_hash; ở benchmark không có student_answer_id
      // nên dùng hash của bài — cùng tính chất: không định danh được ai.
      gradingRef: answerHash,
      rubricVersion: 1,
      questionId: `bench:${fixture.id}`,
      question: fixture.question,
      referenceAnswer: fixture.referenceAnswer,
      studentAnswer: normalized.text,
      answerHash,
      rubric: fixture.rubric,
      maxScore: fixture.maxScore,
    })
    return { ok: true, result, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      ok: false,
      // Chỉ giữ `kind` và message của ProviderError — cả hai đã được adapter
      // làm sạch, không chứa nội dung bài.
      kind: error?.kind || 'unknown',
      message: error instanceof Error ? error.message : 'lỗi không xác định',
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * Độ khớp text OCR, tính bằng Levenshtein chuẩn hoá trên chuỗi đã bỏ khoảng
 * trắng. Đây là chỉ số thô: nó không biết `-x` và `x` khác nhau ở chỗ nào quan
 * trọng, nên phải đọc kèm `mathCharAccuracy` bên dưới.
 */
function textSimilarity(expected, actual) {
  const a = expected.replace(/\s+/g, '')
  const b = actual.replace(/\s+/g, '')
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

/**
 * Độ khớp riêng của các ký tự có ý nghĩa toán học.
 *
 * Tách riêng vì `textSimilarity` coi mọi ký tự như nhau, trong khi với môn Toán
 * đọc nhầm một dấu trừ thành dấu cộng làm sai cả bài mà độ khớp tổng thể vẫn
 * ~99%. Chỉ số này đếm tần suất từng ký hiệu và so hai phân bố.
 */
function mathCharAccuracy(expected, actual) {
  const MATH_CHARS = /[-+=<>≤≥±^_/\\{}()[\]|√∫∑πθ]/g
  const count = (text) => {
    const map = new Map()
    for (const char of text.match(MATH_CHARS) || []) {
      map.set(char, (map.get(char) ?? 0) + 1)
    }
    return map
  }
  const expectedCounts = count(expected)
  const actualCounts = count(actual)
  const keys = new Set([...expectedCounts.keys(), ...actualCounts.keys()])
  if (keys.size === 0) return null

  let total = 0
  let matched = 0
  for (const key of keys) {
    const e = expectedCounts.get(key) ?? 0
    const a = actualCounts.get(key) ?? 0
    total += Math.max(e, a)
    matched += Math.min(e, a)
  }
  return total === 0 ? null : matched / total
}

async function runOcr(fixtures, fixtureDir) {
  const withImages = fixtures.filter((fixture) => fixture.imagePath)
  if (withImages.length === 0) {
    return { skipped: true, reason: 'Không có fixture nào kèm ảnh.' }
  }

  const config = readOcrConfig()
  const provider = createOcrProvider(config)
  const rows = []

  for (const fixture of withImages) {
    const imageAbsolute = path.resolve(fixtureDir, fixture.imagePath)
    let buffer
    try {
      buffer = await fsp.readFile(imageAbsolute)
    } catch {
      rows.push({ id: fixture.id, ok: false, reason: 'không đọc được file ảnh' })
      continue
    }
    const extension = path.extname(imageAbsolute).toLowerCase()
    const mimeType =
      extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'

    try {
      const result = await provider.recognize({
        imageBase64: buffer.toString('base64'),
        mimeType,
      })
      rows.push({
        id: fixture.id,
        ok: true,
        selfConfidence: result.confidence,
        warnings: result.warnings.map((warning) => warning.kind),
        // Không có text kỳ vọng thì không đo được độ chính xác — báo null thay
        // vì báo một con số vô nghĩa.
        similarity: fixture.expectedOcrText
          ? textSimilarity(fixture.expectedOcrText, result.normalizedText)
          : null,
        mathAccuracy: fixture.expectedOcrText
          ? mathCharAccuracy(fixture.expectedOcrText, result.normalizedText)
          : null,
        chars: result.normalizedText.length,
      })
    } catch (error) {
      rows.push({
        id: fixture.id,
        ok: false,
        reason: error?.kind || 'lỗi provider',
      })
    }
    await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  const measured = rows.filter((row) => row.ok && row.similarity !== null)
  return {
    skipped: false,
    provider: config.provider,
    model: config.model,
    total: rows.length,
    failed: rows.filter((row) => !row.ok).length,
    avgSimilarity: mean(measured.map((row) => row.similarity)),
    avgMathAccuracy: mean(
      measured.map((row) => row.mathAccuracy).filter((value) => value !== null)
    ),
    avgSelfConfidence: mean(rows.filter((row) => row.ok).map((row) => row.selfConfidence)),
    rows,
  }
}

function summarize(rows, fixtures) {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]))
  const graded = rows.filter((row) => row.ok)
  const failed = rows.filter((row) => !row.ok)

  const scored = []
  for (const row of graded) {
    const fixture = byId.get(row.id)
    const reference = referenceScore(fixture)
    if (reference === null) continue
    const diff = row.aiScore - reference
    scored.push({
      id: row.id,
      diff,
      absDiff: Math.abs(diff),
      serious: Math.abs(diff) > fixture.maxScore * SERIOUS_ERROR_RATIO,
      confidence: row.confidence,
      maxScore: fixture.maxScore,
    })
  }

  // Calibration: AI nói "chắc chắn" thì có thật sự đúng hơn không? Nếu hai
  // nhóm sai như nhau, `confidence` vô dụng làm cổng chặn — và cổng chặn
  // confidence chính là thứ đang bảo vệ học sinh khi bật auto-chốt.
  const confident = scored.filter((row) => row.confidence >= 0.8)
  const unsure = scored.filter((row) => row.confidence < 0.8)

  const criterionRows = graded.filter((row) => row.criterionAgreement !== null)

  return {
    total: rows.length,
    graded: graded.length,
    failed: failed.length,
    failureKinds: failed.reduce((acc, row) => {
      acc[row.kind] = (acc[row.kind] ?? 0) + 1
      return acc
    }, {}),
    needsHumanReview: graded.filter((row) => row.outcome === 'needs_human_review').length,
    scoreComparable: scored.length,
    avgAbsDiff: mean(scored.map((row) => row.absDiff)),
    /** Lệch có dấu: dương = AI chấm rộng hơn người, âm = AI chấm chặt hơn. */
    avgSignedDiff: mean(scored.map((row) => row.diff)),
    exactMatches: scored.filter((row) => row.absDiff < 0.0001).length,
    seriousErrors: scored.filter((row) => row.serious).length,
    seriousErrorIds: scored.filter((row) => row.serious).map((row) => row.id),
    calibration: {
      confidentCount: confident.length,
      confidentAvgAbsDiff: mean(confident.map((row) => row.absDiff)),
      confidentSerious: confident.filter((row) => row.serious).length,
      unsureCount: unsure.length,
      unsureAvgAbsDiff: mean(unsure.map((row) => row.absDiff)),
    },
    avgConfidence: mean(graded.map((row) => row.confidence)),
    avgCriterionAgreement: mean(criterionRows.map((row) => row.criterionAgreement)),
    avgLatencyMs: mean(rows.map((row) => row.latencyMs)),
    totalCostUsd: graded.reduce((sum, row) => sum + row.costUsd, 0),
    avgCostUsd: mean(graded.map((row) => row.costUsd)),
  }
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined ? '—' : value.toFixed(digits)
}

function printReport(summary, ocr, options) {
  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log('BENCHMARK CHẤM TỰ LUẬN AI')
  console.log(line)
  console.log(`Fixture:              ${summary.total}`)
  console.log(`Chấm được:            ${summary.graded}`)
  console.log(`Provider lỗi:         ${summary.failed}`)
  if (summary.failed > 0) {
    for (const [kind, count] of Object.entries(summary.failureKinds)) {
      console.log(`  · ${kind}: ${count}`)
    }
  }
  console.log(`AI tự xin người xem:  ${summary.needsHumanReview}`)

  console.log(`\n-- Độ chính xác điểm (so ${summary.scoreComparable} fixture có điểm tham chiếu)`)
  if (summary.scoreComparable === 0) {
    console.log('  Không fixture nào có expected_score hoặc human_scores.')
    console.log('  CHƯA ĐO ĐƯỢC độ chính xác — chưa đủ căn cứ bật auto-chốt.')
  } else {
    console.log(`  Khớp tuyệt đối:     ${summary.exactMatches}/${summary.scoreComparable}`)
    console.log(`  Lệch trung bình:    ${formatNumber(summary.avgAbsDiff)} điểm`)
    console.log(
      `  Lệch có dấu:        ${formatNumber(summary.avgSignedDiff)} điểm ` +
        `(${summary.avgSignedDiff > 0 ? 'AI chấm RỘNG hơn người' : 'AI chấm CHẶT hơn người'})`
    )
    console.log(
      `  Sai nghiêm trọng:   ${summary.seriousErrors}/${summary.scoreComparable} ` +
        `(lệch > ${SERIOUS_ERROR_RATIO * 100}% thang điểm)`
    )
    if (summary.seriousErrorIds.length > 0) {
      console.log(`    fixture: ${summary.seriousErrorIds.join(', ')}`)
    }
    console.log(`  Khớp theo tiêu chí: ${formatNumber(summary.avgCriterionAgreement, 3)}`)
  }

  console.log('\n-- Độ tin cậy AI tự báo có đáng tin không')
  console.log(`  Trung bình:         ${formatNumber(summary.avgConfidence, 3)}`)
  console.log(
    `  Nhóm >= 0.8:        ${summary.calibration.confidentCount} bài, ` +
      `lệch ${formatNumber(summary.calibration.confidentAvgAbsDiff)}, ` +
      `${summary.calibration.confidentSerious} sai nghiêm trọng`
  )
  console.log(
    `  Nhóm < 0.8:         ${summary.calibration.unsureCount} bài, ` +
      `lệch ${formatNumber(summary.calibration.unsureAvgAbsDiff)}`
  )
  if (
    summary.calibration.confidentAvgAbsDiff !== null &&
    summary.calibration.unsureAvgAbsDiff !== null &&
    summary.calibration.confidentAvgAbsDiff >= summary.calibration.unsureAvgAbsDiff
  ) {
    console.log(
      '  CẢNH BÁO: nhóm AI tự tin KHÔNG chính xác hơn nhóm không tự tin.\n' +
        '  Nghĩa là cổng chặn theo confidence không lọc được gì. Đừng bật auto-chốt.'
    )
  }

  console.log('\n-- Chi phí và tốc độ')
  console.log(`  Tổng:               $${formatNumber(summary.totalCostUsd, 4)}`)
  console.log(`  Mỗi bài:            $${formatNumber(summary.avgCostUsd, 4)}`)
  console.log(`  Độ trễ trung bình:  ${formatNumber(summary.avgLatencyMs / 1000, 1)}s`)

  if (options.ocr && ocr) {
    console.log('\n-- OCR')
    if (ocr.skipped) {
      console.log(`  Bỏ qua: ${ocr.reason}`)
    } else {
      console.log(`  Provider:           ${ocr.provider}:${ocr.model}`)
      console.log(`  Ảnh xử lý:          ${ocr.total} (lỗi ${ocr.failed})`)
      console.log(`  Độ khớp text:       ${formatNumber(ocr.avgSimilarity, 3)}`)
      console.log(`  Độ khớp ký hiệu:    ${formatNumber(ocr.avgMathAccuracy, 3)}`)
      console.log(`  Tự báo tin cậy:     ${formatNumber(ocr.avgSelfConfidence, 3)}`)
      if (ocr.avgMathAccuracy !== null && ocr.avgMathAccuracy < 0.99) {
        console.log(
          '  CẢNH BÁO: ký hiệu toán chưa đọc đúng gần như tuyệt đối.\n' +
            '  Một dấu âm sai đủ đảo ngược kết luận. Đừng bật auto-chốt.'
        )
      }
    }
  }

  console.log(`\n${line}`)
  console.log('Đây là số liệu tham khảo, không phải giấy phép. Điều kiện bật')
  console.log('ESSAY_AI_AUTO_FINALIZE nằm ở docs/ESSAY_AUTO_GRADING_PLAN.md mục 8.')
  console.log(`${line}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    process.exit(options.invalid ? 2 : 0)
  }

  const { fixtures, errors, absolute } = await loadFixtures(options.dir)

  if (errors.length > 0) {
    console.error('Fixture không hợp lệ — sửa hết rồi chạy lại:\n')
    for (const message of errors) console.error(`  ✗ ${message}`)
    console.error(
      '\nBenchmark dừng ở đây. Bỏ qua fixture lỗi sẽ làm báo cáo trông đầy đủ\n' +
        'trong khi thật ra chỉ chạy trên phần dữ liệu dễ.'
    )
    process.exit(1)
  }

  const selected = options.limit ? fixtures.slice(0, options.limit) : fixtures
  const withReference = selected.filter((fixture) => referenceScore(fixture) !== null)

  console.log(`Fixture hợp lệ: ${selected.length} (${withReference.length} có điểm tham chiếu)`)
  const withoutReference = selected.filter((fixture) => referenceScore(fixture) === null)
  if (withoutReference.length > 0) {
    console.log(
      `Không có điểm tham chiếu (chỉ đo được chi phí/tốc độ): ${withoutReference
        .map((fixture) => fixture.id)
        .join(', ')}`
    )
  }

  if (options.dryRun) {
    console.log(
      `\n--dry-run: mọi fixture đã qua kiểm tra cấu trúc và kiểm tra ẩn danh.\n` +
        `Chạy thật sẽ gọi provider ${selected.length} lượt` +
        (options.ocr
          ? ` + ${selected.filter((fixture) => fixture.imagePath).length} lượt OCR`
          : '') +
        '.\nBỏ --dry-run để chạy.'
    )
    return
  }

  const config = readGradingConfig()
  const provider = createDeepSeekGradingProvider(config)
  console.log(`Provider chấm: ${config.provider}:${config.model}\n`)

  const rows = []
  for (const [index, fixture] of selected.entries()) {
    process.stdout.write(`[${index + 1}/${selected.length}] ${fixture.id} … `)
    const outcome = await gradeOne(provider, fixture)

    if (!outcome.ok) {
      console.log(`lỗi (${outcome.kind})`)
      rows.push({ id: fixture.id, ok: false, kind: outcome.kind, latencyMs: outcome.latencyMs })
    } else {
      const { suggestion } = outcome.result
      // Khớp theo tiêu chí: tỷ lệ điểm từng tiêu chí AI cho so với thang của
      // tiêu chí đó. Không so với người vì fixture không lưu breakdown của người.
      const criterionAgreement =
        suggestion.criteria.length > 0
          ? mean(
              suggestion.criteria.map((criterion) => {
                const rubricCriterion = fixture.rubric.find(
                  (item) => item.criterion_id === criterion.criterion_id
                )
                if (!rubricCriterion) return 0
                return criterion.awarded_points / rubricCriterion.max_score
              })
            )
          : null

      rows.push({
        id: fixture.id,
        ok: true,
        aiScore: suggestion.suggested_score,
        confidence: suggestion.confidence,
        outcome: suggestion.outcome,
        criterionAgreement,
        costUsd: outcome.result.estimatedCostUsd,
        latencyMs: outcome.result.latencyMs,
      })

      const reference = referenceScore(fixture)
      console.log(
        `AI ${suggestion.suggested_score}/${fixture.maxScore}` +
          (reference !== null ? ` · người ${formatNumber(reference)}` : '') +
          ` · tin cậy ${formatNumber(suggestion.confidence, 2)}`
      )
    }

    if (index < selected.length - 1) await sleep(DELAY_BETWEEN_CALLS_MS)
  }

  const summary = summarize(rows, selected)
  let ocr = null
  if (options.ocr) {
    console.log('\nĐang đo OCR…')
    ocr = await runOcr(selected, absolute)
  }

  printReport(summary, ocr, options)

  if (options.out) {
    const report = {
      // Không đóng dấu thời gian ở đây bằng giờ địa phương của máy chạy: ISO
      // UTC để hai lần chạy trên hai máy vẫn so được với nhau.
      generatedAt: new Date().toISOString(),
      provider: `${config.provider}:${config.model}`,
      fixtureDir: options.dir,
      summary,
      ocr,
      // `rows` chỉ chứa id fixture và số — không có nội dung bài làm.
      rows,
    }
    await fsp.writeFile(path.resolve(ROOT, options.out), JSON.stringify(report, null, 2), 'utf8')
    console.log(`Đã ghi báo cáo: ${options.out}`)
  }
}

main().catch((error) => {
  console.error(`\nBenchmark dừng: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
