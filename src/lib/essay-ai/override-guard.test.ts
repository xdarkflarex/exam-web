/**
 * Test cho cổng chặn auto-chốt theo mức giáo viên chấm đè.
 *
 * Cổng này là kill-switch tự động mà `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 7
 * yêu cầu. Bất biến phải giữ: nó CHỈ được siết, và mọi trạng thái "không biết"
 * đều dẫn tới chặn. Một cổng an toàn mà cho qua khi thiếu dữ liệu thì tệ hơn là
 * không có cổng, vì nó tạo cảm giác đã được bảo vệ.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_OVERRIDE_THRESHOLDS,
  evaluateOverrideGuard,
  readOverrideThresholds,
  type OverrideStats,
  type OverrideThresholds,
} from './override-guard.ts'

/** Số liệu đủ tốt để được phép auto-chốt theo ngưỡng mặc định. */
function passingStats(overrides: Partial<OverrideStats> = {}): OverrideStats {
  return {
    compared: 50,
    changed: 5, // 10%, dưới ngưỡng 30%
    serious: 1, // 2%, dưới ngưỡng 5%
    partial: false,
    ...overrides,
  }
}

const LOOSE: OverrideThresholds = {
  minCompared: 1,
  maxChangedRate: 1,
  maxSeriousRate: 1,
}

// ---------------------------------------------------------------------------
// Nhánh cho phép
// ---------------------------------------------------------------------------

test('số liệu đạt ngưỡng thì không chặn', () => {
  assert.deepEqual(evaluateOverrideGuard(passingStats()), { blocked: false })
})

test('không sai nghiêm trọng và không ai sửa điểm thì không chặn', () => {
  assert.equal(
    evaluateOverrideGuard(passingStats({ changed: 0, serious: 0 })).blocked,
    false
  )
})

// ---------------------------------------------------------------------------
// Thiếu dữ liệu -> chặn
// ---------------------------------------------------------------------------

test('không đọc được số liệu (null) thì chặn', () => {
  const verdict = evaluateOverrideGuard(null)
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'stats_unavailable')
})

test('null vẫn chặn dù ngưỡng đặt lỏng hết mức', () => {
  // Ngưỡng lỏng không được biến "không có dữ liệu" thành "đạt".
  assert.equal(evaluateOverrideGuard(null, LOOSE).blocked, true)
})

test('partial thì chặn, vì con số nhìn thấy chỉ là mức tối thiểu của vấn đề', () => {
  const verdict = evaluateOverrideGuard(passingStats({ partial: true }))
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'stats_unavailable')
})

test('partial chặn kể cả khi các con số khác đều hoàn hảo', () => {
  assert.equal(
    evaluateOverrideGuard(
      { compared: 1_000, changed: 0, serious: 0, partial: true },
      LOOSE
    ).blocked,
    true
  )
})

// ---------------------------------------------------------------------------
// Chưa đủ bằng chứng
// ---------------------------------------------------------------------------

test('chưa có bài nào đối chiếu thì chặn — KHI minCompared > 0', () => {
  const verdict = evaluateOverrideGuard(
    { compared: 0, changed: 0, serious: 0, partial: false },
    { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 20 }
  )
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'insufficient_evidence')
})

test('"0% sai" trên một bài duy nhất KHÔNG phải bằng chứng — KHI minCompared > 0', () => {
  // Nhánh dễ bị bỏ qua nhất: mọi tỷ lệ đều hoàn hảo, nhưng cỡ mẫu bằng 1.
  const verdict = evaluateOverrideGuard(
    { compared: 1, changed: 0, serious: 0, partial: false },
    { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 20 }
  )
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'insufficient_evidence')
})

test('đúng ngưỡng minCompared thì đạt', () => {
  const stats: OverrideStats = {
    compared: 20,
    changed: 0,
    serious: 0,
    partial: false,
  }
  assert.equal(
    evaluateOverrideGuard(stats, { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 20 }).blocked,
    false
  )
})

// ---------------------------------------------------------------------------
// minCompared = 0 — quyết định của chủ dự án 2026-08-07
//
// Lớp học thêm, điểm không phải điểm học bạ, và yêu cầu sản phẩm là học sinh nộp
// xong thấy điểm luôn. Bài ĐẦU TIÊN cũng được AI chốt, không chờ tích luỹ bằng
// chứng. Các test dưới đây khoá lại hai nửa của quyết định đó: cổng mở khi chưa
// có dữ liệu, nhưng phanh theo tỷ lệ vẫn siết ngay khi có dữ liệu.
// ---------------------------------------------------------------------------

