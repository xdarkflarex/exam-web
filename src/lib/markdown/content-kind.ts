/**
 * Đoán xem một chuỗi nội dung là HTML, Markdown, hay chữ thường.
 *
 * Tách riêng khỏi `MathContent` để test được bằng `node --test` — phép đoán
 * này từng làm hỏng cả màn nhập lý thuyết nên nó xứng đáng có test.
 */

/**
 * Chỉ những TÊN THẺ có thật mới tính là HTML.
 *
 * Mẫu cũ `/<[^>]+>/` khớp cả toán học: trong
 * `$x_1<x_2$ thì $f(x_1)>f(x_2)$` có dấu `<` rồi dấu `>`, thế là cả bài lý
 * thuyết bị đổ qua `dangerouslySetInnerHTML` thay vì qua Markdown. Hậu quả:
 * khối ```tikz nằm trơ cho MathJax gặm ("Unknown environment 'tikzpicture'"),
 * `##` thành ký tự `#` giữa công thức, và trình duyệt nuốt
 * `<x_2\Rightarrow f(x_1)<` như một thẻ rác.
 */
/*
  Danh sách kê thẳng ra, không dùng mẫu chung `<[a-zA-Z]...>`, vì hai kiểu sai
  KHÔNG cân nhau:

  - Nhận nhầm Markdown thành HTML → vỡ cả trang (đúng lỗi 2026-08-09).
  - Bỏ sót một thẻ lạ → thẻ đó hiện ra dưới dạng chữ, xấu nhưng đọc được.

  Nên thà kê dài còn hơn để `$<x,y>$` hay `$a<b>c$` lọt vào. Danh sách phủ cả
  thẻ cũ mà Word/WYSIWYG hay nhả ra khi dán câu hỏi (`font`, `center`, `tt`...).
*/
const HTML_TAG_NAMES = [
  // cấu trúc
  'html', 'head', 'body', 'p', 'div', 'span', 'section', 'article', 'header',
  'footer', 'nav', 'main', 'aside', 'address', 'hgroup', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'br', 'hr', 'pre', 'blockquote', 'details', 'summary',
  // danh sách
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'menu',
  // bảng
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'colgroup', 'col',
  // chữ
  'a', 'b', 'i', 'u', 's', 'em', 'strong', 'mark', 'small', 'big', 'sub',
  'sup', 'code', 'kbd', 'samp', 'var', 'q', 'cite', 'dfn', 'abbr', 'time',
  'data', 'del', 'ins', 'strike', 'tt', 'font', 'center', 'wbr', 'bdi', 'bdo',
  'ruby', 'rt', 'rp',
  // ảnh, đa phương tiện
  'img', 'picture', 'figure', 'figcaption', 'svg', 'canvas', 'video', 'audio',
  'source', 'track', 'iframe', 'embed', 'object', 'param', 'map', 'area',
  // biểu mẫu
  'form', 'label', 'input', 'button', 'select', 'option', 'optgroup',
  'textarea', 'fieldset', 'legend', 'datalist', 'output', 'progress', 'meter',
  // khác
  'script', 'style', 'noscript', 'template',
]

/*
  Sau tên thẻ bắt buộc là khoảng trắng, `/` hoặc `>` — KHÔNG dùng `\b`.

  `\b` coi ranh giới chữ–ký hiệu là hợp lệ, nên `$a<b$ và $c>d$` sẽ khớp: tên
  thẻ `b`, rồi `$ và $c`, rồi `>`. Đúng cái bẫy cũ quay lại, chỉ hẹp hơn.
*/
const HTML_TAG_REGEX = new RegExp(`</?(?:${HTML_TAG_NAMES.join('|')})(?=[\\s/>])[^>]*>`, 'i')

export function hasHtmlMarkup(text: string): boolean {
  return HTML_TAG_REGEX.test(text)
}

const MARKDOWN_REGEX =
  /(?:^|\n)#{1,6}\s|(?:^|\n)[-*+]\s|(?:^|\n)\d+\.\s|\*\*.+?\*\*|__.+?__|\*.+?\*|_[^_]+_|~~.+?~~|`.+?`|(?:^|\n)>\s|(?:^|\n)```|\[.+?\]\(.+?\)|(?:^|\n)\|.+\|/

export function hasMarkdownSyntax(text: string): boolean {
  return MARKDOWN_REGEX.test(text)
}
