'use client'

import { useEffect, useId, useRef, type CSSProperties } from 'react'

/**
 * Nền động "chòm kiến thức": sáu mô hình toán THPT, mỗi cái kèm một tình huống
 * thực tế, trôi chậm và nối với nhau bằng đường mờ.
 *
 *   Parabol         ↔ quỹ đạo ném bóng        (Lớp 10)
 *   Vectơ           ↔ hợp lực                 (Lớp 10)
 *   Hàm sin         ↔ dao động, đu quay       (Lớp 11)
 *   Phân phối chuẩn ↔ phổ điểm thi            (Lớp 11–12)
 *   Hệ trục Oxyz    ↔ toạ độ trong không gian (Lớp 12)
 *   Tích phân       ↔ quãng đường từ vận tốc  (Lớp 12)
 *
 * Mỗi chuyển động đều NÓI ĐÚNG TOÁN, không phải hoạ tiết lắc lư: bóng chạy trên
 * đúng một cung parabol (Bézier bậc hai), điểm quay trên đường tròn đồng pha với
 * sóng sin, cột tổng Riemann hiện dần từ trái sang, vectơ tổng được vẽ theo quy
 * tắc hình bình hành. Người xem là giáo viên và học sinh Toán — hình sai sẽ bị
 * nhìn ra.
 *
 * VÌ SAO SVG + CSS, KHÔNG PHẢI three.js HAY canvas
 *  - Không thêm dependency, không thêm vòng `requestAnimationFrame` nào.
 *  - Mọi animation là CSS, nên lưới `prefers-reduced-motion` ở cuối
 *    `globals.css` tắt được hết (NT6). SMIL (`<animate>`) bị cấm ở đây vì lưới
 *    đó không với tới nó.
 *  - Chỉ animate `transform`, `opacity`, `stroke-dashoffset` (NT8) — không cái
 *    nào gây layout shift.
 *  - Nét vẽ, không tô gradient: trang đã có bề mặt gradient riêng (NT3).
 *
 * TRẠNG THÁI TĨNH LÀ MỘT BỨC HÌNH HOÀN CHỈNH. Style gốc của mọi phần tử là
 * trạng thái "đã xong" (bóng ở đỉnh, vectơ tổng đã vẽ, đủ cột Riemann). Khi
 * giảm chuyển động, lưới an toàn cho animation chạy 0,01ms rồi trả về style
 * gốc — nên người bật giảm chuyển động vẫn thấy một hình trọn vẹn, không phải
 * hình dang dở. Vì vậy các animation lặp KHÔNG dùng `animation-fill-mode`.
 *
 * Tự dừng khi ra khỏi khung nhìn (IntersectionObserver → `data-paused`), để
 * cuộn xuống dưới rồi thì nền ở hero không còn vẽ lại nữa.
 *
 * Chỉ dùng cho trang chủ và trang "Hôm nay" của học sinh. KHÔNG BAO GIỜ đặt vào
 * màn làm bài (AGENTS.md §6).
 */

type Variant = 'hero' | 'dashboard'
type NodeKind = 'parabola' | 'vector' | 'sine' | 'normal' | 'oxyz' | 'integral'

// ─── Hình học tính sẵn ──────────────────────────────────────────────────────
// Làm tròn 1 chữ số thập phân: chuỗi `d` giống hệt nhau ở server và client,
// không lệch hydrate vì sai số dấu phẩy động.

type Pt = readonly [number, number]

const r1 = (n: number) => Math.round(n * 10) / 10

function pathThrough(points: readonly Pt[]): string {
  return points.map(([x, y], n) => `${n === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`).join(' ')
}

function sample(from: number, to: number, step: number, f: (x: number) => number): Pt[] {
  const out: Pt[] = []
  for (let x = from; x <= to + 1e-9; x += step) out.push([x, f(x)])
  return out
}

