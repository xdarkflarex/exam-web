import { MIN_EVIDENCE } from '@/lib/analytics/knowledge-mastery'
import { polygonPoints, radarPoint, radarPolygon } from './geometry'

/**
 * Radar năng lực: mỗi trục một chuyên đề, bán kính là tỉ lệ đúng.
 *
 * SVG thuần, không thư viện chart — cùng lý do đã ghi ở `ProgressRing.tsx`:
 * vài hình không đủ để biện minh cho ~100KB của recharts. Không có `'use
 * client'`, nên component này render ở server và không thêm JS nào cho client.
 *
 * BẤT BIẾN QUAN TRỌNG NHẤT: TRỤC THIẾU BẰNG CHỨNG PHẢI TRÔNG KHÁC HẲN.
 *
 * Một đa giác đặc, liền mạch nói với người đọc rằng "đây là năng lực của em,
 * đo xong rồi". Nếu một trục chỉ có 1–2 câu thì điều đó KHÔNG đúng, mà hình vẽ
 * lại không hề phân biệt. Đây chính là chỗ các trang khác hay đánh lừa: vẽ
 * radar 5 trục từ một bài 15 câu chia cho 3 môn, tức khoảng 1 câu mỗi trục.
 *
 * Nên ở đây:
 *   - Trục có `total >= MIN_EVIDENCE` (4): điểm đặc, viền liền.
 *   - Trục dưới ngưỡng: điểm rỗng, và KHÔNG được nối vào đa giác đặc — phần
 *     tô chỉ đi qua các trục đủ bằng chứng, còn trục thiếu bị kéo về tâm bằng
 *     đường đứt để mắt thấy ngay là "chưa đo được", không phải "làm sai hết".
 */

export interface RadarAxis {
  /** Tên chuyên đề. Hiện ở BẢNG dưới hình, trên hình chỉ có số thứ tự. */
  label: string
  /** Số câu đúng. */
  correct: number
  /** Tổng số câu đã làm ở trục này — cũng là lượng bằng chứng. */
  total: number
}

interface Props {
  axes: RadarAxis[]
  size?: number
  /** Màu đường + vùng tô. Mặc định teal của hệ thống. */
  tone?: string
  /** Bắt buộc: mô tả cho trình đọc màn hình. */
  ariaLabel: string
}

/** Số vòng lưới nền. 4 vòng = mốc 25/50/75/100%. */
const RINGS = 4

/**
 * Dưới 3 trục thì không vẽ được đa giác có nghĩa (2 trục ra một đoạn thẳng).
 * Chỗ dùng phải tự lo trường hợp này, nên component chỉ trả về `null`.
 */
const MIN_AXES = 3

export default function RadarChart({
  axes,
  size = 260,
  tone = '#0d9488',
  ariaLabel,
}: Props) {
  if (axes.length < MIN_AXES) return null

  const center = { x: size / 2, y: size / 2 }
  /*
    Vành ngoài chỉ chừa cho SỐ THỨ TỰ, không phải cho tên chuyên đề.

    Đo lúc chạy 2026-08-25: đặt tên đầy đủ quanh hình thì 3/8 nhãn tràn khỏi
    viewBox tới 53px — tên chuyên đề tiếng Việt ở 11px rộng khoảng 100px, trong
    khi vành ngoài chỉ có 46px. Cắt ngắn cho vừa thì "Toạ độ trong không gian"
    thành "Toạ độ tron…", đọc không ra.

    Nên trên hình chỉ đánh số, tên đầy đủ nằm ở bảng ngay dưới. Không mất thông
    tin, và bỏ hẳn được cả lớp lỗi tràn khung.
  */
  const radius = size / 2 - 20

  const ratios = axes.map((axis) => (axis.total > 0 ? axis.correct / axis.total : 0))
  const enough = axes.map((axis) => axis.total >= MIN_EVIDENCE)

  /*
    Vùng tô chỉ tính trên trục ĐỦ bằng chứng; trục thiếu bị kéo về 0. Nhờ vậy
    hình không bao giờ "phình ra" nhờ một trục mới có 1 câu đúng — thứ sẽ khiến
    học sinh tưởng mình mạnh ở chỗ chưa hề được đo.
  */
  const solidRatios = ratios.map((ratio, index) => (enough[index] ? ratio : 0))
  const solidPoints = radarPolygon(solidRatios, radius, center)

  const hasAnyEvidence = enough.some(Boolean)
  const missing = axes.filter((_, index) => !enough[index]).length

  return (
    <figure className="m-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="mx-auto block"
      >
        {/* Lưới nền */}
        {Array.from({ length: RINGS }, (_, ring) => {
          const ratio = (ring + 1) / RINGS
          const points = radarPolygon(
            axes.map(() => ratio),
            radius,
            center
          )
          return (
            <polygon
              key={ring}
              points={polygonPoints(points)}
              fill="none"
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth={1}
            />
          )
        })}

        {/* Nan trục */}
        {axes.map((axis, index) => {
          const outer = radarPoint(index, axes.length, 1, radius, center)
          return (
            <line
              key={axis.label}
              x1={center.x}
              y1={center.y}
              x2={outer.x}
              y2={outer.y}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth={1}
            />
          )
        })}

        {/* Vùng năng lực — chỉ khi có ít nhất một trục đủ bằng chứng */}
        {hasAnyEvidence && (
          <polygon
            points={polygonPoints(solidPoints)}
            fill={tone}
            fillOpacity={0.18}
            stroke={tone}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* Điểm trên từng trục: đặc = đủ bằng chứng, rỗng = chưa đủ */}
        {axes.map((axis, index) => {
          const point = radarPoint(index, axes.length, ratios[index], radius, center)
          return enough[index] ? (
            <circle key={axis.label} cx={point.x} cy={point.y} r={4} fill={tone} />
          ) : (
            <circle
              key={axis.label}
              cx={point.x}
              cy={point.y}
              r={4}
              fill="var(--background-card)"
              stroke={tone}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          )
        })}

        {/* Số thứ tự, khớp với bảng bên dưới */}
        {axes.map((axis, index) => {
          const at = radarPoint(index, axes.length, 1.13, radius, center)
          return (
            <text
              key={axis.label}
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={
                enough[index]
                  ? 'fill-slate-600 dark:fill-slate-300'
                  : 'fill-slate-400 dark:fill-slate-500'
              }
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              {index + 1}
            </text>
          )
        })}
      </svg>

      {/*
        Bảng số bên dưới KHÔNG phải trang trí: hình radar rất khó đọc chính xác,
        và với trình đọc màn hình thì `aria-label` một dòng là không đủ. Đây là
        nguồn số thật; hình chỉ để thấy nhanh hình dạng.
      */}
      <figcaption className="mt-3">
        <ul className="space-y-1 text-xs">
          {axes.map((axis, index) => (
            <li key={axis.label} className="flex items-baseline justify-between gap-3">
              <span
                className={
                  enough[index]
                    ? 'text-slate-700 dark:text-slate-200'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                <span className="mr-1.5 tabular-nums text-slate-400 dark:text-slate-500">
                  {index + 1}.
                </span>
                {axis.label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                {enough[index] ? (
                  `${axis.correct}/${axis.total} · ${Math.round(ratios[index] * 100)}%`
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    {axis.total}/{MIN_EVIDENCE} câu — chưa đủ
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {missing > 0 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {missing} chuyên đề chưa đủ {MIN_EVIDENCE} câu để kết luận, nên không được
            tính vào vùng tô.
          </p>
        )}
      </figcaption>
    </figure>
  )
}