test('minCompared = 0 (mặc định hiện tại): chưa có bài đối chiếu vẫn cho auto-chốt', () => {
  assert.equal(DEFAULT_OVERRIDE_THRESHOLDS.minCompared, 0)

  const verdict = evaluateOverrideGuard({
    compared: 0,
    changed: 0,
    serious: 0,
    partial: false,
  })
  assert.equal(verdict.blocked, false)
})

test('compared = 0 mở cổng như một QUYẾT ĐỊNH, không phải do NaN', () => {
  // `0/0` cho `NaN`, và `NaN > ngưỡng` luôn false — nên nếu nhánh compared === 0
  // bị xoá, cổng vẫn "mở" nhưng vì lý do sai. Test này khoá lại rằng việc mở phụ
  // thuộc `minCompared`, không phụ thuộc số học: cùng dữ liệu, minCompared = 1
  // phải CHẶN.
  const stats: OverrideStats = { compared: 0, changed: 0, serious: 0, partial: false }

  assert.equal(
    evaluateOverrideGuard(stats, { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 0 }).blocked,
    false
  )
  assert.equal(
    evaluateOverrideGuard(stats, { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 1 }).blocked,
    true
  )
})

test('minCompared = 0 nhưng phanh theo tỷ lệ vẫn siết từ bài đối chiếu đầu tiên', () => {
  // Đây là nửa quan trọng hơn: bỏ yêu cầu bằng chứng KHÔNG được biến thành bỏ
  // luôn kill-switch. Một bài đối chiếu, sai nghiêm trọng -> 100% > 5% -> chặn.
  const verdict = evaluateOverrideGuard({
    compared: 1,
    changed: 1,
    serious: 1,
    partial: false,
  })
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'serious_rate_exceeded')
})

test('minCompared = 0 không nới nhánh không đọc được số liệu', () => {
  // `stats = null` nghĩa là không biết đang chấm lệch bao nhiêu. Bỏ yêu cầu bằng
  // chứng là chấp nhận chấm khi CHƯA CÓ dữ liệu, không phải khi MẤT dữ liệu.
  const verdict = evaluateOverrideGuard(null)
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'stats_unavailable')
})

test('câu giải thích nói rõ còn thiếu bao nhiêu bài', () => {
  const verdict = evaluateOverrideGuard(
    { compared: 3, changed: 0, serious: 0, partial: false },
    { ...DEFAULT_OVERRIDE_THRESHOLDS, minCompared: 20 }
  )
  assert.ok(verdict.blocked)
  assert.match(verdict.detail, /3\/20/)
})

// ---------------------------------------------------------------------------
// Vượt ngưỡng
// ---------------------------------------------------------------------------

test('tỷ lệ sai nghiêm trọng vượt ngưỡng thì chặn', () => {
  const verdict = evaluateOverrideGuard(passingStats({ compared: 100, serious: 6 }))
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'serious_rate_exceeded')
})

test('tỷ lệ sửa điểm vượt ngưỡng thì chặn', () => {
  const verdict = evaluateOverrideGuard(passingStats({ compared: 100, changed: 31 }))
  assert.equal(verdict.blocked, true)
  assert.equal(verdict.blocked && verdict.reason, 'changed_rate_exceeded')
})

test('đúng bằng ngưỡng là đạt, không phải vượt', () => {
  // So sánh dùng `>`: 5% đúng bằng ngưỡng thì cho qua.
  assert.equal(
    evaluateOverrideGuard(passingStats({ compared: 100, serious: 5, changed: 30 })).blocked,
    false
  )
})

test('sai nghiêm trọng được báo trước tỷ lệ sửa điểm', () => {
  // Cả hai đều vượt: người vận hành phải thấy vấn đề nghiêm trọng hơn, không
  // phải cái đầu tiên trong code.
  const verdict = evaluateOverrideGuard(
    passingStats({ compared: 100, changed: 90, serious: 50 })
  )
  assert.equal(verdict.blocked && verdict.reason, 'serious_rate_exceeded')
})

test('một bài sai nghiêm trọng trên 20 bài là đủ để chặn', () => {
  // 5% > 5%? Không. Nhưng 1/20 = 5% đúng bằng ngưỡng -> đạt. Kiểm mốc thật:
  assert.equal(evaluateOverrideGuard(passingStats({ compared: 20, serious: 1 })).blocked, false)
  // 2/20 = 10% -> chặn.
  assert.equal(evaluateOverrideGuard(passingStats({ compared: 20, serious: 2 })).blocked, true)
})