/** Đầu mũi tên hình chữ V tại `tip`, hướng từ `from` tới `tip`. */
function arrowHead(tip: Pt, from: Pt, len = 8, half = 4.5): string {
  const dx = tip[0] - from[0]
  const dy = tip[1] - from[1]
  const d = Math.hypot(dx, dy)
  const ux = dx / d
  const uy = dy / d
  const bx = tip[0] - ux * len
  const by = tip[1] - uy * len
  return pathThrough([[bx - uy * half, by + ux * half], tip, [bx + uy * half, by - ux * half]])
}

/*
  SÓNG SIN ĐỒNG PHA VỚI ĐƯỜNG TRÒN.
  Sóng y = −5 − 20·sin(2π(x+30)/50) trượt sang trái đúng một chu kì (50) trong
  cùng thời gian điểm trên đường tròn quay một vòng ngược chiều kim đồng hồ. Tại
  mép trái cửa sổ (x = −30) giá trị sóng luôn bằng tung độ của điểm quay — đúng
  hình ảnh sách giáo khoa dùng để định nghĩa sin. Hai thời lượng phải bằng nhau
  (`mc-spin` và `mc-wave` cùng 6s trong globals.css).
*/
const WAVE_PERIOD = 50
const WAVE_PATH = pathThrough(
  sample(-30, 85 + WAVE_PERIOD, 2.5, (x) => -5 - 20 * Math.sin((2 * Math.PI * (x + 30)) / WAVE_PERIOD)),
)

/* Phân phối chuẩn, σ = 32 đơn vị. Cột thấp hơn đường cong 8% để đường cong
   luôn nằm trên, đọc ra được là "đường bao". */
const BELL_SIGMA = 32
const bell = (x: number) => 68 * Math.exp(-(x * x) / (2 * BELL_SIGMA * BELL_SIGMA))
const BELL_PATH = pathThrough(sample(-80, 80, 4, (x) => 25 - bell(x)))
const BELL_BARS = Array.from({ length: 9 }, (_, n) => {
  const xc = -64 + n * 16
  return { x: xc - 7, h: r1(bell(xc) * 0.92) }
})

/* Vận tốc tăng rồi bão hoà — xe tăng tốc. Tổng Riemann lấy giá trị ở TRUNG
   ĐIỂM mỗi đoạn, nên cột vừa khít đường cong chứ không lệch hẳn một phía. */
const velocity = (x: number) => 12 + 55 * (1 - Math.exp(-(x + 70) / 50))
const VELOCITY_PATH = pathThrough(sample(-70, 70, 5, (x) => 30 - velocity(x)))
const RIEMANN = Array.from({ length: 7 }, (_, n) => {
  const x = -70 + n * 20
  return { x, h: r1(velocity(x + 10)) }
})

/* Hệ trục Oxyz phối cảnh cavalier: Oy nằm ngang, Oz thẳng đứng, Ox chéo xuống.
   M có hình chiếu M' lên (Oxy), rồi từ M' chiếu tiếp lên Ox và Oy; nối M với
   hình chiếu trên Oz. Bốn đoạn đó song song đúng với các trục trong phối cảnh. */
const O: Pt = [-10, 10]
const OX_END: Pt = [-60, 45]
const OY_END: Pt = [70, 10]
const OZ_END: Pt = [-10, -62]
const M: Pt = [20, -17.5]
const M_FLOOR: Pt = [20, 27.5]
const M_ON_OY: Pt = [35, 10]
const M_ON_OX: Pt = [-25, 27.5]
const M_ON_OZ: Pt = [-10, -35]

/* Quy tắc hình bình hành: F = F₁ + F₂ là đường chéo xuất phát từ gốc chung. */
const F_ORIGIN: Pt = [-55, 22]
const F1: Pt = [40, 22]
const F2: Pt = [-30, -38]
const F_SUM: Pt = [65, -38]

// ─── Sáu mô hình ────────────────────────────────────────────────────────────
// Toạ độ cục bộ trong viewBox −100 −75 200 150.

const indexVar = (n: number) => ({ '--i': n }) as CSSProperties

