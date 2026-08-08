/**
 * Xử lý ảnh bài làm phía TRÌNH DUYỆT, trước khi upload.
 *
 * Chạy ở client có chủ đích, và ba việc nó làm đều không thay được bằng server:
 *
 * 1. THU NHỎ. Ảnh chụp từ điện thoại là 3-5 MB. Một lớp 30 học sinh x 6 câu tự
 *    luận x 2 trang = 360 ảnh ~ 1,4 GB cho MỘT đề, mà free tier Supabase Storage
 *    là 1 GB. Thu về cạnh dài 1600px / JPEG 0.8 cho ra ~250 KB, giảm khoảng 15
 *    lần. 1600px thừa sức để đọc chữ viết tay — độ phân giải không phải chỗ OCR
 *    môn Toán hay đọc sai.
 *
 * 2. XOÁ EXIF/GPS. Ảnh điện thoại mang toạ độ nơi chụp, thời điểm, mẫu máy. Vẽ
 *    lại qua canvas là mất sạch metadata, nên dữ liệu vị trí của học sinh KHÔNG
 *    BAO GIỜ rời khỏi máy họ. Làm việc này ở server thì toạ độ đã nằm trên
 *    Storage rồi mới bị xoá — muộn.
 *
 * 3. BĂM. Hash phải tính trên đúng số byte sẽ được upload, và chỉ client biết số
 *    byte đó trước khi upload. Server băm lại sau khi tải về và đối chiếu; hai
 *    con số khớp nhau chứng minh tệp không bị thay giữa hai bước.
 *
 * Không tin client: server vẫn kiểm lại kích thước, MIME và hash
 * (`/api/essay-ai/ocr`). Module này giảm dữ liệu và giảm chi phí, không phải lớp
 * bảo vệ.
 */

/** Cạnh dài tối đa sau khi thu nhỏ. */
const MAX_EDGE_PX = 1600

/** Chất lượng JPEG. 0.8 là mức chữ viết tay còn nét mà dung lượng đã giảm sâu. */
const JPEG_QUALITY = 0.8

export interface PreparedImage {
  blob: Blob
  /** Luôn là `image/jpeg`: canvas xuất JPEG bất kể ảnh vào là PNG hay WebP. */
  mimeType: 'image/jpeg'
  byteSize: number
  /** SHA-256 hex của `blob`. */
  contentHash: string
  width: number
  height: number
}

/**
 * Giải mã ảnh, ưu tiên `createImageBitmap` với `imageOrientation: 'from-image'`.
 *
 * Vì sao phải nói rõ orientation: ảnh chụp dọc bằng điện thoại thường được lưu
 * nằm ngang kèm một cờ EXIF "hãy quay 90 độ". Bỏ qua cờ đó thì ảnh vào canvas bị
 * xoay, và OCR sẽ đọc một trang giấy nằm ngang — hỏng hoàn toàn mà không có
 * cảnh báo nào.
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Một số bản Safari cũ không nhận `imageOrientation`. Rơi xuống nhánh dưới.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được tệp ảnh.'))
    }
    image.src = url
  })
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in source) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Thu nhỏ, xoá metadata và băm. Throw với thông điệp tiếng Việt đọc được nếu
 * trình duyệt thiếu thứ gì — người gọi hiển thị thẳng cho học sinh.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  // `crypto.subtle` chỉ có trên HTTPS và localhost. Kiểm trước khi làm việc nặng
  // để lỗi chỉ đúng nguyên nhân, không phải "không upload được".
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Trình duyệt không hỗ trợ mã hoá cần thiết. Hãy dùng Chrome hoặc Safari mới.')
  }

  const source = await decode(file)
  const { width, height } = sizeOf(source)

  if (width === 0 || height === 0) {
    throw new Error('Tệp không phải ảnh hợp lệ.')
  }

  // Chỉ thu nhỏ, không phóng to: phóng to ảnh nhỏ không thêm thông tin cho OCR
  // mà làm tệp nặng lên.
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Trình duyệt không cho xử lý ảnh. Hãy thử trình duyệt khác.')
  }

  // Nền trắng trước khi vẽ: PNG có vùng trong suốt sẽ thành đen khi xuất JPEG,
  // và chữ viết trên nền đen thì OCR không đọc được.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, targetWidth, targetHeight)

  if ('close' in source) source.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })

  if (!blob || blob.size === 0) {
    throw new Error('Không xử lý được ảnh. Hãy thử chụp lại.')
  }

  return {
    blob,
    mimeType: 'image/jpeg',
    byteSize: blob.size,
    contentHash: await sha256Hex(blob),
    width: targetWidth,
    height: targetHeight,
  }
}
