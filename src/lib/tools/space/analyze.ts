/**
 * Bốn kiểu bài Oxyz của SGK Toán 12 (Kết nối tri thức, chương 5) mà công cụ giải
 * từng bước:
 *
 *   `plane`    — viết phương trình mặt phẳng đi qua ba điểm (tích có hướng).
 *   `distance` — khoảng cách từ điểm tới mặt phẳng, hình chiếu, điểm đối xứng.
 *   `line`     — vị trí tương đối và góc giữa đường thẳng với mặt phẳng.
 *   `sphere`   — vị trí tương đối giữa mặt cầu và mặt phẳng, đường tròn giao tuyến.
 *
 * Bốn kiểu này phủ 4 câu Oxyz của đề tốt nghiệp (roadmap mục 1.1) và dùng chung
 * đúng một phép tính cốt lõi: hình chiếu của một điểm lên mặt phẳng.
 *
 * Mỗi phần tử hình mang `reveal` — chỉ số bước mà nó bắt đầu hiện — để hình lớn
 * dần đúng theo lời giải, thay vì bày sẵn đáp án ngay từ bước 1.
 */

import { Frac } from '../fraction.ts'
import { Surd } from '../surd.ts'
import {
  angleLinePlane,
  distancePointPlane,
  linePlanePosition,
  onPlane,
  planeValue,
  projectionParam,
  projectOntoPlane,
  reflectInPlane,
  spherePlanePosition,
  Vec3,
  type AngleValue,
  type Line,
  type LinePlanePosition,
  type Plane,
  type Sphere,
  type SpherePlanePosition,
} from './geometry.ts'

export type SpaceKind = 'plane' | 'distance' | 'line' | 'sphere'

export type PointTone = 'given' | 'result' | 'aux'

export interface ScenePoint {
  label: string
  v: Vec3
  tone: PointTone
  reveal: number
}

export interface SceneVector {
  label: string
  from: Vec3
  to: Vec3
  reveal: number
}

export interface SceneSegment {
  from: Vec3
  to: Vec3
  dashed: boolean
  reveal: number
}

export interface SceneCircle {
  center: Vec3
  normal: Vec3
  r2: Frac
  reveal: number
}

export interface Scene {
  points: ScenePoint[]
  vectors: SceneVector[]
  segments: SceneSegment[]
  /** Mặt phẳng vẽ thành một mảnh hình bình hành quanh `anchor`. */
  planes: { plane: Plane; anchor: Vec3; reveal: number }[]
  lines: { line: Line; reveal: number }[]
  spheres: { sphere: Sphere; reveal: number }[]
  circles: SceneCircle[]
}

interface Base {
  scene: Scene
}

export type SpaceAnalysis = Base &
  (
    | {
        kind: 'plane'
        A: Vec3
        B: Vec3
        C: Vec3
        D: Vec3 | null
        AB: Vec3
        AC: Vec3
        /** Tích có hướng trước khi rút gọn, và vectơ pháp tuyến đã rút gọn. */
        cross: Vec3
        n: Vec3
        reduced: boolean
        P: Plane
        /** Giá trị vế trái khi thế D — `null` khi không nhập D. */
        valueD: Frac | null
      }
    | {
        kind: 'distance'
        M: Vec3
        P: Plane
        value: Frac
        d: Surd
        t: Frac
        H: Vec3
        Msym: Vec3
        onPlane: boolean
      }
    | {
        kind: 'line'
        line: Line
        P: Plane
        pos: LinePlanePosition
        angle: AngleValue
        /** Hai điểm dựng đường thẳng, khi học sinh nhập kiểu "qua hai điểm". */
        through: [Vec3, Vec3] | null
      }
    | {
        kind: 'sphere'
        S: Sphere
        R: Surd
        P: Plane
        pos: SpherePlanePosition
      }
  )

export type SpaceResult = { ok: true; analysis: SpaceAnalysis } | { ok: false; error: string }

const emptyScene = (): Scene => ({ points: [], vectors: [], segments: [], planes: [], lines: [], spheres: [], circles: [] })