function Parabola() {
  const d = 'M-70 30 Q0 -90 70 30'
  return (
    <>
      <path className="mc-line mc-soft" d="M-82 30 H82" />
      <path className="mc-line mc-soft mc-dash" d="M0 -30 V30" />
      <path className="mc-line mc-dash" d={d} />
      {/* Bóng: một nét dài gần 0 với đầu tròn, trượt dọc đúng cung parabol. */}
      <path className="mc-ball" d={d} pathLength={100} />
      <text className="mc-formula" x="0" y="50">y = ax² + bx + c</text>
      <text className="mc-caption" x="0" y="66">quỹ đạo ném bóng</text>
    </>
  )
}

function Vector() {
  return (
    <>
      <path className="mc-line mc-soft mc-dash" d={pathThrough([F1, F_SUM, F2])} />
      <path className="mc-line" d={pathThrough([F_ORIGIN, F1])} />
      <path className="mc-line" d={arrowHead(F1, F_ORIGIN)} />
      <path className="mc-line" d={pathThrough([F_ORIGIN, F2])} />
      <path className="mc-line" d={arrowHead(F2, F_ORIGIN)} />
      <path className="mc-line mc-accent mc-draw" d={pathThrough([F_ORIGIN, F_SUM])} pathLength={100} />
      <path className="mc-line mc-accent mc-draw-head" d={arrowHead(F_SUM, F_ORIGIN, 9, 5)} />
      <text className="mc-label" x="-8" y="37">F₁</text>
      <text className="mc-label" x="-62" y="-10">F₂</text>
      <text className="mc-formula" x="0" y="56">F = F₁ + F₂</text>
      <text className="mc-caption" x="0" y="70">hợp lực</text>
    </>
  )
}

function Sine({ clipId }: { clipId: string }) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x="-30" y="-32" width="115" height="54" />
        </clipPath>
      </defs>
      <path className="mc-line mc-soft" d="M-86 -5 H88" />
      <circle className="mc-line" cx="-62" cy="-5" r="20" />
      <g transform="translate(-62 -5)">
        <g className="mc-spin">
          <path className="mc-line mc-accent" d="M0 0 H20" />
          <circle className="mc-dot" cx="20" cy="0" r="3.5" />
        </g>
      </g>
      <g clipPath={`url(#${clipId})`}>
        <path className="mc-line mc-accent mc-wave" d={WAVE_PATH} />
      </g>
      <text className="mc-formula" x="0" y="45">y = sin x</text>
      <text className="mc-caption" x="0" y="61">dao động · đu quay</text>
    </>
  )
}

function Normal() {
  return (
    <>
      {BELL_BARS.map((bar, n) => (
        <g key={n} transform={`translate(${bar.x} 25)`}>
          <rect className="mc-bar mc-cell" style={indexVar(n)} x="0" y={-bar.h} width="14" height={bar.h} />
        </g>
      ))}
      <path className="mc-line mc-soft" d="M-82 25 H82" />
      <path className="mc-line mc-warm" d={BELL_PATH} />
      <text className="mc-formula" x="0" y="45">N(μ; σ²)</text>
      <text className="mc-caption" x="0" y="61">phổ điểm thi</text>
    </>
  )
}

function Oxyz() {
  const projections = [
    [M, M_FLOOR],
    [M_FLOOR, M_ON_OY],
    [M_FLOOR, M_ON_OX],
    [M, M_ON_OZ],
  ] as const
  return (
    <>
      {[OX_END, OY_END, OZ_END].map((end, n) => (
        <g key={n}>
          <path className="mc-line" d={pathThrough([O, end])} />
          <path className="mc-line" d={arrowHead(end, O, 7, 4)} />
        </g>
      ))}
      {projections.map(([a, b], n) => (
        <path key={n} className="mc-line mc-dash mc-pulse" style={indexVar(n)} d={pathThrough([a, b])} />
      ))}
      <g transform={`translate(${M[0]} ${M[1]})`}>
        <circle className="mc-line mc-accent mc-ping" r="4" />
        <circle className="mc-dot" r="3.5" />
      </g>
      <text className="mc-label" x="-73" y="44">x</text>
      <text className="mc-label" x="74" y="14">y</text>
      <text className="mc-label" x="-5" y="-60">z</text>
      <text className="mc-label" x="-21" y="21">O</text>
      <text className="mc-label" x="27" y="-21">M</text>
      <text className="mc-formula" x="0" y="58">M(x; y; z)</text>
      <text className="mc-caption" x="0" y="72">toạ độ trong không gian</text>
    </>
  )
}

