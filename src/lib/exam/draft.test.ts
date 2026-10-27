/**
 * Test lưu nháp bài làm.
 *
 * Dùng một `Storage` giả thay cho `localStorage` để chạy được bằng
 * `node --test`, và để ép được những ca chỉ xảy ra trên máy thật: hết quota,
 * nháp hỏng, `localStorage` bị chặn hẳn.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearDraft,
  draftKey,
  formatSavedAt,
  loadDraft,
  pruneDrafts,
  saveDraft,
  type DraftStorage,
  type ExamDraftAnswers,
} from './draft.ts'

class FakeStorage implements DraftStorage {
  private map = new Map<string, string>()
  /** Khi bật, `setItem` ném như trình duyệt lúc hết quota. */
  full = false

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.full) {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
}

const ANSWERS: ExamDraftAnswers = {
  q1: { questionId: 'q1', questionType: 'multiple_choice', selectedAnswer: 'B' },
  q2: { questionId: 'q2', questionType: 'true_false', selectedAnswers: { a: true, b: false } },
  q3: { questionId: 'q3', questionType: 'short_answer', textAnswer: '2{,}5' },
}

test('ghi rồi đọc lại đúng đáp án đã chọn', () => {
  const storage = new FakeStorage()
  assert.equal(saveDraft('att-1', ANSWERS, storage), true)

  const draft = loadDraft('att-1', undefined, storage)
  assert.ok(draft)
  assert.deepEqual(draft.answers, ANSWERS)
  assert.ok(Date.parse(draft.savedAt) > 0)
})

test('nháp khoá theo lượt thi, không lẫn giữa hai lượt cùng đề', () => {
  const storage = new FakeStorage()
  saveDraft('att-1', ANSWERS, storage)
  // Lượt thứ hai của cùng đề: phải TRỐNG, không được thấy đáp án lượt trước.
  assert.equal(loadDraft('att-2', undefined, storage), null)
  assert.equal(draftKey('att-1') === draftKey('att-2'), false)
})

test('câu không thuộc đề đang mở bị bỏ khi nạp lại', () => {
  const storage = new FakeStorage()
  saveDraft('att-1', ANSWERS, storage)
  const draft = loadDraft('att-1', new Set(['q1', 'q3']), storage)
  assert.deepEqual(Object.keys(draft?.answers ?? {}), ['q1', 'q3'])
})

test('nháp hỏng một phần vẫn cứu được phần lành', () => {
  const storage = new FakeStorage()
  storage.setItem(
    draftKey('att-1'),
    JSON.stringify({
      v: 1,
      attemptId: 'att-1',
      savedAt: new Date().toISOString(),
      answers: {
        ok: { questionId: 'ok', questionType: 'multiple_choice', selectedAnswer: 'A' },
        thieuKieu: { questionId: 'thieuKieu', selectedAnswer: 'B' },
        saiKieu: 'không phải object',
        lanBoolean: { questionId: 'lanBoolean', questionType: 'true_false', selectedAnswers: { a: 'ừ' } },
      },
    })
  )
  const draft = loadDraft('att-1', undefined, storage)
  assert.deepEqual(Object.keys(draft?.answers ?? {}).sort(), ['lanBoolean', 'ok'])
  // Giá trị không phải boolean bị loại khỏi map chọn, không được giữ nguyên.
  assert.deepEqual(draft?.answers.lanBoolean.selectedAnswers, {})
})

test('JSON vỡ, sai phiên bản, hoặc lệch attemptId đều trả null — không ném lỗi', () => {
  const storage = new FakeStorage()
  storage.setItem(draftKey('a'), '{{{ không phải JSON')
  assert.equal(loadDraft('a', undefined, storage), null)

  storage.setItem(draftKey('b'), JSON.stringify({ v: 99, attemptId: 'b', answers: ANSWERS }))
  assert.equal(loadDraft('b', undefined, storage), null)

  storage.setItem(draftKey('c'), JSON.stringify({ v: 1, attemptId: 'KHAC', answers: ANSWERS }))
  assert.equal(loadDraft('c', undefined, storage), null)
})

test('nháp rỗng coi như không có — không hiện thông báo khôi phục vô nghĩa', () => {
  const storage = new FakeStorage()
  saveDraft('att-1', {}, storage)
  assert.equal(loadDraft('att-1', undefined, storage), null)
})

/** Ổ chứa có sức chứa hữu hạn — mô hình đúng của "hết quota" trên trình duyệt. */
class LimitedStorage implements DraftStorage {
  private map = new Map<string, string>()
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (!this.map.has(key) && this.map.size >= this.capacity) {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
}

test('hết quota: dọn nháp lượt khác rồi ghi lại, bài đang thi được ưu tiên', () => {
  const storage = new LimitedStorage(2)
  saveDraft('att-cu-1', ANSWERS, storage)
  saveDraft('att-cu-2', ANSWERS, storage)
  assert.equal(storage.length, 2, 'ổ chứa đã đầy')

  // Lần ghi đầu ném vì đầy; hàm phải tự dọn nháp của lượt khác rồi thử lại.
  assert.equal(saveDraft('att-moi', ANSWERS, storage), true)
  assert.ok(loadDraft('att-moi', undefined, storage))
  assert.equal(loadDraft('att-cu-1', undefined, storage), null, 'nháp cũ đã bị dọn để nhường chỗ')
  assert.equal(loadDraft('att-cu-2', undefined, storage), null)
})

test('không có localStorage thì mọi hàm im lặng, không ném', () => {
  assert.equal(saveDraft('att', ANSWERS, null), false)
  assert.equal(loadDraft('att', undefined, null), null)
  assert.doesNotThrow(() => clearDraft('att', null))
  assert.equal(pruneDrafts(null), 0)
})

test('dọn nháp quá hạn, giữ nháp còn hạn', () => {
  const storage = new FakeStorage()
  const now = new Date('2026-10-27T10:00:00Z')
  saveDraft('moi', ANSWERS, storage, now)
  saveDraft('cu', ANSWERS, storage, new Date('2026-10-01T10:00:00Z'))
  storage.setItem(draftKey('hong'), 'không đọc được')

  assert.equal(pruneDrafts(storage, now), 2)
  assert.ok(loadDraft('moi', undefined, storage))
  assert.equal(loadDraft('cu', undefined, storage), null)
})

test('xoá nháp sau khi nộp', () => {
  const storage = new FakeStorage()
  saveDraft('att-1', ANSWERS, storage)
  clearDraft('att-1', storage)
  assert.equal(loadDraft('att-1', undefined, storage), null)
})

test('formatSavedAt đọc được giờ, mốc hỏng trả null', () => {
  const text = formatSavedAt(new Date(2026, 9, 27, 14, 5).toISOString())
  assert.equal(text, '14:05 ngày 27/10')
  assert.equal(formatSavedAt('không phải ngày'), null)
})
