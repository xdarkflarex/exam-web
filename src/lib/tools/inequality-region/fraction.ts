/**
 * Phân số chính xác cho công cụ miền nghiệm.
 *
 * VÌ SAO KHÔNG DÙNG `number`: toạ độ đỉnh của miền nghiệm thường là phân số
 * (giao của 2x + y = 5 và x − 3y = 1 là (16/7; 3/7)). Làm tròn thành 2,2857 thì
 * học sinh không đối chiếu được với lời giải tay, và phép so sánh "điểm có nằm
 * trên bờ không" sẽ sai vì sai số dấu phẩy động. Mọi phép tính hình học của công
 * cụ đi qua lớp này; `number` chỉ xuất hiện ở bước vẽ SVG.
 *
 * Dùng `bigint` để không tràn khi cắt đa giác bằng khung rất lớn (xem
 * `solve.ts`) — tử và mẫu có thể vượt 2^53 dù đầu vào chỉ là số có hai chữ số.
 */

// tsconfig nhắm ES2017 nên không viết được literal `0n`; khai báo hằng một lần.
const B0 = BigInt(0)
const B1 = BigInt(1)
const B10 = BigInt(10)

export class Frac {
  readonly n: bigint
  readonly d: bigint

  private constructor(n: bigint, d: bigint) {
    this.n = n
    this.d = d
  }

  static of(n: bigint | number, d: bigint | number = B1): Frac {
    let nn = typeof n === 'bigint' ? n : BigInt(n)
    let dd = typeof d === 'bigint' ? d : BigInt(d)
    if (dd === B0) throw new RangeError('Mẫu số bằng 0')
    if (dd < B0) {
      nn = -nn
      dd = -dd
    }
    const g = gcd(nn < B0 ? -nn : nn, dd)
    return new Frac(nn / g, dd / g)
  }

  static readonly ZERO = Frac.of(0)
  static readonly ONE = Frac.of(1)

  /**
   * Đọc "3", "-2", "0.5", "0,5", "1/3". Dấu phẩy thập phân là cách viết của học
   * sinh Việt Nam, nên được chấp nhận ngang dấu chấm.
   */
  static parse(text: string): Frac | null {
    const t = text.trim().replace(',', '.').replace(/[−–]/g, '-')
    const frac = /^([+-]?\d+)\/(\d+)$/.exec(t)
    if (frac) {
      if (/^0+$/.test(frac[2])) return null
      return Frac.of(BigInt(frac[1]), BigInt(frac[2]))
    }
    const dec = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(t)
    if (!dec || (dec[2] === '' && dec[3] === undefined)) return null
    const intPart = dec[2] === '' ? '0' : dec[2]
    const fracPart = dec[3] ?? ''
    const scale = B10 ** BigInt(fracPart.length)
    const value = BigInt(intPart) * scale + (fracPart === '' ? B0 : BigInt(fracPart))
    return Frac.of(dec[1] === '-' ? -value : value, scale)
  }

  add(o: Frac): Frac {
    return Frac.of(this.n * o.d + o.n * this.d, this.d * o.d)
  }

  sub(o: Frac): Frac {
    return Frac.of(this.n * o.d - o.n * this.d, this.d * o.d)
  }

  mul(o: Frac): Frac {
    return Frac.of(this.n * o.n, this.d * o.d)
  }

  div(o: Frac): Frac {
    if (o.n === B0) throw new RangeError('Chia cho 0')
    return Frac.of(this.n * o.d, this.d * o.n)
  }

  neg(): Frac {
    return new Frac(-this.n, this.d)
  }

  abs(): Frac {
    return this.n < B0 ? this.neg() : this
  }

  /** −1, 0 hoặc 1. */
  sign(): number {
    return this.n === B0 ? 0 : this.n < B0 ? -1 : 1
  }

  cmp(o: Frac): number {
    return this.sub(o).sign()
  }

  eq(o: Frac): boolean {
    return this.n === o.n && this.d === o.d
  }

  isZero(): boolean {
    return this.n === B0
  }

  isInteger(): boolean {
    return this.d === B1
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d)
  }

  /** "4/3", "−2", "0". Dấu trừ là U+2212 để hiển thị; dùng `toPlain` khi cần ASCII. */
  toString(): string {
    const s = this.d === B1 ? `${abs(this.n)}` : `${abs(this.n)}/${this.d}`
    return this.n < B0 ? `−${s}` : s
  }

  toPlain(): string {
    return this.d === B1 ? `${this.n}` : `${this.n}/${this.d}`
  }

  /** LaTeX: `\frac{4}{3}`, `-\frac{1}{2}`, `5`. */
  toTex(): string {
    if (this.d === B1) return `${this.n}`
    const body = `\\frac{${abs(this.n)}}{${this.d}}`
    return this.n < B0 ? `-${body}` : body
  }
}

function abs(v: bigint): bigint {
  return v < B0 ? -v : v
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== B0) {
    const t = a % b
    a = b
    b = t
  }
  return a === B0 ? B1 : a
}

export function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b
}
