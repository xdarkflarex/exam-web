#!/usr/bin/env node
/**
 * Supabase GIẢ chạy trên máy, đủ cho luồng học sinh: trang chủ → đăng ký →
 * đăng nhập → danh sách đề → chuẩn bị → làm bài → nộp → xem kết quả.
 *
 * VÌ SAO CẦN: container của phiên làm việc không có `.env` của Primary, nên
 * không có cách nào chạm vào database thật — mà quay video luồng thi thì phải
 * có backend trả lời. File này nói đúng phương ngữ PostgREST + GoTrue mà
 * `supabase-js` gửi đi, nên APP KHÔNG BỊ SỬA MỘT DÒNG NÀO để quay.
 *
 * NÓ CHỨNG MINH ĐƯỢC GÌ: giao diện, điều hướng, thông báo lỗi, và các cổng chặn
 * mà client phải xử lý. NÓ KHÔNG CHỨNG MINH: RLS thật, transaction thật, hiệu
 * năng thật. Những thứ đó chỉ Primary trả lời được.
 *
 * Hai công tắc mô phỏng đúng trạng thái production hôm nay:
 *   MOCK_ACCESS_TIER=basic|full     gói quyền của tài khoản mới (production: basic)
 *   MOCK_ANON_GRADE=0|1             anon có được SELECT cột `exams.grade` không
 *                                   (production hôm nay: 0 — chưa cấp)
 *   MOCK_ANON_PRACTICE=0|1          anon có thấy đề ôn tập không
 *                                   (production hôm nay: 0 — policy chỉ cho simulation)
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT || 54321)
const ANON_GRADE = process.env.MOCK_ANON_GRADE === '1'
const ANON_PRACTICE = process.env.MOCK_ANON_PRACTICE === '1'
const DEFAULT_TIER = process.env.MOCK_ACCESS_TIER === 'full' ? 'full' : 'basic'

/** Cột mà `20260722:3339` cấp cho anon trên `exams`. Thiếu `grade`, thiếu `description`. */
const ANON_EXAM_COLUMNS = new Set([
  'id', 'title', 'subject', 'duration', 'is_published', 'exam_mode', 'created_at',
  ...(ANON_GRADE ? ['grade', 'description'] : []),
])

const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

// ───────────────────────────────────────────────────────────────── dữ liệu giả

