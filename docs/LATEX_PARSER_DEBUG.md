# Parser LaTeX đã sửa xong; hình TikZ còn dở (2026-08-11)

Tiếp nối bản bàn giao 2026-08-09. Bản cũ chẩn đoán **sai chỗ**; phần dưới ghi
lại nguyên nhân thật để sau này không đi lại đường vòng.

**Trạng thái:** parser và renderer đã sửa và thử thật — màn nhập lý thuyết chạy
ổn. **Hình TikZ thì chưa hiện**, xem mục "Còn treo" ở cuối và
[`RUNBOOK.md`](RUNBOOK.md) mục 12.

## Tóm tắt

| Hạng mục | Trước | Sau |
|---|---|---|
| File `.tex` đọc được | 30 | 30 |
| Khối tri thức trích ra | 384 | 384 |
| Hình TikZ bọc thành ```` ```tikz ```` | 110/112 | 110/112 (2 hình nằm ngoài khối, xem "Còn treo") |
| Khối ```` ```tikz ```` thật sự tới được `TikzRenderer` | 0 ở 19/30 file | tất cả |
| Display math ra `$$...$$` | **0** | tất cả |
| Nội dung lọt vào `dangerouslySetInnerHTML` | **19/30 file** | 0 (đo trên 384 khối) |
| Khối rơi xuống `<span>` chữ thô, mất ngắt đoạn | **94/384** | 0 (bên gọi truyền `format="markdown"`) |
| Hình dựng sẵn thành SVG | 0 | **110/110** |

`npm test`: 233 xanh (211 cũ + 22 mới). `tsc --noEmit` sạch. `npm run build`
sạch. `eslint` trên các file đã sửa: không thêm lỗi mới.

## Nguyên nhân thật (bản 2026-08-09 đoán sai)

Giả thuyết cũ — "`parseKnowledgeBlocks()` không gọi `latexToMarkdown()` nên TikZ
lọt ra" — **sai**. Nó có gọi (dòng 205 bản cũ), và TikZ được bọc đúng. Đo trên
cả 30 file: số `tikzpicture` nguồn khớp số khối ```` ```tikz ```` sinh ra.

Chỗ hỏng nằm ở **renderer**, không phải parser:

### 1. `MathContent` tưởng bài lý thuyết là HTML — đây là gốc của cả ba triệu chứng

```ts
const hasHtml = /<[^>]+>/.test(normalizedContent)   // ← mẫu cũ
```

Trong bài có `$x_1<x_2$ thì $f(x_1)>f(x_2)$`. Mẫu đó thấy một dấu `<` rồi một
dấu `>` là kết luận "có thẻ HTML", thế là cả bài đi qua
`dangerouslySetInnerHTML` thay vì qua `react-markdown`. Hậu quả khớp từng chữ
với ba lỗi đã thấy:

| Triệu chứng | Vì sao |
|---|---|
| `Unknown environment 'tikzpicture'` ×8 | Markdown không chạy → khối ```` ```tikz ```` nằm trơ dạng chữ, MathJax gặm phải |
| `You can't use 'macro parameter character #'` | `##` của heading Markdown không thành `<h2>`, còn nguyên ký tự `#` và bị nuốt vào vùng math |
| `Extra close brace` ở `{$x_1f(x_2)` | Trình duyệt nuốt `<x_2\Rightarrow f(x_1)<` như một thẻ rác, còn lại đúng `{$x_1` + `f(x_2)$}` |
| `y=f(x)cóđạohàmtrênkhoảngK` | Mất `$` do đoạn trên bị nuốt → cặp `$` lệch → cả câu vào math mode, math mode bỏ dấu cách |

Đo được: **19/30 file** dính bẫy này.

Đã tách phép đoán ra `src/lib/markdown/content-kind.ts` và chỉ nhận **tên thẻ
có thật**, kê thẳng ra hơn 100 tên (kể cả `font`, `center`, `tt` mà Word hay
nhả ra khi dán câu hỏi). Hai điểm phải giữ nguyên khi sửa file đó:

- **Không dùng mẫu chung `<[a-zA-Z]…>`.** Hai kiểu sai không cân nhau: nhận nhầm
  Markdown thành HTML thì vỡ cả trang, còn bỏ sót một thẻ lạ thì thẻ đó chỉ hiện
  ra dưới dạng chữ.
- **Sau tên thẻ phải là khoảng trắng, `/` hoặc `>` — không dùng `\b`.** `\b` coi
  ranh giới chữ–ký hiệu là hợp lệ nên `$a<b$ và $c>d$` vẫn khớp (tên thẻ `b`,
  rồi `$ và $c`, rồi `>`). Đúng cái bẫy cũ, chỉ hẹp hơn.

