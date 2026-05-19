import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_CLASSES = ['Toán 10', 'Toán 11', 'Toán 12', 'Tin học'] as const

interface EnrollmentPayload {
  full_name: string
  email: string
  phone: string
  class: string
  parent_name?: string
  parent_phone?: string
  user_notes?: string
}

async function insertEnrollment(payload: EnrollmentPayload) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  // service_role: chạy server-side nên an toàn, bypass RLS hoàn toàn
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!

  const res = await fetch(`${url}/rest/v1/enrollment_registrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      class: payload.class,
      status: 'new',
      parent_name: payload.parent_name || null,
      parent_phone: payload.parent_phone || null,
      user_notes: payload.user_notes || null,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[enrollments] Insert error status:', res.status, err)
    return { data: null, error: err }
  }

  const rows = await res.json()
  const inserted = Array.isArray(rows) ? rows[0] : rows
  return { data: { id: inserted?.id }, error: null }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { full_name, email, phone, class: studentClass, parent_name, parent_phone, user_notes } = body

    // Validation
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return NextResponse.json(
        { success: false, message: 'Vui lòng nhập tên đầy đủ (tối thiểu 2 ký tự).' },
        { status: 400 }
      )
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { success: false, message: 'Vui lòng nhập email hợp lệ.' },
        { status: 400 }
      )
    }

    if (!phone || typeof phone !== 'string' || !/^[0-9]{9,11}$/.test(phone.trim().replace(/\s/g, ''))) {
      return NextResponse.json(
        { success: false, message: 'Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).' },
        { status: 400 }
      )
    }

    if (!studentClass || !ALLOWED_CLASSES.includes(studentClass as any)) {
      return NextResponse.json(
        { success: false, message: 'Vui lòng chọn lớp học.' },
        { status: 400 }
      )
    }

    // Validate parent_phone if provided
    if (parent_phone && typeof parent_phone === 'string' && parent_phone.trim()) {
      const cleanParentPhone = parent_phone.trim().replace(/\s/g, '')
      if (!/^[0-9]{9,11}$/.test(cleanParentPhone)) {
        return NextResponse.json(
          { success: false, message: 'Số điện thoại phụ huynh không hợp lệ (9–11 chữ số).' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await insertEnrollment({
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim().replace(/\s/g, ''),
      class: studentClass,
      parent_name: parent_name?.trim() || undefined,
      parent_phone: parent_phone?.trim().replace(/\s/g, '') || undefined,
      user_notes: user_notes?.trim() || undefined,
    })

    if (error) {
      console.error('[enrollments] DB error:', error)
      return NextResponse.json(
        { success: false, message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Đơn đăng ký đã được gửi thành công! Chúng tôi sẽ liên hệ với bạn sớm nhất.',
      data: { id: data?.id },
    })
  } catch (err) {
    console.error('[enrollments] Unexpected error:', err)
    return NextResponse.json(
      { success: false, message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Method not allowed' }, { status: 405 })
}