/** Bài 1: mặt phẳng qua ba điểm. */
export function analyzePlane(A: Vec3, B: Vec3, C: Vec3, D: Vec3 | null): SpaceResult {
  if (A.eq(B) || B.eq(C) || A.eq(C)) {
    return { ok: false, error: 'Ba điểm phải khác nhau đôi một.' }
  }
  const AB = B.sub(A)
  const AC = C.sub(A)
  const cross = AB.cross(AC)
  if (cross.isZero()) {
    return {
      ok: false,
      error: 'Ba điểm này **thẳng hàng** (tích có hướng bằng vectơ 0) nên có vô số mặt phẳng đi qua chúng.',
    }
  }
  const n = cross.primitive()
  const P = { n, d: n.dot(A).neg() }

  const scene = emptyScene()
  scene.points.push(
    { label: 'A', v: A, tone: 'given', reveal: 0 },
    { label: 'B', v: B, tone: 'given', reveal: 0 },
    { label: 'C', v: C, tone: 'given', reveal: 0 },
  )
  scene.vectors.push(
    { label: '\\overrightarrow{AB}', from: A, to: B, reveal: 1 },
    { label: '\\overrightarrow{AC}', from: A, to: C, reveal: 1 },
  )
  // Vectơ pháp tuyến vẽ từ A, thu ngắn lại cho vừa hình nếu quá dài so với tam giác.
  scene.vectors.push({ label: '\\vec{n}', from: A, to: A.add(n.scale(normalScale(n, AB, AC))), reveal: 2 })
  scene.planes.push({ plane: P, anchor: A, reveal: 3 })
  if (D) scene.points.push({ label: 'D', v: D, tone: 'aux', reveal: 4 })

  return {
    ok: true,
    analysis: {
      kind: 'plane',
      A,
      B,
      C,
      D,
      AB,
      AC,
      cross,
      n,
      reduced: !cross.eq(n),
      P,
      valueD: D ? planeValue(P, D) : null,
      scene,
    },
  }
}

/** Vectơ pháp tuyến vẽ dài cỡ cạnh tam giác — không để nó vọt ra ngoài khung. */
function normalScale(n: Vec3, AB: Vec3, AC: Vec3): Frac {
  const target = Math.sqrt(Math.max(AB.norm2().toNumber(), AC.norm2().toNumber())) * 0.8
  const len = Math.sqrt(n.norm2().toNumber())
  const k = target / (len || 1)
  return Frac.of(Math.max(1, Math.round(k * 4)), 4)
}

/** Bài 2: khoảng cách, hình chiếu, điểm đối xứng. */
export function analyzeDistance(M: Vec3, P: Plane): SpaceResult {
  const value = planeValue(P, M)
  const H = projectOntoPlane(P, M)
  const Msym = reflectInPlane(P, M)

  const scene = emptyScene()
  scene.points.push({ label: 'M', v: M, tone: 'given', reveal: 0 })
  scene.planes.push({ plane: P, anchor: H, reveal: 0 })
  scene.segments.push({ from: M, to: H, dashed: true, reveal: 1 })
  scene.points.push({ label: 'H', v: H, tone: 'result', reveal: 2 })
  scene.points.push({ label: "M'", v: Msym, tone: 'result', reveal: 3 })
  scene.segments.push({ from: H, to: Msym, dashed: true, reveal: 3 })

  return {
    ok: true,
    analysis: {
      kind: 'distance',
      M,
      P,
      value,
      d: distancePointPlane(P, M),
      t: projectionParam(P, M),
      H,
      Msym,
      onPlane: value.isZero(),
      scene,
    },
  }
}

/** Bài 3: đường thẳng và mặt phẳng. */
export function analyzeLine(line: Line, P: Plane, through: [Vec3, Vec3] | null): SpaceResult {
  if (line.u.isZero()) return { ok: false, error: 'Vectơ chỉ phương không được bằng vectơ 0.' }
  const pos = linePlanePosition(line, P)

  const scene = emptyScene()
  scene.planes.push({ plane: P, anchor: pos.point ?? projectOntoPlane(P, line.A), reveal: 0 })
  scene.lines.push({ line, reveal: 0 })
  scene.points.push({ label: 'A', v: line.A, tone: 'given', reveal: 0 })
  if (through) scene.points.push({ label: 'B', v: through[1], tone: 'given', reveal: 0 })
  scene.vectors.push({ label: '\\vec{u}', from: line.A, to: line.A.add(line.u), reveal: 1 })
  scene.vectors.push({ label: '\\vec{n}', from: pos.point ?? line.A, to: (pos.point ?? line.A).add(P.n), reveal: 1 })
  if (pos.point) scene.points.push({ label: 'I', v: pos.point, tone: 'result', reveal: 2 })

  return { ok: true, analysis: { kind: 'line', line, P, pos, angle: angleLinePlane(line, P), through, scene } }
}

/** Bài 4: mặt cầu và mặt phẳng. */
export function analyzeSphere(S: Sphere, P: Plane): SpaceResult {
  const pos = spherePlanePosition(S, P)

  const scene = emptyScene()
  scene.spheres.push({ sphere: S, reveal: 0 })
  scene.points.push({ label: 'I', v: S.I, tone: 'given', reveal: 0 })
  scene.planes.push({ plane: P, anchor: pos.H, reveal: 0 })
  scene.segments.push({ from: S.I, to: pos.H, dashed: true, reveal: 1 })
  scene.points.push({ label: 'H', v: pos.H, tone: 'result', reveal: 2 })
  if (pos.kind === 'cat') scene.circles.push({ center: pos.H, normal: P.n, r2: pos.r2!, reveal: 3 })

  return { ok: true, analysis: { kind: 'sphere', S, R: Surd.sqrt(S.r2)!, P, pos, scene } }
}

/** Điểm có nằm trên mặt phẳng không — dùng cho câu hỏi đoán trước. */
export { onPlane }
