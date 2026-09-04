/**
 * Hiển thị lớp của một hồ sơ học sinh.
 *
 * VÌ SAO CẦN MỘT CHỖ DÙNG CHUNG
 * `profiles.class_id` KHÔNG có foreign key sang `classes.id`. Nó là khoá theo
 * quy ước chứ không theo ràng buộc, nên nó có thể chứa giá trị không trỏ tới lớp
 * nào — di sản của các ô chữ tự do ("10a1", "9/1", "12"). Mọi màn hình hiện lớp
 * đều phải xử ba trạng thái, và trước đây mỗi màn xử một kiểu:
 *
 *   1. NULL              — chưa được xếp lớp;
 *   2. khớp một lớp      — hiện tên lớp;
 *   3. không khớp lớp nào — HỎNG, và phải nói ra là hỏng.
 *
 * Trạng thái 3 gộp vào trạng thái 2 là cách lỗi này sống sót lâu như vậy: trang
 * quản lý lớp hiện chữ "Lớp khác" cho cả hồ sơ hỏng lẫn hồ sơ đang ở lớp thật,
 * nên nhìn qua không có gì bất thường.
 */

export interface ClassOption {
  id: string
  name: string
  grade: number | null
}

/**
 * Chữ hiện cho người dùng, ứng với một `profiles.class_id`.
 *
 * Ca hỏng hiện NGUYÊN giá trị rác. Giấu nó đi thì giáo viên biết có gì đó sai
 * nhưng không biết học sinh đã tự khai lớp gì — mà chính chữ đó là manh mối để
 * xếp em ấy vào đúng lớp.
 */
export function describeClassId(
  classId: string | null | undefined,
  classes: readonly ClassOption[]
): string {
  if (!classId) return 'Chưa xếp lớp'
  const found = classes.find(option => option.id === classId)
  return found ? found.name : `${classId} — không khớp lớp nào`
}

/** `true` khi `class_id` có giá trị nhưng không trỏ tới lớp nào. */
export function isBrokenClassId(
  classId: string | null | undefined,
  classes: readonly ClassOption[]
): boolean {
  return !!classId && !classes.some(option => option.id === classId)
}

/**
 * Nhãn cho một mục trong ô chọn lớp.
 *
 * Kèm khối vì hai lớp có thể trùng tên giữa các khối, và người chọn cần phân
 * biệt được mà không phải mở bảng lớp ra tra.
 */
export function classOptionLabel(option: ClassOption): string {
  return option.grade ? `${option.name} (lớp ${option.grade})` : option.name
}
