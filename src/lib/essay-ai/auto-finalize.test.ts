/**
 * Test bảng đầu vào cho `decideFinalization`.
 *
 * Đây là module nhạy cảm nhất của pipeline: kết quả của nó có thể trở thành
 * điểm học sinh nhìn thấy mà không ai kiểm tra trước. Vì thế file này kiểm
 * TỪNG cổng chặn một cách độc lập — mỗi test dưới đây tương ứng với đúng một
 * cách hệ thống có thể chấm sai mà không ai phát hiện.
 *
 * Hai bất biến quan trọng hơn mọi test riêng lẻ, được kiểm ở cuối file:
 * 1. Chỉ có MỘT đường dẫn tới `auto_finalize`, và nó đòi mọi điều kiện đạt.
 * 2. Không đầu vào nào biến sự cố thành điểm 0 hoặc điểm tối đa — "không biết"
 *    luôn dẫn tới `pending_review`.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateOcrEvidence,
  decideFinalization,
  type FinalizeInput,
  type OcrProvenance,
} from './auto-finalize.ts'
import type { GradeSuggestion, OcrEvidence, OcrSnapshotRow } from './contracts.ts'
import type { EssayAiFlags } from './model-allowlist.ts'
import type { OverrideVerdict } from './override-guard.ts'

// ---------------------------------------------------------------------------
// Dựng đầu vào "mọi thứ đều đạt". Từng test làm méo đúng một trường.
// ---------------------------------------------------------------------------

const PASSING_FLAGS: EssayAiFlags = {
  enabled: true,
  autoFinalize: true,
  confidenceMin: 0.8,
  monthlyCostCapUsd: 10,
}

const GUARD_OPEN: OverrideVerdict = { blocked: false }

function grade(overrides: Partial<GradeSuggestion['suggestion']> = {}): GradeSuggestion {
  return {
    suggestion: {
      schema_version: 'essay-grade-result.v1',
      grading_ref: 'a'.repeat(64),
      rubric_version: 3,
      outcome: 'suggested',
      suggested_score: 0.75,
      confidence: 0.9,
      criteria: [],
      overall_feedback_vi: 'Bài làm đủ ý.',
      review_reasons: [],
      ...overrides,
    },
    provider: 'deepseek',
    model: 'deepseek-chat',
    inputHash: 'b'.repeat(64),
    responseHash: 'c'.repeat(64),
    promptTokens: 500,
    completionTokens: 200,
    estimatedCostUsd: 0.0002,
    latencyMs: 2_000,
  }
}

function ocrEvidence(overrides: Partial<OcrEvidence> = {}): OcrEvidence {
  return {
    confidence: 0.97,
    warnings: [],
    captureCount: 1,
    duplicateCaptures: 0,
    textHashes: ['d'.repeat(64)],
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    ...overrides,
  }
}

/** Bài chụp ảnh, có bản ghi chất lượng để đối chiếu. */
function scanned(overrides: Partial<OcrEvidence> = {}): OcrProvenance {
  return { kind: 'scanned', evidence: ocrEvidence(overrides) }
}

/** Một dòng `essay_ocr_snapshots`, mặc định là lần chụp sạch. */
function snapshotRow(overrides: Partial<OcrSnapshotRow> = {}): OcrSnapshotRow {
  return {
    confidence: 0.97,
    warningKinds: [],
    warningDetails: [],
    textHash: 'd'.repeat(64),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    ...overrides,
  }
}

/** Bài gõ bằng bàn phím: không có bước máy đọc nào để nghi ngờ. */
const TYPED: OcrProvenance = { kind: 'typed' }

/** Có chụp ảnh nhưng mất bản ghi chất lượng — phải chặn. */
const SNAPSHOT_MISSING: OcrProvenance = { kind: 'scanned_snapshot_missing' }

/** Đầu vào đạt mọi điều kiện. Không test nào được sửa object này tại chỗ. */
function passingInput(overrides: Partial<FinalizeInput> = {}): FinalizeInput {
  return {
    flags: PASSING_FLAGS,
    ocr: TYPED,
    grade: grade(),
    injectionSignals: [],
    truncatedChars: 0,
    monthToDateCostUsd: 1,
    overrideGuard: GUARD_OPEN,
    ...overrides,
  }
}