const db = {
  classes: [
    { id: 'class_12a1', name: '12A1', grade: 12, teacher_id: 'teacher-1', student_count: 18 },
    { id: 'class_11a2', name: '11A2', grade: 11, teacher_id: 'teacher-1', student_count: 14 },
    { id: 'class_10a3', name: '10A3', grade: 10, teacher_id: 'teacher-1', student_count: 11 },
  ],
  profiles: [
    {
      id: 'student-cu', email: 'hocsinh.cu@example.com', role: 'student',
      full_name: 'Nguyễn Văn An', school: 'THPT Bãi Cháy', class_id: 'class_12a1',
      grade: null, access_tier: DEFAULT_TIER, must_change_password: false,
      created_at: daysAgo(120), updated_at: daysAgo(3),
    },
  ],
  exams: [
    {
      id: 'exam-tn-2026-l1', title: 'Đề thi thử TN THPT 2026 — Lần 1', subject: 'Toán',
      description: 'Cấu trúc 2025: 12 câu trắc nghiệm, 4 câu Đúng/Sai, 6 câu trả lời ngắn.',
      duration: 90, grade: 12, exam_mode: 'simulation', is_published: true,
      max_attempts: 1, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(2),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
    {
      id: 'exam-nhanh-ham-so', title: 'Kiểm tra nhanh 20 phút — Hàm số và đồ thị', subject: 'Toán',
      description: 'Đề ngắn để làm thử: 1 câu trắc nghiệm, 1 câu Đúng/Sai, 1 câu trả lời ngắn.',
      duration: 20, grade: 12, exam_mode: 'simulation', is_published: true,
      max_attempts: 0, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(5),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
    {
      id: 'exam-gk1-11', title: 'Đề giữa kì 1 — Lớp 11', subject: 'Toán',
      description: 'Dãy số, cấp số cộng, cấp số nhân, lượng giác.',
      duration: 90, grade: 11, exam_mode: 'simulation', is_published: true,
      max_attempts: 1, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(12),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
    {
      id: 'exam-ck1-10', title: 'Đề cuối kì 1 — Lớp 10', subject: 'Toán',
      description: 'Mệnh đề, tập hợp, bất phương trình, thống kê.',
      duration: 90, grade: 10, exam_mode: 'simulation', is_published: true,
      max_attempts: 1, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(20),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
    {
      id: 'exam-tn-2025-l3', title: 'Đề thi thử TN THPT 2025 — Lần 3', subject: 'Toán',
      description: null,
      duration: 90, grade: null, exam_mode: 'simulation', is_published: true,
      max_attempts: 1, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(40),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
    {
      id: 'exam-on-tich-phan', title: 'Ôn tập Tích phân — làm lại tuỳ ý', subject: 'Toán',
      description: 'Không đồng hồ, không giới hạn lượt. Sai thì xem lời giải rồi làm lại.',
      duration: 0, grade: 12, exam_mode: 'practice', is_published: true,
      max_attempts: 0, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(7),
      show_results_immediately: true, allow_review: true, scoring_profile: 'custom',
    },
    {
      id: 'exam-on-xac-suat', title: 'Ôn tập Xác suất có điều kiện', subject: 'Toán',
      description: 'Không đồng hồ, không giới hạn lượt.',
      duration: 0, grade: 11, exam_mode: 'practice', is_published: true,
      max_attempts: 0, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(9),
      show_results_immediately: true, allow_review: true, scoring_profile: 'custom',
    },
    {
      id: 'exam-nhap', title: 'Đề nháp chưa xuất bản — KHÔNG được lộ ra ngoài', subject: 'Toán',
      description: null,
      duration: 90, grade: 12, exam_mode: 'simulation', is_published: false,
      max_attempts: 1, class_id: null, start_time: null, end_time: null,
      total_score: 10, passing_score: 5, created_by: 'teacher-1', created_at: daysAgo(1),
      show_results_immediately: true, allow_review: true, scoring_profile: 'moet_standard',
    },
  ],
  topics: [
    { id: 't1', name: 'Hàm số và đồ thị', order_index: 1 },
    { id: 't2', name: 'Nguyên hàm — Tích phân', order_index: 2 },
    { id: 't3', name: 'Hình học không gian Oxyz', order_index: 3 },
    { id: 't4', name: 'Xác suất có điều kiện', order_index: 4 },
    { id: 't5', name: 'Dãy số — Cấp số', order_index: 5 },
    { id: 't6', name: 'Thống kê mẫu ghép nhóm', order_index: 6 },
  ],
  theories: Array.from({ length: 29 }, (_, i) => ({
    id: `theory-${i + 1}`, title: `Bài lý thuyết ${i + 1}`, is_published: true,
  })),
  posts: [
    {
      id: 'p1', title: 'Cấu trúc đề thi tốt nghiệp THPT 2026 môn Toán', slug: 'cau-truc-de-2026',
      excerpt: 'Ba phần: trắc nghiệm, Đúng/Sai, trả lời ngắn. Cách tính điểm từng phần.',
      cover_image: null, category: 'Hướng dẫn', status: 'published', published_at: daysAgo(4),
    },
    {
      id: 'p2', title: 'Sai lầm thường gặp khi tính tích phân từng phần', slug: 'sai-lam-tich-phan',
      excerpt: 'Năm lỗi chiếm phần lớn số câu mất điểm trong các đề thi thử vừa rồi.',
      cover_image: null, category: 'Kiến thức', status: 'published', published_at: daysAgo(10),
    },
  ],
  announcements: [],
  site_settings: [],
  exam_questions: [],
  questions: [],
  answers: [],
  exam_attempts: [],
  student_answers: [],
  question_feedbacks: [],
  anti_cheat_logs: [],
  essay_answer_uploads: [],
  question_bookmarks: [],
}

/** Ngân hàng câu cho đề ngắn — đủ ba loại câu của cấu trúc 2025. */
const QUESTION_BANK = {
  'exam-nhanh-ham-so': [
    {
      id: 'q-tn-1', part_number: 1, order_in_part: 1, question_type: 'multiple_choice',
      content: 'Cho hàm số $y = x^3 - 3x + 2$. Hàm số đồng biến trên khoảng nào sau đây?',
      explanation: '$y\' = 3x^2 - 3 = 3(x-1)(x+1) > 0 \\Leftrightarrow x < -1$ hoặc $x > 1$.',
      solution: 'Xét $y\' = 3x^2 - 3$. Giải $y\' > 0$ được $x \\in (-\\infty;-1) \\cup (1;+\\infty)$.',
      answers: [
        { id: 'a1', content: '$(-1; 1)$', is_correct: false, order_index: 1 },
        { id: 'a2', content: '$(1; +\\infty)$', is_correct: true, order_index: 2 },
        { id: 'a3', content: '$(-\\infty; 0)$', is_correct: false, order_index: 3 },
        { id: 'a4', content: '$(0; 2)$', is_correct: false, order_index: 4 },
      ],
    },
    {
      id: 'q-ds-1', part_number: 2, order_in_part: 1, question_type: 'true_false',
      content: 'Cho hàm số $y = \\dfrac{2x+1}{x-1}$. Xét tính đúng/sai của các phát biểu:',
      explanation: 'Tiệm cận đứng $x=1$, tiệm cận ngang $y=2$; hàm nghịch biến trên từng khoảng xác định.',
      solution: '$y\' = \\dfrac{-3}{(x-1)^2} < 0$ với mọi $x \\ne 1$.',
      answers: [
        { id: 'b1', content: 'Đồ thị có tiệm cận đứng $x = 1$.', is_correct: true, order_index: 1 },
        { id: 'b2', content: 'Đồ thị có tiệm cận ngang $y = 2$.', is_correct: true, order_index: 2 },
        { id: 'b3', content: 'Hàm số đồng biến trên $(1; +\\infty)$.', is_correct: false, order_index: 3 },
        { id: 'b4', content: 'Đồ thị đi qua điểm $(0; -1)$.', is_correct: true, order_index: 4 },
      ],
    },
    {
      id: 'q-tln-1', part_number: 3, order_in_part: 1, question_type: 'short_answer',
      content: 'Giá trị nhỏ nhất của hàm số $y = x + \\dfrac{4}{x}$ trên khoảng $(0; +\\infty)$ bằng bao nhiêu?',
      explanation: 'Theo bất đẳng thức Cô-si: $x + \\dfrac{4}{x} \\ge 2\\sqrt{4} = 4$, dấu bằng khi $x = 2$.',
      solution: 'Cô-si cho hai số dương: giá trị nhỏ nhất là $4$ tại $x = 2$.',
      answers: [{ id: 'c1', content: '4', is_correct: true, order_index: 1 }],
    },
  ],
}

for (const [examId, questions] of Object.entries(QUESTION_BANK)) {
  questions.forEach((question, index) => {
    db.questions.push(question)
    db.exam_questions.push({
      id: `eq-${examId}-${index}`, exam_id: examId, question_id: question.id,
      part_number: question.part_number, order_in_part: question.order_in_part,
    })
    for (const answer of question.answers) db.answers.push({ ...answer, question_id: question.id })
  })
}
// Các đề còn lại: chỉ cần SỐ CÂU cho card ở trang chủ, không cần nội dung.
for (const [examId, count] of Object.entries({
  'exam-tn-2026-l1': 22, 'exam-gk1-11': 22, 'exam-ck1-10': 22,
  'exam-tn-2025-l3': 22, 'exam-on-tich-phan': 15, 'exam-on-xac-suat': 12,
})) {
  for (let i = 0; i < count; i++) {
    db.exam_questions.push({ id: `eq-${examId}-${i}`, exam_id: examId, question_id: `qx-${examId}-${i}` })
  }
}

// ───────────────────────────────────────────────────────────── phiên đăng nhập

const users = new Map() // id → {id, email, password, user_metadata}
users.set('student-cu', {
  id: 'student-cu', email: 'hocsinh.cu@example.com', password: 'MatKhau123!',
  user_metadata: { full_name: 'Nguyễn Văn An' },
})
const tokens = new Map() // access_token → user id

function authUser(headers) {
  const raw = headers.authorization || ''
  const token = raw.replace(/^Bearer\s+/i, '')
  if (!token || token === (process.env.MOCK_ANON_KEY || 'anon-key-mock')) return null
  const id = tokens.get(token)
  return id ? users.get(id) : null
}

function userPayload(user) {
  return {
    id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
    email_confirmed_at: now(), phone: '', confirmed_at: now(), last_sign_in_at: now(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: user.user_metadata || {},
    // Supabase thật trả danh sách identity KHÔNG rỗng cho tài khoản mới; rỗng
    // là tín hiệu "email đã đăng ký nhưng chưa xác minh", và
    // `api/auth/signup/route.ts:219` dựa đúng vào đó.
    identities: [{ id: user.id, user_id: user.id, provider: 'email', identity_data: { email: user.email, sub: user.id } }],
    created_at: now(), updated_at: now(),
  }
}

/** JWT giả: `supabase-js` chỉ giải mã phần payload, không kiểm chữ ký. */
function fakeJwt(user) {
  const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url')
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: user.id, email: user.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
    'chu-ky-gia',
  ].join('.')
}

function session(user) {
  const access_token = fakeJwt(user)
  tokens.set(access_token, user.id)
  return {
    access_token, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.id}-${randomUUID()}`, user: userPayload(user),
  }
}

// ────────────────────────────────────────────────────── bộ máy truy vấn PostgREST

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  if (current) parts.push(current)
  return parts
}

function castValue(raw) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  return raw.replace(/^"|"$/g, '')
}

function matchOne(row, expression) {
  const firstDot = expression.indexOf('.')
  const column = expression.slice(0, firstDot)
  const rest = expression.slice(firstDot + 1)
  const secondDot = rest.indexOf('.')
  const op = secondDot === -1 ? rest : rest.slice(0, secondDot)
  const rawValue = secondDot === -1 ? '' : rest.slice(secondDot + 1)
  const value = castValue(rawValue)
  const cell = row[column]

  switch (op) {
    case 'eq': return cell === value
    case 'neq': return cell !== value
    case 'is': return value === null ? cell === null || cell === undefined : cell === value
    case 'gt': return cell > value
    case 'gte': return cell >= value
    case 'lt': return cell < value
    case 'lte': return cell <= value
    case 'in': {
      const list = rawValue.replace(/^\(|\)$/g, '').split(',').map((item) => castValue(item.trim()))
      return list.includes(cell)
    }
    case 'like':
    case 'ilike': {
      const pattern = String(rawValue).replace(/[*%]/g, '\u0001')
      const escaped = pattern.split('\u0001').map((piece) =>
        piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      return new RegExp(`^${escaped}$`, op === 'ilike' ? 'i' : '').test(String(cell ?? ''))
    }
    case 'not': return !matchOne(row, `${column}.${rawValue}`)
    default: return true
  }
}

function queryRows(table, params, user) {
  let rows = (db[table] || []).map((row) => ({ ...row }))

  // Mô phỏng hai policy quan trọng của `exams` (20260722).
  if (table === 'exams') {
    if (!user) {
      rows = rows.filter((row) =>
        row.is_published && (row.exam_mode === 'simulation' || (ANON_PRACTICE && row.exam_mode === 'practice')))
    } else {
      rows = rows.filter((row) => row.is_published || row.created_by === user.id)
    }
  }
  if (table === 'exam_attempts' && user) rows = rows.filter((row) => row.student_id === user.id)
  if (table === 'question_feedbacks' && user) rows = rows.filter((row) => row.student_id === user.id)

  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    if (key === 'or') {
      const options = splitTopLevel(raw.replace(/^\(|\)$/g, ''))
      rows = rows.filter((row) => options.some((option) => matchOne(row, option)))
      continue
    }
    rows = rows.filter((row) => matchOne(row, `${key}.${raw}`))
  }

  for (const raw of params.getAll('order')) {
    for (const piece of raw.split(',')) {
      const [column, direction = 'asc'] = piece.split('.')
      rows.sort((left, right) => {
        const a = left[column], b = right[column]
        if (a === b) return 0
        const less = (a ?? '') < (b ?? '') ? -1 : 1
        return direction.startsWith('desc') ? -less : less
      })
    }
  }

  const total = rows.length
  const limit = params.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))

  const select = params.get('select')
  if (select && select !== '*') {
    const columns = splitTopLevel(select).map((piece) => piece.trim()).filter((piece) => !piece.includes('('))
    // Grant theo CỘT của anon trên `exams` — chọn cột chưa cấp là cả câu bị từ chối.
    if (table === 'exams' && !user) {
      const denied = columns.find((column) => !ANON_EXAM_COLUMNS.has(column))
      if (denied) {
        return { error: { code: '42501', message: `permission denied for column ${denied} of relation exams`, details: null, hint: null } }
      }
    }
    rows = rows.map((row) => {
      const picked = {}
      for (const column of columns) picked[column] = row[column] ?? null
      return picked
    })
  }

  return { rows, total }
}

// ─────────────────────────────────────────────────────────────────────── RPC

function profileOf(userId) {
  return db.profiles.find((row) => row.id === userId) || null
}

function featureFlags() {
  const row = db.site_settings.find((item) => item.key === 'access.feature_flags')
  return row?.value || {}
}

/** Bản sao của `public.student_has_feature` (20260722:300). */
function studentHasFeature(user, feature) {
  if (!user) return false
  const profile = profileOf(user.id)
  if (!profile || profile.role !== 'student') return false
  if (profile.access_tier === 'full') return true
  const defaults = { practice: true, simulation: false, homework: true }
  const flags = featureFlags()
  const override = flags?.[profile.access_tier || 'basic']?.[feature]
  return typeof override === 'boolean' ? override : Boolean(defaults[feature])
}

function questionsOfExam(examId) {
  return db.exam_questions
    .filter((link) => link.exam_id === examId && db.questions.some((q) => q.id === link.question_id))
    .map((link) => {
      const question = db.questions.find((q) => q.id === link.question_id)
      return { ...question, answers: db.answers.filter((a) => a.question_id === question.id) }
    })
}

function rpcError(message, code = '42501') {
  return { status: code === '42501' ? 403 : 400, body: { code, message, details: null, hint: null } }
}

const RPC = {
  get_my_grade(user) {
    const profile = user && profileOf(user.id)
    const klass = profile && db.classes.find((row) => row.id === profile.class_id)
    return { status: 200, body: klass ? klass.grade : null }
  },

  get_my_safe_bookmarks() {
    return { status: 200, body: [] }
  },

  get_exam_preparation(user, args) {
    if (!user) return rpcError('UNAUTHENTICATED')
    const exam = db.exams.find((row) => row.id === args.p_exam_id && row.is_published)
    if (!exam) return rpcError('EXAM_NOT_AVAILABLE')
    const mine = db.exam_attempts.filter((row) => row.exam_id === exam.id && row.student_id === user.id)
    const done = mine.filter((row) => ['submitted', 'graded'].includes(row.status))
    const open = mine.find((row) => row.status === 'in_progress') || null
    const max = exam.exam_mode === 'simulation' ? (exam.max_attempts ?? 1) : 0
    return {
      status: 200,
      body: {
        exam: {
          id: exam.id, title: exam.title, description: exam.description, subject: exam.subject,
          duration: exam.duration,
          question_count: db.exam_questions.filter((link) => link.exam_id === exam.id).length,
        },
        existing_attempt: open ? { id: open.id, start_time: open.start_time } : null,
        attempt_count: done.length,
        best_score: done.length ? Math.max(...done.map((row) => row.score || 0)) : null,
        max_attempts: max,
        attempts_remaining: max > 0 ? Math.max(0, max - done.length) : null,
      },
    }
  },

  start_exam_attempt(user, args) {
    if (!user) return rpcError('UNAUTHENTICATED')
    const exam = db.exams.find((row) => row.id === args.p_exam_id)
    if (!exam || !exam.is_published) return rpcError('EXAM_NOT_AVAILABLE')
    if (!['simulation', 'practice'].includes(exam.exam_mode)) return rpcError('UNSUPPORTED_EXAM_MODE', 'P0001')
    const profile = profileOf(user.id)
    if (!profile || profile.role !== 'student') return rpcError('STUDENT_ROLE_REQUIRED')
    if (!studentHasFeature(user, exam.exam_mode)) return rpcError('FEATURE_NOT_AVAILABLE')
    if (exam.class_id && exam.class_id !== profile.class_id) return rpcError('EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS')

    const mine = db.exam_attempts.filter((row) => row.exam_id === exam.id && row.student_id === user.id)
    const open = mine.find((row) => row.status === 'in_progress')
    if (open) return { status: 200, body: { attempt_id: open.id, status: open.status, created: false } }

    const done = mine.filter((row) => ['submitted', 'graded'].includes(row.status))
    if (exam.exam_mode === 'simulation' && (exam.max_attempts ?? 1) > 0 && done.length >= (exam.max_attempts ?? 1)) {
      return rpcError('MAX_ATTEMPTS_REACHED')
    }

    const attempt = {
      id: `attempt-${randomUUID()}`, exam_id: exam.id, student_id: user.id,
      status: 'in_progress', grading_status: 'not_required', attempt_number: mine.length + 1,
      start_time: now(), submit_time: null, score: null, correct_answers: null,
      total_questions: db.exam_questions.filter((link) => link.exam_id === exam.id).length,
      created_at: now(),
    }
    db.exam_attempts.push(attempt)
    return { status: 200, body: { attempt_id: attempt.id, status: attempt.status, created: true } }
  },

  get_exam_attempt_questions(user, args) {
    if (!user) return rpcError('UNAUTHENTICATED')
    const attempt = db.exam_attempts.find((row) => row.id === args.p_attempt_id)
    if (!attempt || attempt.student_id !== user.id) return rpcError('ATTEMPT_NOT_FOUND')
    const exam = db.exams.find((row) => row.id === attempt.exam_id)
    const submitted = ['submitted', 'graded'].includes(attempt.status)
    const reveal = submitted && exam.allow_review

    const questions = questionsOfExam(exam.id).map((question) => ({
      id: question.id, content: question.content, question_type: question.question_type,
      part_number: question.part_number, order_in_part: question.order_in_part,
      tikz_image_url: question.tikz_image_url ?? null,
      // Trong giờ thi KHÔNG trả đáp án đúng, lời giải hay giải thích.
      explanation: reveal ? question.explanation ?? null : null,
      solution: reveal ? question.solution ?? null : null,
      answers: question.answers.map((answer) => ({
        id: answer.id, question_id: answer.question_id, content: answer.content,
        order_index: answer.order_index, is_correct: reveal ? answer.is_correct : false,
      })),
    }))

    const mine = db.student_answers.filter((row) => row.attempt_id === attempt.id)
    return {
      status: 200,
      body: {
        exam: { id: exam.id, title: exam.title, duration: exam.duration, subject: exam.subject, exam_mode: exam.exam_mode },
        attempt: {
          id: attempt.id, status: attempt.status, grading_status: attempt.grading_status,
          total_questions: attempt.total_questions, correct_answers: attempt.correct_answers,
          score: attempt.score, pending_grading_count: 0,
          objective_points: attempt.score, essay_points: null,
          earned_points: attempt.score, max_points: submitted ? 10 : null,
          start_time: attempt.start_time, submit_time: attempt.submit_time,
          result_released: submitted, answer_key_revealed: reveal,
        },
        questions,
        student_answers: mine,
      },
    }
  },

  submit_exam_attempt(user, args) {
    if (!user) return rpcError('UNAUTHENTICATED')
    const attempt = db.exam_attempts.find((row) => row.id === args.p_attempt_id)
    if (!attempt || attempt.student_id !== user.id) return rpcError('ATTEMPT_NOT_FOUND')
    if (attempt.status !== 'in_progress') return { status: 200, body: { already_submitted: true } }

    const questions = questionsOfExam(attempt.exam_id)
    let correct = 0
    let points = 0

    for (const sent of args.p_answers || []) {
      const question = questions.find((row) => row.id === sent.question_id)
      if (!question) continue
      let isCorrect = false
      let score = 0

      if (question.question_type === 'multiple_choice') {
        const key = question.answers.find((answer) => answer.is_correct)
        isCorrect = Boolean(sent.selected_answer) && sent.selected_answer === key?.id
        score = isCorrect ? 0.25 : 0
      } else if (question.question_type === 'true_false') {
        // Thang MOET: đúng 1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · 4 ý 1,0.
        const picks = sent.selected_answers || {}
        const hit = question.answers.filter((answer) =>
          Boolean(picks[answer.id]) === Boolean(answer.is_correct)).length
        score = { 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 }[hit] || 0
        isCorrect = hit === question.answers.length
      } else if (question.question_type === 'short_answer') {
        const key = question.answers[0]?.content || ''
        const normalize = (text) => String(text ?? '').trim().replace(',', '.')
        isCorrect = normalize(sent.text_answer) === normalize(key)
        score = isCorrect ? 0.5 : 0
      }

      if (isCorrect) correct++
      points += score
      db.student_answers.push({
        id: `sa-${randomUUID()}`, attempt_id: attempt.id, question_id: sent.question_id,
        selected_answer: sent.selected_answer ?? null, selected_answers: sent.selected_answers ?? null,
        text_answer: sent.text_answer ?? null, is_correct: isCorrect,
        score, max_score: question.question_type === 'true_false' ? 1 : question.question_type === 'short_answer' ? 0.5 : 0.25,
        grading_status: null, grading_feedback: null, grading_confidence: null,
        grading_rubric_version: null, answer_hash: null,
      })
    }

    const maxPoints = questions.reduce((sum, question) =>
      sum + (question.question_type === 'true_false' ? 1 : question.question_type === 'short_answer' ? 0.5 : 0.25), 0)
    attempt.status = 'submitted'
    attempt.grading_status = 'completed'
    attempt.submit_time = now()
    attempt.correct_answers = correct
    attempt.score = maxPoints > 0 ? Math.round((points / maxPoints) * 10 * 100) / 100 : 0
    return { status: 200, body: { attempt_id: attempt.id, score: attempt.score } }
  },
}

// ─────────────────────────────────────────────────────────────────── HTTP

function send(res, status, body, extraHeaders = {}) {
  const text = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Range',
    ...extraHeaders,
  })
  res.end(res.req.method === 'HEAD' ? undefined : text)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const params = url.searchParams
  let body = null
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  }
  if (req.method === 'OPTIONS') return send(res, 204)

  const user = authUser(req.headers)
  const log = (note) => console.log(`${req.method} ${url.pathname}${url.search ? '?' + url.searchParams.toString().slice(0, 90) : ''} → ${note}`)

  // ── GoTrue
  if (url.pathname === '/auth/v1/token') {
    const found = [...users.values()].find((item) =>
      item.email === String(body?.email || '').toLowerCase() && item.password === body?.password)
    if (!found) {
      log('400 invalid_credentials')
      return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }
    log(`200 đăng nhập ${found.email}`)
    return send(res, 200, session(found))
  }

  if (url.pathname === '/auth/v1/signup') {
    const email = String(body?.email || '').toLowerCase()
    if ([...users.values()].some((item) => item.email === email)) {
      log('422 user_already_exists')
      return send(res, 422, { code: 'user_already_exists', msg: 'User already registered', message: 'User already registered' })
    }
    const created = { id: `student-${randomUUID()}`, email, password: body?.password, user_metadata: body?.data || {} }
    users.set(created.id, created)
    log(`200 tạo tài khoản ${email}`)
    return send(res, 200, session(created))
  }

  if (url.pathname === '/auth/v1/user') {
    if (!user) { log('401'); return send(res, 401, { message: 'invalid claim', code: 401 }) }
    if (req.method === 'PUT') {
      Object.assign(user, { password: body?.password ?? user.password })
      return send(res, 200, userPayload(user))
    }
    log(`200 ${user.email}`)
    return send(res, 200, userPayload(user))
  }

  if (url.pathname === '/auth/v1/logout') { log('204'); return send(res, 204) }

  // ── PostgREST RPC
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.replace('/rest/v1/rpc/', '')
    const handler = RPC[name]
    if (!handler) {
      log(`404 RPC thiếu: ${name}`)
      return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}`, details: null, hint: null })
    }
    const result = handler(user, body || {})
    log(`${result.status} rpc ${name}`)
    return send(res, result.status, result.body)
  }

  // ── PostgREST tables
  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.replace('/rest/v1/', '')
    if (!(table in db)) {
      log(`404 bảng thiếu: ${table}`)
      return send(res, 404, { code: '42P01', message: `relation "public.${table}" does not exist`, details: null, hint: null })
    }
    const single = String(req.headers.accept || '').includes('pgrst.object')

    if (req.method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => ({
        // Mặc định của cột trong schema: tài khoản mới là `basic`, không phải `full`.
        ...(table === 'profiles' ? { access_tier: 'basic', must_change_password: false, grade: null } : {}),
        ...row,
      }))
      db[table].push(...rows)
      log(`201 insert ${rows.length} dòng vào ${table}`)
      const wants = String(req.headers.prefer || '').includes('return=representation')
      return send(res, 201, wants ? (single ? rows[0] : rows) : undefined)
    }

    if (req.method === 'PATCH') {
      const { rows } = queryRows(table, params, user)
      const ids = new Set(rows.map((row) => row.id))
      for (const row of db[table]) if (ids.has(row.id)) Object.assign(row, body)
      log(`200 update ${ids.size} dòng ở ${table}`)
      return send(res, 200, String(req.headers.prefer || '').includes('return=representation') ? [...ids].map((id) => db[table].find((row) => row.id === id)) : undefined)
    }

    const result = queryRows(table, params, user)
    if (result.error) {
      log(`403 ${result.error.message}`)
      return send(res, 403, result.error)
    }
    const { rows, total } = result
    const headers = { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${total}` }
    if (req.method === 'HEAD') { log(`200 count=${total} ${table}`); return send(res, 200, undefined, headers) }
    if (single) {
      if (rows.length !== 1) {
        log(`406 ${table} có ${rows.length} dòng`)
        return send(res, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
      }
      log(`200 ${table} 1 dòng`)
      return send(res, 200, rows[0], headers)
    }
    log(`200 ${table} ${rows.length}/${total} dòng`)
    return send(res, 200, rows, headers)
  }

  log('404')
  send(res, 404, { message: 'not found' })
})

// Điều khiển từ script quay video: đổi gói quyền, bật cờ, nạp lại dữ liệu.
server.on('request', () => {})
const control = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/tier') {
    const tier = url.searchParams.get('value') === 'full' ? 'full' : 'basic'
    for (const profile of db.profiles) if (profile.role === 'student') profile.access_tier = tier
    console.log(`[control] access_tier = ${tier} cho mọi học sinh`)
    res.writeHead(200).end(`tier=${tier}`)
    return
  }
  if (url.pathname === '/flag-simulation') {
    const on = url.searchParams.get('value') === '1'
    db.site_settings = db.site_settings.filter((row) => row.key !== 'access.feature_flags')
    db.site_settings.push({ key: 'access.feature_flags', value: { basic: { simulation: on } } })
    console.log(`[control] site_settings['access.feature_flags'].basic.simulation = ${on}`)
    res.writeHead(200).end(`flag=${on}`)
    return
  }
  res.writeHead(404).end('no')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Supabase giả: http://127.0.0.1:${PORT}`)
  console.log(`  access_tier mặc định: ${DEFAULT_TIER} · anon thấy cột grade: ${ANON_GRADE} · anon thấy đề ôn tập: ${ANON_PRACTICE}`)
})
control.listen(PORT + 1, '127.0.0.1', () => console.log(`Điều khiển: http://127.0.0.1:${PORT + 1}/tier?value=full`))