function Integral() {
  return (
    <>
      {RIEMANN.map((cell, n) => (
        <g key={n} transform={`translate(${cell.x} 30)`}>
          <rect className="mc-riemann mc-cell" style={indexVar(n)} x="0" y={-cell.h} width="20" height={cell.h} />
        </g>
      ))}
      <path className="mc-line" d="M-78 30 H80" />
      <path className="mc-line" d={arrowHead([84, 30], [-78, 30], 7, 4)} />
      <path className="mc-line" d="M-70 38 V-52" />
      <path className="mc-line" d={arrowHead([-70, -56], [-70, 38], 7, 4)} />
      <path className="mc-line mc-warm" d={VELOCITY_PATH} />
      <text className="mc-label" x="84" y="44">t</text>
      <text className="mc-label" x="-86" y="-50">v</text>
      <text className="mc-formula" x="0" y="52">s = ∫ v(t) dt</text>
      <text className="mc-caption" x="0" y="68">quãng đường từ vận tốc</text>
    </>
  )
}

// ─── Bố cục ─────────────────────────────────────────────────────────────────

interface NodePlacement {
  kind: NodeKind
  /** Vị trí TÂM + bề rộng theo breakpoint. `.mc-node` tự dịch −50% −50%. */
  className: string
  /** [chu kì, độ trễ] giây. Mỗi hình một nhịp để không bao giờ nhúc nhích cùng lúc. */
  drift: readonly [number, number]
}

/*
  HERO. Đo ở 1440px ngày 2026-09-13: hero cao 519px, tiêu đề chiếm 281–1159px,
  hàng nút 468–1278px — mỗi bên còn khoảng 260px trống. Nên:

  - Từ `xl` (≥1280px): sáu hình, bốn cái dạt hai mép, hai cái nhỏ nằm dưới hàng
    nút, cộng đường nối.
  - Dưới `xl`: chữ chiếm gần hết chiều ngang, không còn mép trống. Chỉ bốn hình
    nhỏ nép vào bốn góc — đúng dải đệm `py-20`/`sm:py-28` phía trên huy hiệu và
    phía dưới hàng nút. Không chữ, không đường nối.
*/
const HERO_NODES: readonly NodePlacement[] = [
  {
    kind: 'parabola',
    className:
      'left-[3.75rem] top-[calc(100%-2.5rem)] w-24 sm:left-24 sm:top-[calc(100%-3.5rem)] sm:w-32 ' +
      'xl:left-[9%] xl:top-[30%] xl:w-[clamp(150px,12vw,210px)]',
    drift: [23, -4],
  },
  {
    kind: 'integral',
    className: 'hidden xl:block xl:left-[12%] xl:top-[76%] xl:w-[clamp(150px,12vw,210px)]',
    drift: [27, -11],
  },
  {
    kind: 'oxyz',
    className:
      'left-[calc(100%-3.75rem)] top-10 w-24 sm:left-[calc(100%-6rem)] sm:top-14 sm:w-32 ' +
      'xl:left-[91%] xl:top-[30%] xl:w-[clamp(150px,12vw,210px)]',
    drift: [25, -7],
  },
  {
    kind: 'sine',
    className:
      'left-[3.75rem] top-10 w-24 sm:left-24 sm:top-14 sm:w-32 ' +
      'xl:left-[88%] xl:top-[76%] xl:w-[clamp(150px,12vw,210px)]',
    drift: [21, -15],
  },
  {
    kind: 'vector',
    className: 'hidden xl:block xl:left-[30%] xl:top-[88%] xl:w-[clamp(120px,9vw,160px)]',
    drift: [19, -2],
  },
  {
    kind: 'normal',
    className:
      'left-[calc(100%-3.75rem)] top-[calc(100%-2.5rem)] w-24 sm:left-[calc(100%-6rem)] sm:top-[calc(100%-3.5rem)] sm:w-32 ' +
      'xl:left-[70%] xl:top-[88%] xl:w-[clamp(120px,9vw,160px)]',
    drift: [24, -9],
  },
]