/** Rút gọn: chạy và khẳng định bị chặn vì đúng lý do mong đợi. */
function assertBlockedBy(input: FinalizeInput, trigger: string): void {
  const decision = decideFinalization(input)
  assert.equal(decision.action, 'pending_review')
  assert.equal(decision.score, null, 'bị chặn thì không được mang theo điểm')
  assert.ok(
    decision.triggers.includes(trigger as never),
    `mong đợi trigger "${trigger}", nhận được: ${decision.triggers.join(', ')}`
  )
}

// ---------------------------------------------------------------------------
// Nhánh cho phép — phải tồn tại, nếu không mọi test chặn bên dưới đều vô nghĩa
// ---------------------------------------------------------------------------

test('đủ mọi điều kiện thì auto-chốt, và điểm lấy từ gợi ý của AI', () => {
  const decision = decideFinalization(passingInput())
  assert.equal(decision.action, 'auto_finalize')
  assert.equal(decision.score, 0.75)
  assert.deepEqual(decision.triggers, [])
})

test('auto-chốt được khi bài nhập bằng bàn phím', () => {
  // `typed` nghĩa là học sinh gõ tay: không có bước máy đọc nào để nghi ngờ,
  // nên không cổng OCR nào phải chạy. Đây là nhánh DUY NHẤT đi tiếp mà không
  // kiểm chất lượng nhận dạng.
  const decision = decideFinalization(passingInput({ ocr: TYPED }))
  assert.equal(decision.action, 'auto_finalize')
})

test('OCR chất lượng tốt không chặn', () => {
  const decision = decideFinalization(passingInput({ ocr: scanned() }))
  assert.equal(decision.action, 'auto_finalize')
})

test('bài chụp ảnh mất bản ghi chất lượng -> ocr_snapshot_missing', () => {
  // Đây là lỗ hổng fail-open được sửa ngày 2026-08-07. Trước đó cả "gõ tay" và
  // "có ảnh nhưng mất dấu vết" đều là `ocr: null`, và nhánh `if (ocr)` cho qua
  // cả hai — nghĩa là bài chụp ảnh đi thẳng tới auto-chốt mà không cổng OCR nào
  // chạy. Với môn Toán, Gemini đọc nhầm một dấu âm là đủ đảo ngược kết luận, và
  // AI sẽ chấm bài sai đó một cách tự tin vì nó chấm đúng theo cái nó thấy.
  assertBlockedBy(passingInput({ ocr: SNAPSHOT_MISSING }), 'ocr_snapshot_missing')
})

test('mất bản ghi chất lượng chặn kể cả khi mọi điều kiện khác hoàn hảo', () => {
  // Bài kiểm quan trọng: không có đường vòng nào. Điểm cao, confidence tuyệt
  // đối, guard mở, chưa chạm trần chi phí — vẫn phải chặn.
  const decision = decideFinalization(
    passingInput({
      ocr: SNAPSHOT_MISSING,
      grade: grade({ confidence: 1 }),
      monthToDateCostUsd: 0,
    })
  )
  assert.equal(decision.action, 'pending_review')
  assert.equal(decision.score, null)
})

test('giải thích cho ocr_snapshot_missing nói rõ nguyên nhân là thiếu đối chiếu', () => {
  // Người vận hành đọc dòng này để biết nên sửa gì. "Nhận dạng ảnh có cảnh báo"
  // sẽ khiến họ đi tìm cảnh báo không tồn tại; phải nói là THIẾU bản ghi.
  const decision = decideFinalization(passingInput({ ocr: SNAPSHOT_MISSING }))
  assert.match(decision.explanation, /không có bản ghi chất lượng/)
})

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------

test('ESSAY_AI_ENABLED tắt -> ai_disabled', () => {
  assertBlockedBy(
    passingInput({ flags: { ...PASSING_FLAGS, enabled: false } }),
    'ai_disabled'
  )
})

test('ESSAY_AI_AUTO_FINALIZE tắt -> auto_finalize_disabled', () => {
  assertBlockedBy(
    passingInput({ flags: { ...PASSING_FLAGS, autoFinalize: false } }),
    'auto_finalize_disabled'
  )
})

// ---------------------------------------------------------------------------
// Cổng chặn theo mức chấm đè (kill-switch tự động, kế hoạch mục 7)
// ---------------------------------------------------------------------------

test('cổng override chặn -> override_rate_exceeded', () => {
  assertBlockedBy(
    passingInput({
      overrideGuard: {
        blocked: true,
        reason: 'serious_rate_exceeded',
        detail: 'Tỷ lệ sai nghiêm trọng 12,0% vượt ngưỡng 5,0%.',
      },
    }),
    'override_rate_exceeded'
  )
})