Đã đo lại trên **384 khối thật của cả 30 file: 0 dương tính giả.**

### 1b. Phép đoán không đủ — bên gọi phải nói rõ

Cùng phép đo trên cho thấy **94/384 khối** không có dấu hiệu Markdown nào
(`**`, `- `, `##`) vì chúng chỉ gồm đoạn văn và công thức. Những khối đó rơi
xuống nhánh `<span>` chữ thô, mất hết ngắt đoạn.

`MathContent` giờ có prop `format`. Mặc định vẫn `auto` (ngân hàng câu hỏi cần
đoán, vì nội dung khi HTML khi Markdown khi chữ thường), nhưng bốn chỗ hiển thị
`content_md` / `body_md` đều truyền `format="markdown"`:

- `admin/theories/import/page.tsx` (khung xem trước)
- `admin/theories/[id]/edit/page.tsx`
- `learn/page.tsx` (hai chỗ: `content_md` và `body_md`)

Thêm bài mới hiển thị lý thuyết thì **nhớ truyền `format="markdown"`** — parser
luôn sinh Markdown, không có lý do gì để đoán.

### 2. `String.replace` nuốt `$$` khi khôi phục placeholder

```ts
md = md.replace(`%%PROTECTED_${i}%%`, protected_blocks[i])   // ← chuỗi thay thế
```

Trong **chuỗi** thay thế, `$$` nghĩa là *một* dấu `$` (và `$&`, `` $` ``, `$'`
cũng là ký hiệu đặc biệt). Nên mọi `\[...\]` được bọc thành `$$...$$` rồi tụt
xuống `$...$`. Đo được: `$$` xuất hiện **0 lần** trên toàn bộ 30 file.

Đã đổi sang **hàm** thay thế ở cả `latex-parser.ts` và `latex-normalize.ts`.

### 3. Đổi bảng trước khi giấu TikZ

`normalizeLatexTablesForMarkdown()` chạy trước, mà lớp 10 bài 2 có hình TikZ
**nằm trong ô `tabular`**. `cleanupTableCell` bóp cả hình xuống một dòng và
thoát dấu `|`.