/*
  Đường nối, trong hệ phần trăm của hero (viewBox 0 0 100 100, kéo giãn theo
  khung). Mỗi đoạn đi từ MÉP hình này tới MÉP hình kia chứ không từ tâm, để
  không gạch ngang qua nét vẽ. `non-scaling-stroke` giữ nét mảnh đều dù khung
  bị kéo giãn không đều hai chiều.
*/
const HERO_LINKS = [
  'M9 43 C7.5 50 10.5 56 12 63', // parabol → tích phân
  'M91 43 C92.5 50 89.5 56 88 63', // Oxyz → sin
  'M17.5 83 Q21 89 25.5 89', // tích phân → vectơ
  'M34.5 90 Q50 99 65.5 90', // vectơ → chuẩn, vòng dưới hàng nút
  'M74.5 89 Q79 89 82.5 83', // chuẩn → sin
  'M15 24 Q50 -4 85 24', // parabol → Oxyz, vòng trên huy hiệu
] as const

/*
  "HÔM NAY". Trang vào mỗi ngày, không phải trang gây ấn tượng lần đầu
  (VISUAL_MOTION_PLAN.md mục 8) — nên chỉ hai hình, không chữ, không đường nối,
  mờ hơn và trôi chậm hơn. Điện thoại: một hình ở góc phải trên, chỗ duy nhất
  không đè lên số liệu. Máy tính: khoảng trống giữa cột chữ và cột số liệu.
*/
const DASHBOARD_NODES: readonly NodePlacement[] = [
  {
    kind: 'oxyz',
    className: 'left-[calc(100%-2.5rem)] top-6 w-16 lg:left-[54%] lg:top-[34%] lg:w-32',
    drift: [31, -6],
  },
  {
    kind: 'sine',
    className: 'hidden lg:block lg:left-[64%] lg:top-[70%] lg:w-32',
    drift: [34, -18],
  },
]

function Drawing({ kind, clipId }: { kind: NodeKind; clipId: string }) {
  switch (kind) {
    case 'parabola':
      return <Parabola />
    case 'vector':
      return <Vector />
    case 'sine':
      return <Sine clipId={clipId} />
    case 'normal':
      return <Normal />
    case 'oxyz':
      return <Oxyz />
    case 'integral':
      return <Integral />
  }
}

interface MathConstellationProps {
  variant?: Variant
  className?: string
}

export default function MathConstellation({ variant = 'hero', className = '' }: MathConstellationProps) {
  const ref = useRef<HTMLDivElement>(null)
  // `useId` của React 19 sinh ký tự không dùng được trong `url(#…)`; lọc lại.
  const idBase = `mc${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const nodes = variant === 'hero' ? HERO_NODES : DASHBOARD_NODES

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // Giảm chuyển động thì đã không có gì chạy, khỏi quan sát.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Gắn thẳng thuộc tính lên DOM thay vì qua state: dừng/chạy một lớp nền
    // không đáng một lần render lại.
    const observer = new IntersectionObserver(([entry]) => {
      el.toggleAttribute('data-paused', !entry.isIntersecting)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-variant={variant}
      className={`mc-root pointer-events-none select-none ${className}`}
    >
      {variant === 'hero' && (
        <svg
          className="mc-links absolute inset-0 hidden h-full w-full xl:block"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {HERO_LINKS.map((d) => (
            <path key={d} className="mc-line mc-soft mc-dash" d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}

      {nodes.map((node, n) => (
        <div
          key={node.kind}
          className={`mc-node ${node.className}`}
          style={{ '--mc-drift-dur': `${node.drift[0]}s`, '--mc-drift-delay': `${node.drift[1]}s` } as CSSProperties}
        >
          <svg viewBox="-100 -75 200 150">
            <Drawing kind={node.kind} clipId={`${idBase}-${n}`} />
          </svg>
        </div>
      ))}
    </div>
  )
}