test('cổng override chặn: chi tiết lý do phải xuất hiện trong câu giải thích', () => {
  // Người vận hành đọc câu này trong hàng chờ. "Vượt ngưỡng" một mình không cho
  // biết vượt ở đâu, mà đó chính là thông tin cần để quyết định làm gì tiếp.
  const decision = decideFinalization(
    passingInput({
      overrideGuard: {
        blocked: true,
        reason: 'insufficient_evidence',
        detail: 'Mới có 3/20 bài được giáo viên duyệt lại để so.',
      },
    })
  )
  assert.match(decision.explanation, /3\/20/)
})

test('overrideGuard undefined bị coi là chặn, không phải cho qua', () => {
  // Nhánh quan trọng nhất của cổng này. Thêm một call-site mới mà quên truyền
  // trường này KHÔNG được biến thành mất một cổng an toàn.
  assertBlockedBy(passingInput({ overrideGuard: undefined }), 'override_rate_exceeded')
})

test('cổng override không kiểm khi auto-chốt đã tắt', () => {
  // Cờ tắt thì `auto_finalize_disabled` đã là lý do đủ; thêm trigger nữa chỉ
  // làm nhiễu bảng thống kê lý do trên dashboard.
  const decision = decideFinalization(
    passingInput({
      flags: { ...PASSING_FLAGS, autoFinalize: false },
      overrideGuard: undefined,
    })
  )
  assert.equal(decision.action, 'pending_review')
  assert.ok(!decision.triggers.includes('override_rate_exceeded'))
})

// ---------------------------------------------------------------------------
// Trần chi phí
// ---------------------------------------------------------------------------

test('chạm trần chi phí tháng -> cost_cap_reached', () => {
  assertBlockedBy(passingInput({ monthToDateCostUsd: 10 }), 'cost_cap_reached')
})

test('vượt trần chi phí -> cost_cap_reached', () => {
  assertBlockedBy(passingInput({ monthToDateCostUsd: 25 }), 'cost_cap_reached')
})

test('chưa đặt trần (0) thì chi phí không chặn', () => {
  // monthlyCostCapUsd = 0 nghĩa là "chưa đặt trần", không phải "trần bằng 0".
  const decision = decideFinalization(
    passingInput({
      flags: { ...PASSING_FLAGS, monthlyCostCapUsd: 0 },
      monthToDateCostUsd: 999,
    })
  )
  assert.equal(decision.action, 'auto_finalize')
})

// ---------------------------------------------------------------------------
// Toàn vẹn đầu vào
// ---------------------------------------------------------------------------

test('nghi prompt injection -> suspected_prompt_injection', () => {
  assertBlockedBy(
    passingInput({ injectionSignals: ['role_override'] }),
    'suspected_prompt_injection'
  )
})

test('bài bị cắt bớt -> validator_rejected', () => {
  // Bài bị cắt nghĩa là AI chấm trên bản thiếu. Điểm đó không dùng được.
  assertBlockedBy(passingInput({ truncatedChars: 120 }), 'validator_rejected')
})

// ---------------------------------------------------------------------------
// Chất lượng OCR — ba cổng dành riêng cho môn Toán
// ---------------------------------------------------------------------------

test('OCR confidence dưới 0,9 -> low_ocr_confidence', () => {
  assertBlockedBy(passingInput({ ocr: scanned({ confidence: 0.85 }) }), 'low_ocr_confidence')
})

test('ngưỡng OCR chặt hơn ngưỡng chấm: 0,85 đủ cho chấm nhưng không đủ cho OCR', () => {
  // Đọc sai bài thì điểm chấm có tin cậy đến mấy cũng vô nghĩa, nên ngưỡng OCR
  // cố ý cao hơn confidenceMin của cấu hình.
  const decision = decideFinalization(
    passingInput({
      flags: { ...PASSING_FLAGS, confidenceMin: 0.8 },
      ocr: scanned({ confidence: 0.85 }),
    })
  )
  assert.equal(decision.action, 'pending_review')
})

test('công thức toán đọc không chắc -> math_region_uncertain', () => {
  assertBlockedBy(
    passingInput({
      ocr: scanned({ warnings: [{ kind: 'math_unreadable', detail: 'dòng 3' }] }),
    }),
    'math_region_uncertain'
  )
})

