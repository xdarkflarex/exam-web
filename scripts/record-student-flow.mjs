/**
 * Quay lại HÀNH TRÌNH CỦA MỘT NGƯỜI NGOÀI: vào trang chủ → đăng ký → đăng nhập
 * → tìm đề → bị chặn vì gói quyền → được mở → thi → nộp → xem điểm.
 *
 * Quay bằng CDP Page.startScreencast rồi ghép bằng ffmpeg hệ thống: bản ghi
 * video sẵn có của Playwright đòi đúng bản ffmpeg đi kèm, mà bản đó không có
 * trong container này.
 *
 * CÁCH CHẠY (ba cửa sổ, hoặc ba lệnh nền):
 *
 *   node scripts/mock-supabase.mjs                      # backend giả, cổng 54321
 *   npm run dev -- -p 3100                              # app, trỏ .env.local vào mock
 *   node scripts/record-student-flow.mjs <thư-mục-ra>
 *   cd <thư-mục-ra>/frames && ffmpeg -f concat -safe 0 -i list.txt \
 *     -vf "fps=12,scale=1280:-2,format=yuv420p" -c:v libx264 -crf 26 ../video.mp4
 *
 * `.env.local` khi quay:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-mock
 *
 * KHÔNG trỏ vào Primary để quay. Kịch bản này TẠO TÀI KHOẢN và NỘP BÀI thật;
 * chạy lên database thật là để lại rác trong hồ sơ học sinh và bảng lượt thi.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Gốc kho code, suy từ vị trí file này — không chôn đường dẫn tuyệt đối. */
const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

const OUT = process.argv[2] || join(REPO, '.quay-hanh-trinh')
const BASE = process.env.APP_URL || 'http://127.0.0.1:3100'
const CONTROL = process.env.MOCK_CONTROL_URL || 'http://127.0.0.1:54322'
const FRAMES = join(OUT, 'frames')
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const EMAIL = `hocsinh.moi.${Date.now().toString().slice(-6)}@example.com`
const PASSWORD = 'MatKhau123!'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  locale: 'vi-VN',
})
const page = await context.newPage()

/*
  MathJax tải từ CDN lúc chạy, mà container này không ra được Internet — không
  chặn thì cả video hiện công thức dạng `$...$` thô và người xem sẽ tưởng sản
  phẩm hỏng. Trả về đúng bản MathJax 4 đã nằm sẵn trong `node_modules`
  (`@mathjax/mathjax-newcm-font` — bản gói kèm font), nên không cần mạng và
  cũng không đụng một dòng nào của app.
*/
const NODE_MODULES = join(REPO, 'node_modules')
const MATHJAX_MAIN = `${NODE_MODULES}/@mathjax/mathjax-newcm-font/tex-mml-chtml-mathjax-newcm.js`
await context.route('**/cdn.jsdelivr.net/**', (route) => {
  const url = route.request().url()
  const tail = url.split('/npm/')[1]?.split('?')[0] || ''

  if (tail.startsWith('mathjax@4/tex-mml-chtml.js')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', path: MATHJAX_MAIN })
  }
  // MathJax 4 tải thêm worker đọc-thành-tiếng và bảng mathmaps. THIẾU WORKER
  // LÀ TYPESET DỪNG SAU PHẦN TỬ ĐẦU TIÊN — lượt quay đầu dính đúng bẫy này và
  // cả video hiện `$...$` thô, trông y như sản phẩm hỏng.
  if (tail.startsWith('mathjax@4/')) {
    const file = `${NODE_MODULES}/@mathjax/src/bundle/${tail.replace('mathjax@4/', '')}`
    if (existsSync(file)) return route.fulfill({ status: 200, path: file })
  }
  if (tail.startsWith('@mathjax/mathjax-newcm-font/')) {
    const file = `${NODE_MODULES}/${tail}`
    if (existsSync(file)) return route.fulfill({ status: 200, path: file })
  }
  return route.fulfill({ status: 404, body: '' })
})

// ── ghi hình
const frames = []
const cdp = await context.newCDPSession(page)
cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
  frames.push({ at: Date.now(), data })
  try { await cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* trang đã đóng */ }
})

/** Lời dẫn hiện trên video — để người xem biết đang ở bước nào. */
async function caption(text) {
  console.log(`▶ ${text}`)
  await page.evaluate((message) => {
    let bar = document.getElementById('__quay_caption')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = '__quay_caption'
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
        'background:rgba(15,23,42,.92)', 'color:#fff', 'font:600 16px/1.5 system-ui,sans-serif',
        'padding:10px 18px', 'letter-spacing:.2px', 'pointer-events:none',
      ].join(';')
      document.body.appendChild(bar)
    }
    bar.textContent = message
  }, text).catch(() => {})
}