Đã đảo thứ tự: giấu TikZ trước. Bảng nào có hình thì trải thành từng đoạn (ô
bảng Markdown không chứa nổi khối ```` ``` ````), bảng thường vẫn thành bảng
Markdown.

### 4. Tiêu đề khối cắt cụt khi có ngoặc

`\begin{chuy}[id]{Phân biệt $\varnothing$, $\{0\}$ và $\{\varnothing\}$}` — mẫu
`\{([^}]*)\}` dừng ở dấu `}` của `\{0\}`. Tiêu đề cụt, phần đuôi trôi vào thân
khối, kéo theo `\item` sau đó hỏng. Đã thay bằng bộ đếm ngoặc cân bằng
(`readBalancedArg`), dùng chung cho cả `\textbf`, `\choice`...

### 5. Vụn còn lại đã dọn

- Khai báo cột `{|p{0.40\textwidth}|...}` có ngoặc lồng → bảng không nhận ra.
- `\renewcommand{\arraystretch}{1.8}` nằm trong `\[...\]` → MathJax không hiểu.
- `\textbf{$\vec{a}$}` → mẫu `[^}]+` đứt ở `}` đầu tiên.
- `enumerate` giờ ra danh sách **đánh số** (trước đây thành gạch đầu dòng).
- `\choice{A}{B}{C}{D}` của `ex_test.sty` → bốn dòng **A. B. C. D.**
- `\small`, `\large`... bị gỡ.
- Bỏ luật `md.replace(/\\node\[.*?\]/g, '')` — TikZ đã được giấu từ bước 0 nên
  nó không còn việc gì, mà `.*?` thì nuốt được cả văn bản thường.
- Math trong dòng `$...$` cũng được giấu trước khi dọn dẹp, để `\quad`, `\,`,
  `\underline` trong công thức không bị đổi nghĩa.

## Hình TikZ: dựng sẵn SVG bằng LaTeX thật

**Vì sao không dùng TikZJax trong trình duyệt:** nó không có `tkz-tab` (24 bảng
biến thiên trong bộ bài) và không biết `Accent` / `Primary` / `TextGray` khai
báo trong `preamble.tex` (hơn 380 lần dùng), cũng như các kiểu `trithuc axis`,
`trithuc curve`... trong `\tikzset`. Gần như mọi hình sẽ rơi xuống khung dự
phòng. MathJax thì càng không — nó không phải công cụ vẽ.

**Cách làm:** biên dịch từng hình bằng chính LaTeX của thầy → PDF → SVG.

```bash
npm run tikz:svg -- --chapters "D:/ToanTHPT/LATEX/HethongtrithucToanTHPT"
```

- Cần `pdflatex` + `dvisvgm` trong PATH (MiKTeX đang có sẵn trên máy).
- Preamble được **đọc tự động** từ `preamble.tex` và `tri-thuc.sty`: màu,
  `\usetikzlibrary`, khối `\tikzset`. Thầy thêm màu mới thì không phải sửa script.
- Kết quả: `public/tikz/<khoá>.svg` + `manifest.json`. Hiện có **110 hình,
  3,0 MB**, commit thẳng vào repo nên deploy không cần LaTeX.
- Chạy lại nhiều lần thoải mái: hình nào đã có SVG thì bỏ qua. Sửa hình trong
  `.tex` → khoá đổi → chỉ hình đó được dựng lại. `--force` để làm lại tất cả.
- Xem lại toàn bộ hình: mở `/tikz/_preview.html`.

**Khoá** là FNV-1a 64 bit của mã hình đã chuẩn hoá, ở
`src/lib/theories/tikz-figure-key.ts` — dùng chung cho script (Node) và
`TikzRenderer` (trình duyệt). Test ghim cứng một giá trị: lệch khoá thì web đi
tìm tệp không có và **im lặng** rơi xuống TikZJax, hỏng mà không báo.

**Thứ tự hiển thị của `TikzRenderer`:**

1. SVG dựng sẵn `public/tikz/<khoá>.svg` — giống hệt sách in.
2. TikZJax trong trình duyệt (dự phòng cho hình chưa dựng).
3. Khung xổ mã TikZ để còn đọc được nội dung.

SVG do LaTeX sinh ra là nét đen trên nền trong suốt, nên khung ảnh luôn có nền
trắng — để nguyên thì chế độ tối không nhìn thấy gì.

**MathJax phải chừa hình ra:** đã thêm
`options.ignoreHtmlClass: 'tikz-container|tex2jax_ignore'` trong cấu hình
`MathJaxContext`, và khung dự phòng mang class `tex2jax_ignore`.

## Đã xác minh bằng mắt, không chỉ bằng exit code

Bốn hình dựng ra PNG và soi trực tiếp: đồ thị đồng biến (màu `Accent`, chữ
Việt, mũi tên), bảng biến thiên `tkzTab` ba dòng, hệ trục `Oxyz` với ba mặt
phẳng toạ độ, hình hộp `ABCD.A'B'C'D'` với cạnh khuất nét đứt và vectơ
$\overrightarrow{AB'}$. Tất cả khớp bản in.

## Còn treo

- **ĐANG HỎNG — hình TikZ chưa hiện trên web (2026-08-11).** Đã thử thật trên
  trình duyệt: phần còn lại của màn nhập lý thuyết chạy ổn, riêng hình thì
  không ra. SVG đã dựng đủ 110/110 và parser sinh đúng khối ```` ```tikz ````,
  nên chỗ đứt nằm đâu đó giữa `TikzRenderer` và tệp SVG. Danh sách nghi can và
  cách đo: [`RUNBOOK.md`](RUNBOOK.md) mục 12.
- **Hai hình TikZ nằm ngoài mọi khối tri thức** (lớp 10 bài 2) không vào
  `content_md`, vì `content_md` chỉ dựng từ các khối. 112 hình trong nguồn →
  110 hình khác nhau sau khi khử trùng lặp → tất cả đều đã có SVG, nhưng hai
  hình kia sẽ không hiện ở bài nào. Cần quyết định: đưa vào khối gần nhất, hay
  cho parser giữ cả phần văn bản ngoài khối.
- Các bẫy của bản 2026-08-09 vẫn còn nguyên giá trị: file `bai01-on-tap-dao-ham`
  trùng bản `-chuan`, chương 1 đã có 4 bài từ tháng 6, `order_index` lấy theo
  thứ tự file nên phải `UPDATE` lại sau khi nạp, và `BEGIN;` phải có `COMMIT;`.
- Cây kỹ năng mới: `docs/DESIGN_OVERHAUL_2026-08-09.md` mục 3b.

## Cách đo lại nếu nghi ngờ

Test đã phủ các trường hợp trên (`src/lib/theories/latex-parser.test.ts`,
`tikz-figure-key.test.ts`, `src/lib/markdown/content-kind.test.ts`). Muốn rà
lại toàn bộ 30 file thì viết script gọi `parseTexFile()` rồi đếm theo file: số
`tikzpicture` nguồn so với số ```` ```tikz ```` sinh ra, số `$$`, số `#`, và các
macro `\lệnh` còn sót sau khi bỏ khối tikz. Bảng đó cho biết ngay lỗi là cá
biệt hay hệ thống — chính nó đã lật được giả thuyết sai ở trên.