test('math_unreadable chặn dù confidence tổng thể rất cao', () => {
  // Chế độ hỏng nguy hiểm nhất với môn Toán: một dấu âm sai đủ đảo ngược kết
  // luận, và confidence trung bình cao không bù được điều đó.
  assertBlockedBy(
    passingInput({
      ocr: scanned({
        confidence: 1,
        warnings: [{ kind: 'math_unreadable', detail: 'lũy thừa' }],
      }),
    }),
    'math_region_uncertain'
  )
})

test('cảnh báo OCR loại khác -> ocr_warning', () => {
  assertBlockedBy(
    passingInput({ ocr: scanned({ warnings: [{ kind: 'page_skipped', detail: 'trang 2' }] }) }),
    'ocr_warning'
  )
})

test('cảnh báo math và cảnh báo thường cùng lúc -> đủ cả hai trigger', () => {
  const decision = decideFinalization(
    passingInput({
      ocr: scanned({
        warnings: [
          { kind: 'math_unreadable', detail: 'dòng 1' },
          { kind: 'truncated', detail: 'thiếu cuối bài' },
        ],
      }),
    })
  )
  assert.ok(decision.triggers.includes('math_region_uncertain'))
  assert.ok(decision.triggers.includes('ocr_warning'))
})

// ---------------------------------------------------------------------------
// Kết quả chấm
// ---------------------------------------------------------------------------

test('provider lỗi (grade null) -> provider_error', () => {
  assertBlockedBy(passingInput({ grade: null }), 'provider_error')
})

test('AI tự đề nghị người xem lại -> model_requested_review', () => {
  assertBlockedBy(
    passingInput({ grade: grade({ outcome: 'needs_human_review' }) }),
    'model_requested_review'
  )
})

test('confidence dưới ngưỡng -> low_grading_confidence', () => {
  assertBlockedBy(passingInput({ grade: grade({ confidence: 0.5 }) }), 'low_grading_confidence')
})

test('confidence đúng bằng ngưỡng thì cho qua', () => {
  // So sánh là `<` chứ không phải `<=`: đúng bằng ngưỡng là đạt ngưỡng.
  const decision = decideFinalization(
    passingInput({
      flags: { ...PASSING_FLAGS, confidenceMin: 0.9 },
      grade: grade({ confidence: 0.9 }),
    })
  )
  assert.equal(decision.action, 'auto_finalize')
})

test('AI tự đề nghị xem lại chặn dù confidence cao', () => {
  // Hai điều kiện độc lập: model có thể vừa tự tin vừa biết mình cần người xem.
  assertBlockedBy(
    passingInput({ grade: grade({ outcome: 'needs_human_review', confidence: 1 }) }),
    'model_requested_review'
  )
})

// ---------------------------------------------------------------------------
// Bất biến: fail-closed, không bao giờ fail-open
// ---------------------------------------------------------------------------

test('mọi cổng cùng chặn: gom đủ lý do, không mất trigger nào', () => {
  const decision = decideFinalization({
    flags: { enabled: false, autoFinalize: false, confidenceMin: 1, monthlyCostCapUsd: 1 },
    ocr: scanned({ confidence: 0.1, warnings: [{ kind: 'math_unreadable', detail: 'x' }] }),
    grade: grade({ outcome: 'needs_human_review', confidence: 0 }),
    injectionSignals: ['role_override'],
    truncatedChars: 10,
    monthToDateCostUsd: 100,
    overrideGuard: { blocked: true, reason: 'stats_unavailable', detail: 'không đọc được' },
  })

  assert.equal(decision.action, 'pending_review')
  for (const expected of [
    'ai_disabled',
    'auto_finalize_disabled',
    'cost_cap_reached',
    'suspected_prompt_injection',
    'validator_rejected',
    'low_ocr_confidence',
    'math_region_uncertain',
    'model_requested_review',
    'low_grading_confidence',
  ]) {
    assert.ok(decision.triggers.includes(expected as never), `thiếu trigger ${expected}`)
  }
})

test('triggers không bao giờ trùng lặp', () => {
  const decision = decideFinalization(
    passingInput({
      // truncatedChars đẩy 'validator_rejected'; nếu sau này có nhánh thứ hai
      // cũng đẩy trigger đó, dedupe phải giữ danh sách sạch.
      truncatedChars: 5,
      ocr: scanned({
        warnings: [
          { kind: 'page_skipped', detail: 'a' },
          { kind: 'truncated', detail: 'b' },
        ],
      }),
    })
  )
  assert.equal(
    new Set(decision.triggers).size,
    decision.triggers.length,
    'danh sách trigger có phần tử trùng'
  )
})