async function hideDevOverlay() {
  await page.addStyleTag({
    content: 'nextjs-portal,[data-nextjs-toast]{display:none!important}',
  }).catch(() => {})
}

const wait = (ms) => page.waitForTimeout(ms)

async function go(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
}

async function control(path) {
  await fetch(`${CONTROL}${path}`).catch(() => {})
}

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 })

try {
  // Trả cờ quyền về đúng trạng thái production: gói `basic` CHƯA mở thi thử.
  // Không reset thì lần quay sau thừa hưởng cờ của lần trước và cảnh "bị chặn"
  // biến mất — đúng cái bẫy đã gặp ở lượt quay thứ hai.
  await control('/flag-simulation?value=0')

  // ──────────────────────────────────────────── 1. Trang chủ, mắt người lạ
  await go('/')
  await caption('1 · Người lạ mở trang chủ minhmath')
  await wait(2500)

  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }))
  await wait(1500)
  await caption('2 · Cuộn xuống tìm đề thi')
  await page.locator('#exams').scrollIntoViewIfNeeded()
  await wait(2600)

  await caption('3 · Khối đề: không có lớp, không có loại đề — 5 đề trông như nhau')
  await wait(3200)

  // ──────────────────────────────────────────── 2. Bấm vào đề
  await caption('4 · Bấm "Làm bài ngay"')
  await page.getByRole('link', { name: /Làm bài ngay/i }).first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
  await caption('5 · Chưa đăng nhập → bị đẩy sang trang đăng nhập, KHÔNG nhớ đề vừa bấm')
  await wait(3000)

  // ──────────────────────────────────────────── 3. Đăng ký
  await caption('6 · Chưa có tài khoản → bấm "Đăng ký"')
  await page.locator('a[href="/signup"]').first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
  await wait(1200)

  await caption('7 · Điền form đăng ký')
  await page.locator('input[placeholder="Nhập email của bạn"]').fill(EMAIL)
  await wait(400)
  await page.locator('input[placeholder="Nhập mật khẩu"]').fill(PASSWORD)
  await wait(300)
  await page.locator('input[placeholder="Nhập lại mật khẩu"]').fill(PASSWORD)
  await wait(300)
  await page.locator('input[placeholder="Nhập họ tên đầy đủ"]').fill('Trần Thị Mai')
  await wait(300)
  await page.locator('input[placeholder="VD: THPT Nguyễn Du"]').fill('THPT Hòn Gai')
  await wait(300)
  await page.locator('select').first().selectOption('12')
  await wait(900)

  await caption('8 · Tạo tài khoản')
  await page.getByRole('button', { name: /Tạo tài khoản|Đăng ký/i }).first().click()
  await wait(3500)
  await hideDevOverlay()
  await wait(1500)

  // ──────────────────────────────────────────── 4. Đăng nhập
  const emailBox = page.locator('input[placeholder="Nhập email của bạn"]')
  if (await emailBox.count()) {
    await caption('9 · Đăng nhập bằng tài khoản vừa tạo')
    await emailBox.fill(EMAIL)
    await wait(400)
    await page.locator('input[placeholder="••••••••"]').fill(PASSWORD)
    await wait(600)
    await page.getByRole('button', { name: /Đăng nhập/i }).last().click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await wait(3000)
    await hideDevOverlay()
  } else {
    await caption(`9 · Đăng ký xong, hệ thống đưa thẳng vào ${new URL(page.url()).pathname}`)
    await wait(3000)
  }
  await caption('10 · Khu học sinh')
  await wait(2500)

  // ──────────────────────────────────────────── 5. Danh sách đề thi thử
  await go('/student/exams')
  await caption('11 · Danh sách đề thi thử')
  await wait(3000)

  await caption('12 · Chọn đề ngắn 20 phút để làm thử')
  const start = page.getByRole('link', { name: /^(Bắt đầu|Thi lại)$/ }).nth(1)
  await start.scrollIntoViewIfNeeded()
  await wait(900)
  await start.click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
  await caption('13 · Trang chuẩn bị — mọi thứ vẫn bình thường')
  await wait(3000)

  // ──────────────────────────────────────────── 6. Cổng chặn gói quyền
  await caption('14 · Bấm "Bắt đầu thi"')
  await page.getByRole('button', { name: /Bắt đầu thi/i }).first().click()
  await wait(3000)
  await hideDevOverlay()
  await caption('15 · BỊ CHẶN: tài khoản mới mặc định là gói "basic", chưa mở thi thử')
  await wait(4500)

  // ──────────────────────────────────────────── 7. Thầy mở quyền
  await control('/flag-simulation?value=1')
  await caption('16 · Thầy bật cờ "simulation" cho gói basic ở /admin/access')
  await wait(2500)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
  await caption('17 · Thử lại: bấm "Bắt đầu thi"')
  await wait(1500)
  await page.getByRole('button', { name: /Bắt đầu thi/i }).first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await wait(3500)
  await hideDevOverlay()

  // ──────────────────────────────────────────── 8. Làm bài
  await caption('18 · Vào phòng thi — đồng hồ chạy, câu hỏi chia ba phần')
  await wait(3000)

  await caption('19 · Phần 1: chọn đáp án trắc nghiệm')
  // `:visible` là bắt buộc: panel của phần không mở vẫn nằm trong DOM.
  await page.locator('button[aria-pressed]:visible').first().click()
  await wait(2000)

  const tabs = page.locator('[role="tablist"]:visible button')
  if (await tabs.count() > 1) {
    await caption('20 · Phần 2: câu Đúng/Sai, bốn ý')
    await tabs.nth(1).click()
    await wait(1600)
    const tf = page.locator('button[aria-pressed]:visible')
    const n = await tf.count()
    // Mỗi ý có hai nút Đúng/Sai cạnh nhau — bấm nút chẵn là chọn "Đúng".
    for (let i = 0; i < Math.min(n, 8); i += 2) {
      await tf.nth(i).click()
      await wait(450)
    }
    await wait(1200)
  }

  if (await tabs.count() > 2) {
    await caption('21 · Phần 3: trả lời ngắn — gõ số')
    await tabs.nth(2).click()
    await wait(1500)
    const box = page.locator('input[placeholder="Nhập đáp án..."]:visible').first()
    await box.click()
    await box.type('4', { delay: 220 })
    await wait(2000)
  }

  // ──────────────────────────────────────────── 9. F5 — tính năng vừa làm
  await caption('22 · Thử F5 giữa giờ thi (tính năng lưu nháp vừa làm hôm nay)')
  await wait(1800)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await hideDevOverlay()
  await wait(2500)
  await caption('23 · Bài làm được khôi phục nguyên vẹn — trước đây là mất sạch')
  await wait(4000)

  // ──────────────────────────────────────────── 10. Nộp bài
  await caption('24 · Nộp bài')
  await page.locator('button:visible').filter({ hasText: /^Nộp bài$/ }).first().click()
  await wait(1800)
  await hideDevOverlay()
  await caption('25 · Hỏi lại trước khi nộp')
  await wait(2200)
  await page.locator('button:visible').filter({ hasText: /^Nộp bài$/ }).last().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await wait(4000)
  await hideDevOverlay()

  // ──────────────────────────────────────────── 11. Kết quả
  await caption('26 · Trang kết quả: điểm, số câu đúng, lời giải từng câu')
  await wait(3500)
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }))
  await wait(3000)
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'smooth' }))
  await wait(3000)
  await caption('Hết — toàn bộ hành trình của một người ngoài')
  await wait(2500)
} catch (error) {
  console.error('LỖI giữa chừng:', error.message)
  await caption(`Dừng vì lỗi: ${error.message.slice(0, 110)}`)
  await wait(2000)
  await page.screenshot({ path: join(OUT, 'loi.png') }).catch(() => {})
}

await cdp.send('Page.stopScreencast').catch(() => {})
await wait(300)

// ── ghép frame thành video
let index = 0
const list = []
for (let i = 0; i < frames.length; i++) {
  const name = `f${String(index++).padStart(5, '0')}.jpg`
  writeFileSync(join(FRAMES, name), Buffer.from(frames[i].data, 'base64'))
  const next = frames[i + 1]?.at ?? frames[i].at + 400
  const seconds = Math.max(0.04, Math.min(3, (next - frames[i].at) / 1000))
  list.push(`file '${name}'`, `duration ${seconds.toFixed(3)}`)
}
if (frames.length) list.push(`file 'f${String(index - 1).padStart(5, '0')}.jpg'`)
writeFileSync(join(FRAMES, 'list.txt'), list.join('\n'))
console.log(`\n${frames.length} khung hình · ${((frames.at(-1)?.at - frames[0]?.at) / 1000 || 0).toFixed(1)} giây`)
console.log(`Tài khoản thử: ${EMAIL}`)

await context.close()
await browser.close()