// ---------------------------------------------------------------------------
// readOverrideThresholds — cấu hình sai phải siết, không được nới
// ---------------------------------------------------------------------------

test('thiếu env thì dùng mặc định', () => {
  assert.deepEqual(readOverrideThresholds({}), DEFAULT_OVERRIDE_THRESHOLDS)
})

test('env hợp lệ được áp dụng', () => {
  const thresholds = readOverrideThresholds({
    ESSAY_AI_OVERRIDE_MIN_COMPARED: '100',
    ESSAY_AI_OVERRIDE_MAX_CHANGED_RATE: '0.1',
    ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE: '0.01',
  })
  assert.deepEqual(thresholds, {
    minCompared: 100,
    maxChangedRate: 0.1,
    maxSeriousRate: 0.01,
  })
})

test('giá trị rác về mặc định thay vì làm cổng lỏng ra', () => {
  // Một typo trong env không được biến thành "cho phép auto-chốt thoải mái".
  for (const bad of ['', 'nhiều', 'NaN', '-1', '1.5', '2', 'true']) {
    const thresholds = readOverrideThresholds({
      ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE: bad,
      ESSAY_AI_OVERRIDE_MAX_CHANGED_RATE: bad,
    })
    assert.equal(
      thresholds.maxSeriousRate,
      DEFAULT_OVERRIDE_THRESHOLDS.maxSeriousRate,
      `"${bad}" không được đổi maxSeriousRate`
    )
    assert.equal(
      thresholds.maxChangedRate,
      DEFAULT_OVERRIDE_THRESHOLDS.maxChangedRate,
      `"${bad}" không được đổi maxChangedRate`
    )
  }
})

test('minCompared: giá trị âm hoặc không phải số nguyên về mặc định', () => {
  // `'0'` KHÔNG còn nằm trong danh sách này: 0 là giá trị hợp lệ mang nghĩa
  // "không đòi bằng chứng trước", không phải lỗi cấu hình cần bỏ qua.
  for (const bad of ['-5', '3.7', 'hai mươi', '']) {
    assert.equal(
      readOverrideThresholds({ ESSAY_AI_OVERRIDE_MIN_COMPARED: bad }).minCompared,
      DEFAULT_OVERRIDE_THRESHOLDS.minCompared,
      `"${bad}" không được đổi minCompared`
    )
  }
})

test('minCompared: "0" là giá trị hợp lệ, không bị bỏ về mặc định', () => {
  assert.equal(
    readOverrideThresholds({ ESSAY_AI_OVERRIDE_MIN_COMPARED: '0' }).minCompared,
    0
  )
})

test('minCompared: đặt lại thành số dương vẫn siết được như trước', () => {
  // Đường lui: nếu thấy AI chấm lệch nhiều, đặt lại biến này là quay về chế độ
  // đòi bằng chứng mà không cần sửa code.
  assert.equal(
    readOverrideThresholds({ ESSAY_AI_OVERRIDE_MIN_COMPARED: '20' }).minCompared,
    20
  )
})

test('đặt tỷ lệ 0 là hợp lệ: nghĩa là không cho phép sai sót nào', () => {
  // 0 là cấu hình siết nhất, phải được tôn trọng chứ không coi là "thiếu".
  const thresholds = readOverrideThresholds({
    ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE: '0',
  })
  assert.equal(thresholds.maxSeriousRate, 0)
  // Và nó phải thực sự chặn một bài sai nghiêm trọng duy nhất.
  assert.equal(
    evaluateOverrideGuard(passingStats({ compared: 100, serious: 1 }), thresholds).blocked,
    true
  )
})

test('biến bỏ trống là "chưa đặt", không phải số 0', () => {
  // `Number('')` bằng 0. Không lọc thì `ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE=`
  // (dòng bỏ trống trong .env) thành "không cho phép sai bài nào" và chặn
  // auto-chốt mãi mãi mà người vận hành không hiểu vì sao.
  for (const blank of ['', ' ', '\t']) {
    const thresholds = readOverrideThresholds({
      ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE: blank,
      ESSAY_AI_OVERRIDE_MAX_CHANGED_RATE: blank,
      ESSAY_AI_OVERRIDE_MIN_COMPARED: blank,
    })
    assert.deepEqual(thresholds, DEFAULT_OVERRIDE_THRESHOLDS, `"${blank}" phải về mặc định`)
  }
})

test('minCompared lớn không bị kẹp trần: siết thì luôn được phép', () => {
  assert.equal(
    readOverrideThresholds({ ESSAY_AI_OVERRIDE_MIN_COMPARED: '100000' }).minCompared,
    100_000
  )
})