test('pending_review luôn có ít nhất một lý do', () => {
  // Hợp đồng của `FinalizeDecision.triggers`. Một bài về hàng chờ mà không có
  // lý do nào là bài giáo viên không biết phải làm gì với nó.
  const inputs: FinalizeInput[] = [
    passingInput({ grade: null }),
    passingInput({ flags: { ...PASSING_FLAGS, enabled: false } }),
    passingInput({ overrideGuard: undefined }),
    passingInput({ truncatedChars: 1 }),
  ]
  for (const input of inputs) {
    const decision = decideFinalization(input)
    assert.equal(decision.action, 'pending_review')
    assert.ok(decision.triggers.length > 0)
    assert.match(decision.explanation, /Lý do:/)
  }
})

test('không đầu vào nào biến sự cố thành điểm 0 hoặc điểm tối đa', () => {
  // Fail-open kiểu nguy hiểm nhất: hệ thống lỗi rồi "cho 0 điểm" hoặc "cho
  // điểm tối đa" thay vì hỏi người. Mọi nhánh chặn phải trả score === null.
  const brokenInputs: FinalizeInput[] = [
    passingInput({ grade: null }),
    passingInput({ grade: null, overrideGuard: undefined }),
    passingInput({ injectionSignals: ['role_override'] }),
    passingInput({ truncatedChars: 999 }),
    passingInput({ monthToDateCostUsd: 1_000 }),
    passingInput({ ocr: scanned({ confidence: 0 }) }),
    passingInput({ grade: grade({ confidence: 0, suggested_score: 0 }) }),
    passingInput({ grade: grade({ outcome: 'needs_human_review', suggested_score: 1 }) }),
  ]

  for (const input of brokenInputs) {
    const decision = decideFinalization(input)
    assert.equal(decision.action, 'pending_review')
    assert.equal(decision.score, null)
  }
})

test('điểm chỉ đi ra từ nhánh auto_finalize, và bằng đúng gợi ý của AI', () => {
  // Không có phép biến đổi nào giữa gợi ý và điểm ghi: chặn khả năng một lần
  // "làm tròn cho đẹp" lặng lẽ đổi điểm học sinh.
  for (const score of [0, 0.25, 0.5, 1, 2.75]) {
    const decision = decideFinalization(passingInput({ grade: grade({ suggested_score: score }) }))
    assert.equal(decision.action, 'auto_finalize')
    assert.equal(decision.score, score)
  }
})

// ---------------------------------------------------------------------------
// Gộp nhiều lần chụp — `aggregateOcrEvidence`
//
// Một bài tự luận thường là nhiều ảnh, và `ExamRunner` NỐI text của từng lần
// vào cùng một ô trả lời. Bản trước của worker chỉ đọc snapshot mới nhất, nên
// cả bài được đánh giá bằng đúng tấm ảnh cuối. Các test dưới đây khoá lại quy
// tắc gộp: mọi phép gộp phải nghiêng về phía chặn.
// ---------------------------------------------------------------------------

test('không có lần chụp nào -> null, hàm không tự đoán thay người gọi', () => {
  // `null` để người gọi phân biệt "gõ tay" với "mất dấu vết". Trả về một
  // evidence rỗng ở đây sẽ biến bài gõ tay thành bài chụp ảnh sạch.
  assert.equal(aggregateOcrEvidence([]), null)
})

test('confidence lấy nhỏ nhất, không phải lần cuối cũng không phải trung bình', () => {
  // Đây là lỗ hổng cụ thể của bản trước: trang mờ chụp trước, trang rõ chụp
  // sau, cổng chỉ nhìn thấy trang rõ.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ confidence: 0.35, textHash: 'a'.repeat(64), model: 'trang-mo' }),
    snapshotRow({ confidence: 0.96, textHash: 'b'.repeat(64), model: 'trang-ro' }),
  ])

  assert.ok(evidence)
  assert.equal(evidence.confidence, 0.35)
  assert.equal(evidence.captureCount, 2)
  // Provider/model phải là của lần TỆ NHẤT: đó là lần quyết định cổng chặn,
  // nên audit phải trỏ vào đúng nó.
  assert.equal(evidence.model, 'trang-mo')
})

test('trang mờ chụp trước vẫn chặn được auto-chốt', () => {
  // Phép thử end-to-end của lỗi trên, qua đúng đường mà worker đi.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ confidence: 0.35, textHash: 'a'.repeat(64) }),
    snapshotRow({ confidence: 0.96, textHash: 'b'.repeat(64) }),
  ])
  assert.ok(evidence)

  assertBlockedBy(passingInput({ ocr: { kind: 'scanned', evidence } }), 'low_ocr_confidence')
})

test('cảnh báo lấy hợp của mọi lần chụp, khử trùng lặp theo kind + detail', () => {
  const evidence = aggregateOcrEvidence([
    snapshotRow({
      textHash: 'a'.repeat(64),
      warningKinds: ['math_unreadable'],
      warningDetails: ['dòng 3'],
    }),
    snapshotRow({
      textHash: 'b'.repeat(64),
      // Cùng kind, khác dòng -> hai thông tin khác nhau cho giáo viên.
      warningKinds: ['math_unreadable', 'page_skipped'],
      warningDetails: ['dòng 7', 'trang 2'],
    }),
    snapshotRow({
      textHash: 'c'.repeat(64),
      // Trùng nguyên vẹn lần đầu -> chỉ giữ một.
      warningKinds: ['math_unreadable'],
      warningDetails: ['dòng 3'],
    }),
  ])

  assert.ok(evidence)
  assert.deepEqual(evidence.warnings, [
    { kind: 'math_unreadable', detail: 'dòng 3' },
    { kind: 'math_unreadable', detail: 'dòng 7' },
    { kind: 'page_skipped', detail: 'trang 2' },
  ])
})

test('cảnh báo của một trang duy nhất vẫn chặn cả bài', () => {
  // Không cho các trang sạch "bỏ phiếu lấn át" trang có vấn đề.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ textHash: 'a'.repeat(64) }),
    snapshotRow({
      textHash: 'b'.repeat(64),
      warningKinds: ['math_unreadable'],
      warningDetails: ['dòng 3'],
    }),
    snapshotRow({ textHash: 'c'.repeat(64) }),
  ])
  assert.ok(evidence)

  assertBlockedBy(passingInput({ ocr: { kind: 'scanned', evidence } }), 'math_region_uncertain')
})

test('detail thiếu không làm mất cảnh báo — kind mới là thứ quyết định', () => {
  // `warning_details` ngắn hơn `warning_kinds` là dữ liệu hỏng, nhưng bỏ qua
  // cảnh báo vì thiếu phần mô tả cho người đọc là fail-open.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ warningKinds: ['math_unreadable'], warningDetails: [] }),
  ])

  assert.ok(evidence)
  assert.deepEqual(evidence.warnings, [{ kind: 'math_unreadable', detail: '' }])
  assertBlockedBy(passingInput({ ocr: { kind: 'scanned', evidence } }), 'math_region_uncertain')
})

test('chụp trùng bị đếm và bị chặn, dù mọi lần chụp đều rõ', () => {
  // Học sinh bấm chụp hai lần cùng một tấm: text giống hệt bị nối vào ô trả
  // lời hai lần. Confidence cả hai lần đều cao nên không cổng nào khác thấy.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ textHash: 'a'.repeat(64) }),
    snapshotRow({ textHash: 'a'.repeat(64) }),
  ])

  assert.ok(evidence)
  assert.equal(evidence.duplicateCaptures, 1)
  assert.equal(evidence.confidence, 0.97)
  assertBlockedBy(passingInput({ ocr: { kind: 'scanned', evidence } }), 'ocr_duplicate_capture')
})

test('nhiều trang khác nhau không bị nhầm là chụp trùng', () => {
  // Nhánh ngược của test trên: đây là luồng bình thường của bài nhiều trang,
  // không được chặn oan.
  const evidence = aggregateOcrEvidence([
    snapshotRow({ textHash: 'a'.repeat(64) }),
    snapshotRow({ textHash: 'b'.repeat(64) }),
    snapshotRow({ textHash: 'c'.repeat(64) }),
  ])

  assert.ok(evidence)
  assert.equal(evidence.duplicateCaptures, 0)
  assert.deepEqual(evidence.textHashes, ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)])

  const decision = decideFinalization(passingInput({ ocr: { kind: 'scanned', evidence } }))
  assert.equal(decision.action, 'auto_finalize')
})
