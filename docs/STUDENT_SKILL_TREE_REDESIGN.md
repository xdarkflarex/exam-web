# Kế hoạch thiết kế lại cây kỹ năng và trang học sinh

Phạm vi: `/learn`, `src/components/theories/SkillTree.tsx`, shell học sinh, và phần admin liên quan trực tiếp. Bối cảnh vận hành: **một giáo viên duy nhất**, một nhóm học sinh. Mọi quyết định dưới đây tối ưu cho bối cảnh đó, không cho quy mô nhiều giáo viên.

Trạng thái tài liệu: **đang thi công**. Phần đã làm được ghi ở mục 10; các mục 2-9 giữ nguyên như bản phân tích ban đầu (đọc tĩnh ngày 2026-07-28) để còn đối chiếu được với hiện trạng trước khi sửa.

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Hiển thị cây kỹ năng | Hai chế độ, **mặc định là Lộ trình** (path dọc theo chuyên đề). Chế độ Sơ đồ (graph) là tuỳ chọn thứ hai. |
| Nguồn bài tập cho node | **Chỉ homework do giáo viên giao.** Không tự sinh bài luyện từ ngân hàng câu hỏi. |
| Khóa node | Khóa mềm: vẫn vào được, hiển thị rõ tiên quyết chưa đạt. |

Hệ quả trực tiếp của quyết định về nguồn bài tập: trạng thái "chưa có bài tập được giao" là **trạng thái hợp lệ và phổ biến**, không phải lỗi. Thiết kế phải làm nó trông có chủ đích (đọc lý thuyết được, biết mình đang chờ gì) thay vì như hiện tại — một rừng node tím báo thiếu dữ liệu.

## 2. Vấn đề hiện tại cần sửa

### 2.1 Ngữ nghĩa dữ liệu (gốc rễ)

`src/app/learn/page.tsx:185-192, 202`

- `percent()` = `answered / total`, tức **tỷ lệ câu đã trả lời**, không phải tỷ lệ đúng. Nhưng `SkillTree.tsx:104` gán nhãn `completed` là "Đã đạt 80%" với màu emerald. Học sinh làm hết bài và sai toàn bộ vẫn thấy node xanh "đã đạt".
- Tiến độ bị gán chéo: `page.tsx:111-113` cộng nguyên `answeredCount` của một homework cho **mọi** theory mà homework đó nhắm tới. Một bài tổng hợp 3 chuyên đề làm sáng cả 3 node, kể cả node học sinh chưa đọc. Cột `homework_knowledge_targets.weight` (`NUMERIC(6,3)`, migration `20260621_separate_homework_domain.sql:101`) tồn tại nhưng không được đọc ở đâu trong `src/**`.
- `unlocked()` (`page.tsx:189-192`) trả `true` khi tiên quyết **không có homework nào**. Với một giáo viên chưa phủ hết cây, phần lớn node mở hết và mang trạng thái `no_homework`.

### 2.2 Hai thang đo song song

`/learn` có thang % answered riêng. `/student/analytics` dùng `getCapabilityStatus()` trong `src/lib/analytics/student-capability.ts:125-132` với 5 mức dựa trên **độ chính xác**: `no_data / needs_work / building / stable / mastered`. Hai trang nói hai chuyện khác nhau về cùng một học sinh.

Thang 5 mức cũng có lỗ: `total = 1, correct = 1` → `score = 1.0`, `total < 8` → `stable` ("Ổn định"). Một câu đúng duy nhất đủ để gọi là ổn định.

### 2.3 Các bảng mastery đã bị xoá

Migration `20260621_cleanup_mastery.sql` DROP `mastery_evidence`, `knowledge_block_mastery`, `theory_mastery`, `theory_mastery_by_level` cùng các function `refresh_theory_mastery`, `refresh_knowledge_block_mastery`, `process_mastery_for_answer`, `process_mastery_for_attempt`, `rebuild_all_mastery_evidence`.

`src/lib/theories/actions.ts` vẫn còn ~10 hàm export đọc/ghi các bảng và RPC này (dòng 484, 494, 506, 523, 539-605, 674-697, 777). Grep không thấy nơi nào import chúng → dead code, nhưng sẽ lỗi runtime nếu ai đó gọi. Kế hoạch này **không hồi sinh** lớp mastery đó; tiến độ tính on-the-fly từ domain homework như hướng của `20260621_cleanup_mastery.sql`.

### 2.4 Mô hình hình ảnh của SkillTree

`src/components/theories/SkillTree.tsx`

- Layout đổi thuật toán theo dữ liệu: `:256` chỉ dùng dagre khi `links.length >= items.length / 2`, ngược lại rơi về grid 2 cột zig-zag `(row % 2) * 72`. Gõ vào ô tìm kiếm là bố cục nhảy mô hình. Không xây được bản đồ không gian trong đầu — mà đó là toàn bộ giá trị của một skill tree.
- Mở một bài thì cây tự huỷ: `:247-254` dồn mọi lesson về một cột `x = 64`, và `:414` ẩn sạch edge tiên quyết (`displayExpandedId ? [] : links`). Thao tác chính xoá đúng thông tin mà cây tồn tại để thể hiện.
- **Nhánh kiến thức bên phải là giả.** `buildBlockEdges` (`:312-326`) tự nối block thành chuỗi tuyến tính theo `order_index`. Trong khi đó `expandedBlockLinks` — quan hệ thật từ `knowledge_block_edges`, đã được `/learn` truy vấn và memo hoá tại `page.tsx:216-224` rồi truyền vào `:254` — **không được destructure** ở `SkillTree.tsx:334`. Prop bị ném đi hoàn toàn. Đang trả một round-trip Supabase cho dữ liệu không dùng, và nhìn một sơ đồ do code bịa.
- Block node `selectable: false` và `onNodeClick` chỉ xử lý `data.item` → click nhánh không làm gì, dù trông hoàn toàn như phần tử tương tác. Nội dung block lại hiện đầy đủ ở panel phải, nên canvas và panel nói cùng một điều hai lần.
- Canvas hardcode `bg-[#061124]` và bảng màu riêng, ép dark mode trong app có light mode — ngược `docs/DESIGN_SYSTEM.md`.
- Không điều hướng được bằng bàn phím.

### 2.5 Điều hướng học sinh

Bảy đường vào việc học: `/student`, `/student/practice`, `/student/exams`, `/student/homework`, `/learn`, nút "Mở ngay" trong analytics, `ActiveExamBanner`. Bài được giao xuất hiện ở ba nơi với cùng dữ liệu và cùng link đích `/homework/prepare/:id`.

Mobile: drawer và bottom nav render trùng đủ 8 mục; bottom nav phải `overflow-x-auto`.

Sidebar gán nhãn "Cây kỹ năng" → `/learn/map`, nhưng `src/app/learn/map/page.tsx` chỉ là `redirect('/learn')` (tên hàm ghi rõ `LegacySkillMapPage`). Admin có mục "Xem kiến thức" trỏ thẳng `/learn`. Hai nhãn, một đích, một redirect vô ích.

### 2.6 Admin

22 mục sidebar phẳng, không nhóm, `sidebarContent` render hai lần (mobile + desktop) → 44 `<Link>` trong DOM. `isActive` dùng `pathname.startsWith(href)` nên ở `/admin/questions/sources` thì cả "Câu hỏi" và "Gom nguồn câu hỏi" cùng sáng.

Dashboard `/admin` không có quick-action nào; banner "Xin chào, Giáo viên! 👋" là text trang trí. Mọi tác vụ phải đi qua sidebar.

## 3. Thiết kế mục tiêu

### 3.1 Một thang đo duy nhất, đo bằng độ chính xác

Tách logic dùng chung ra `src/lib/analytics/knowledge-mastery.ts`, là nguồn sự thật duy nhất cho cả `/learn` và `/student/analytics`.

Đầu vào (đều đã có, không cần migration mới):

- `homework_assignments` + `homework_assignment_recipients` → assignment nào thuộc học sinh này.
- `homework_attempts` → `answered_questions`, `total_questions`, `correct_answers`.
- RPC `get_my_homework_answer_metadata` → `attempt_id`, `question_id`, `is_correct`. `student-capability.ts:243` đã dùng đúng RPC này và đã đọc `is_correct`, nên **độ chính xác cấp câu có sẵn ở client, không cần RPC mới**.
- `question_knowledge_links` (question → theory / knowledge_block) làm nguồn quy gán chính.
- `homework_knowledge_targets` (kèm `weight`) làm fallback khi câu hỏi chưa được map.

Quy tắc quy gán, thay cho `page.tsx:111-113`:

1. Nếu câu hỏi có `question_knowledge_links` → cộng bằng chứng vào đúng theory/block đó, nhân `weight` của link.
2. Nếu không → dùng `homework_knowledge_targets` của homework, **chia theo `weight` đã chuẩn hoá** thay vì cộng nguyên cho từng theory.
3. Mọi theory tổng hợp `{ answered, correct }`; `accuracy = correct / answered`.

Thang trạng thái, sửa lỗ min-evidence của `getCapabilityStatus`:

| Trạng thái | Điều kiện | Nhãn |
|---|---|---|
| `no_data` | `answered = 0` | Chưa có dữ liệu |
| `collecting` | `answered < 4` | Đang thu thập |
| `needs_work` | `accuracy < 0.5` | Cần củng cố |
| `building` | `accuracy < 0.8` | Đang tiến bộ |
| `stable` | `accuracy >= 0.8`, `answered < 10` | Ổn định |
| `mastered` | `accuracy >= 0.8`, `answered >= 10` | Thành thạo |

`collecting` là mức mới. Vì `getCapabilityStatus` đang được `/student/analytics` dùng, thay đổi này **đổi cả hai trang cùng lúc** — đó là mục đích, nhưng phải kiểm tra lại mọi nơi map status → màu/nhãn (`getCapabilityStatusLabel`, các nhánh render trong `student/analytics/page.tsx`).

Bỏ hẳn thang `% answered` khỏi `/learn`. Tiến độ hoàn thành bài (`answered/total`) vẫn hiển thị, nhưng là **thông tin thứ hai** trên node, không phải thứ quyết định màu.

### 3.2 Khóa mềm

Thay `unlocked()` bằng hàm trả về danh sách tiên quyết chưa đạt (`status` chưa tới `stable`). Node vẫn click được, vẫn đọc lý thuyết được. Hiển thị chip "Nên học *X* trước". Không có node nào bị chặn cứng — giáo viên dạy thật đôi khi cần cho học sinh nhảy bài.

### 3.3 Chế độ Lộ trình (mặc định)

Một mô hình layout duy nhất, không đổi theo dữ liệu.

- Trục dọc: các theory trong một chuyên đề, xếp theo `order_index`. Thứ tự học là thông tin có thật, học sinh đọc được ngay.
- Chuyên đề (`sections.categories.name`) là các chặng, có header dính (`sticky`) khi cuộn.
- Node hiện: tên bài, trạng thái 6 mức (màu **kèm icon và text**, không chỉ màu), số bài tập đang mở, deadline gần nhất.
- Tiên quyết chéo chuyên đề: **không vẽ đường** trong chế độ này — hiện thành chip "Cần: *X*" trên node, bấm vào nhảy tới node đó. Đường chéo trên trục dọc là nguồn rối chính.
- Lọc/tìm kiếm chỉ **làm mờ và cuộn tới**, không thay đổi bố cục. Bố cục phải bất biến để học sinh xây bản đồ trong đầu.
- Không phụ thuộc ReactFlow. Đây là DOM thường + CSS, nên keyboard/screen-reader hoạt động tự nhiên, dùng được token của `DESIGN_SYSTEM.md`, và có light mode thật.
- Trạng thái rỗng (chưa có homework nào): vẫn hiện đủ lộ trình với node "Chưa có bài tập", CTA là "Đọc lý thuyết". Không hiển thị 0% ở đâu.

### 3.4 Chế độ Sơ đồ (tuỳ chọn)

Giữ ReactFlow, sửa các lỗi ở 2.4:

- **Một** thuật toán layout: dagre `rankdir: TB`, luôn luôn, bỏ nhánh grid zig-zag ở `:270-280`.
- Khi mở một bài: **không** dồn cột, **không** ẩn edge tiên quyết. Giữ nguyên vị trí, làm mờ phần không liên quan.
- Nối `expandedBlockLinks` vào `SkillTreeCanvas` (destructure ở `:334`), dùng quan hệ thật từ `knowledge_block_edges`. `buildBlockEdges` chỉ còn dùng để nối theory → block gốc của mỗi nhánh, và chỉ khi không có edge thật.
- Block node: hoặc cho click được (cuộn panel phải tới block tương ứng), hoặc bỏ khỏi canvas. Không giữ trạng thái "trông bấm được mà không bấm được".
- Chuyển bảng màu sang token semantic; canvas phải đọc được ở light mode.
- Ghi lựa chọn chế độ vào `localStorage`, mặc định Lộ trình.

### 3.5 Điều hướng học sinh

- Sidebar: "Cây kỹ năng" trỏ trực tiếp `/learn`. Xoá `src/app/learn/map/page.tsx` hoặc giữ redirect nhưng không tham chiếu từ UI nữa.
- Mobile: bottom nav giữ **4 mục** cố định (Hôm nay, Bài tập, Cây kỹ năng, Lịch sử) và không scroll ngang; phần còn lại chỉ trong drawer. Bỏ trùng lặp 8-mục-hai-nơi.
- `/student` ("Hôm nay") là trang tốt nhất hiện có — nó trả lời đúng "giờ tôi làm gì" theo deadline. Bổ sung **một** khối "Mảng cần củng cố" lấy từ `knowledge-mastery` (tối đa 3 dòng, link vào node tương ứng trong `/learn`), để tín hiệu năng lực không còn bị chôn trong tab của `/student/analytics`.
- Gộp hiển thị "bài được giao" xuống hai nơi: `/student/homework` (danh sách đầy đủ) và `/student` (việc hôm nay). Bỏ card "Bài đang chờ" trùng ở analytics.
- `access_tier` gating trên `analytics`/`practice`/`history`: mở hết cho học sinh trong giai đoạn này. Giữ nguyên cơ chế trong `src/lib/auth/access.ts`, chỉ đổi cấu hình flag — **không xoá code tier**.

### 3.6 Admin

Không xoá route nào. Chỉ đổi thông tin kiến trúc của sidebar:

- Nhóm 22 mục thành 4 heading: **Dạy học** (Đề thi, Câu hỏi, Bài tập về nhà, Lý thuyết, Liên kết tri thức), **Học sinh** (Học sinh, Lớp học, Góp ý), **Nội dung công khai** (Landing, Bài viết, Media, Thông báo, Đơn đăng ký) — thu gọn mặc định, **Hệ thống** (Tài khoản, Phân quyền, Template LaTeX, Xuất báo cáo, Cài đặt) — thu gọn mặc định.
- Sửa `isActive`: so khớp chính xác cho mục cha, `startsWith` chỉ cho mục con, để "Câu hỏi" và "Gom nguồn câu hỏi" không cùng sáng.
- Bỏ "Xem kiến thức" khỏi menu quản trị; đưa thành nút "Xem như học sinh" ở header.
- Dashboard `/admin`: thay banner trang trí bằng 4 quick-action — Nhập câu hỏi, Tạo đề, Giao bài, Xem ai đang chậm.
- `sidebarContent` render hai lần: gom về một nguồn, dùng CSS để đổi trình bày thay vì nhân đôi DOM.

## 4. Thứ tự thi công

| Phase | Nội dung | Rủi ro |
|---|---|---|
| 1 | `src/lib/analytics/knowledge-mastery.ts`: quy gán bằng chứng có `weight`, 6 mức trạng thái. Chuyển `student-capability.ts` sang dùng nó. | Trung bình — đổi số liệu đang hiển thị ở `/student/analytics` |
| 2 | `/learn` đổi sang dùng module ở Phase 1; bỏ `percent()`, đổi `unlocked()` thành khóa mềm | Thấp |
| 3 | Chế độ Lộ trình, đặt làm mặc định. Giữ SkillTree hiện tại làm chế độ Sơ đồ, chưa sửa | Thấp — thêm mới, không phá cũ |
| 4 | Sửa SkillTree: một layout, không ẩn edge khi mở, nối `expandedBlockLinks`, token màu | Trung bình |
| 5 | Điều hướng học sinh: sidebar, bottom nav 4 mục, khối "Mảng cần củng cố" ở `/student`, bỏ trùng ở analytics | Thấp |
| 6 | Admin: nhóm sidebar, sửa `isActive`, quick-action dashboard, gộp `sidebarContent` | Thấp |
| 7 | Xoá dead code mastery trong `src/lib/theories/actions.ts` (các hàm ở 2.3) | Thấp — grep xác nhận không có caller, cần grep lại trước khi xoá |

Phase 1 và 2 phải đi cùng nhau về mặt kiểm thử: đó là phần đổi ý nghĩa con số học sinh nhìn thấy.

## 5. Kiểm chứng

- Unit test cho `knowledge-mastery`: quy gán qua `question_knowledge_links`; fallback chia theo `weight`; ranh giới 6 mức trạng thái; ca `1/1 câu` phải ra `collecting`, không ra `stable`; ca một homework nhắm 3 theory phải **không** cộng nguyên tiến độ cho cả 3.
- Đối chiếu tay: chọn một học sinh thật, so `knowledgeStats` cũ và mới, ghi lại chênh lệch và lý do.
- `/learn` với ba tập dữ liệu: chưa có homework nào; có homework nhưng chưa làm; đã làm một phần. Bố cục Lộ trình phải giữ nguyên khi lọc/tìm kiếm.
- Kiểm tra light mode và `prefers-reduced-motion` trên cả hai chế độ.
- Điều hướng bàn phím hết lộ trình; trạng thái phải đọc được không cần màu.
- `npm run build` + lint sau mỗi phase.

## 6. Dashboard: nhận xét hiện trạng

Đọc tĩnh ngày 2026-07-28. Phần này mở rộng phạm vi tài liệu sang `/admin` và `/student`, `/student/practice`, `/student/exams`, `/student/analytics`.

### 6.1 Phát hiện nghiêm trọng: hệ gamification đã build xong nhưng không ai với tới được

Tồn tại đầy đủ bốn trang, dùng bảng thật:

| Trang | Bảng | Trạng thái |
|---|---|---|
| `src/app/badges/page.tsx` | `badges`, `user_badges` | Hoàn chỉnh: 4 category, `points`, `requirement_type`, tính streak theo ngày ở client, thanh tiến độ từng huy hiệu |
| `src/app/goals/page.tsx` | `user_goals` | 4 loại mục tiêu gồm `streak_days` |
| `src/app/leaderboard/page.tsx` | RPC `get_simulation_leaderboard` | Top 50 |
| `src/app/bookmarks/page.tsx` | — | — |

Ba vấn đề xếp theo mức độ:

1. **Không có gì ghi vào `user_badges`.** Grep toàn repo không tìm thấy một `INSERT INTO user_badges` nào — không trigger, không RPC, không route handler, không code client. Trang `/badges` vì vậy **chỉ có thể hiển thị toàn bộ huy hiệu ở trạng thái khoá, vĩnh viễn**. Đây không phải lỗi UI; logic trao huy hiệu chưa bao giờ được viết. Bật link vào trang này trước khi có cơ chế trao thưởng sẽ tệ hơn là để ẩn.
2. **`StudentSidebar` không link tới cả bốn trang.** Nơi duy nhất link tới chúng là `src/components/student/StudentHeader.tsx:63-121`, nhưng header đó chỉ được chính bốn trang kia dùng. `src/app/(student)/layout.tsx:13` render `StudentSidebar`. Kết quả: một hòn đảo kín — vào được chỉ khi gõ URL tay.
3. **`badges`, `user_badges`, `user_goals` không có DDL trong `supabase/migrations/**`**, chỉ nằm trong snapshot `database/ANNOUNCEMENTS_SCHEMA.sql:80-144` và `database/SUPABASE_SCHEMA.sql:313-336`. Cùng loại nợ với `theory_edges` ở mục 9.

Không có admin UI nào quản lý huy hiệu (22 mục sidebar, không mục nào cho `badges`). Logic tính streak theo ngày bị **viết lặp hai lần** ở `badges/page.tsx:101-128` và `goals/page.tsx:121-147`. Ngoài ra `src/lib/theories/actions.ts:588-612` có một `streak` khác hẳn — chuỗi trả lời đúng liên tiếp lưu server-side — trùng tên, khác ngữ nghĩa hoàn toàn.

### 6.2 Không có thư viện chart, mọi biểu đồ là `div` CSS

`package.json` không có `recharts`, `chart.js`, `d3`, `nivo`, `victory`. Toàn bộ "biểu đồ" trong app là `div` với `style={{ width: '...%' }}`:

- `analytics/page.tsx:286-288` (`StatList`, `h-2`), `:344-346` (`HomeworkRow`), `:212-214` (`BasicView`, `h-3`)
- `student/page.tsx:896-907` (thanh homework `h-1.5`, có `role="progressbar"` + aria đầy đủ — làm đúng)

Không có line chart, sparkline, trend theo thời gian hay phân phối điểm ở bất kỳ đâu, dù `TrendingUp` được dùng làm icon metric. Đã cài sẵn: `gsap ^3.15.0`, `@xyflow/react ^12.11.0`, `dagre ^0.8.5`. Không có `framer-motion`, không có confetti.

### 6.3 `prefers-reduced-motion` gần như không được tôn trọng

`src/app/globals.css` khai báo ~20 `@keyframes` và bộ utility `animate-fade-in-up*`, `animate-list-stagger` (20 nth-child), `slide-in-up`, `card-interactive`. Nhưng block `@media (prefers-reduced-motion: reduce)` duy nhất ở `:731-735` **chỉ xử lý `.mm-logo-wrap`**. Toàn bộ animation entrance và stagger không bị tắt.

Điều này ngược trực tiếp `docs/DESIGN_SYSTEM.md:54`. Phải sửa **trước** khi thêm bất kỳ chuyển động nào — nếu không, mỗi hiệu ứng mới là một lỗi accessibility mới.

### 6.4 Admin dashboard

`src/app/admin/page.tsx`

- Bốn `StatCard` đều là **vanity metric**: tổng đề, tổng câu hỏi, lượt làm bài, số học sinh. Không con số nào trả lời "hôm nay tôi cần làm gì".
- `totalStudents` (`:53, 57`) `select('student_id')` **toàn bộ** `exam_attempts` rồi `new Set()` ở client. Truyền cả bảng về browser để đếm distinct, và định nghĩa sai: đếm học sinh *đã từng thi*, không phải học sinh đang dạy. Với một giáo viên và một nhóm nhỏ, số đúng phải là `profiles` có `role = 'student'`.
- `totalExams` / `totalQuestions` không lọc `is_published`, nên trộn nháp với đã phát hành.
- Banner "Xin chào, Giáo viên! 👋" (`:161-166`) chiếm vị trí đẹp nhất trang mà **không có một CTA nào** — thuần trang trí.
- `StatCard` có prop `trend` và `colorClasses[color].trend`, nhưng `colors.trend` **không được dùng**; màu xu hướng hardcode xanh/đỏ ở `StatCard.tsx:58`. Dashboard cũng không truyền `trend` cho card nào → không có ngữ cảnh thời gian ở đâu cả.
- `RecentFeedbackList` render mỗi góp ý là `div` **không bấm được**, trong khi `RecentExamsList` mỗi dòng là `Link`. Cùng một layout, hai hành vi — người dùng sẽ bấm và không có gì xảy ra.
- Card dùng `bg-slate-200 dark:bg-slate-800` + `border-slate-300`, không dùng token `--background-card`. Light mode xám nặng hơn mức `DESIGN_SYSTEM.md` mô tả.

### 6.5 Student dashboard và các trang ôn tập

`/student` là trang có kiến trúc thông tin **tốt nhất** trong toàn app: ưu tiên việc đang làm → việc còn hạn → phản hồi → quá hạn, mỗi khối có eyebrow, empty state riêng và CTA rõ. Đừng viết lại logic này.

Nhưng về mặt thị giác nó phẳng tuyệt đối:

- **Zero `bg-gradient-*`** trong cả file. Không có gradient nào trong `/student/practice` và `/student/exams`. Gradient duy nhất trong khu học sinh là banner recommended-action ở `analytics/page.tsx:124-139`.
- Không có điểm neo thị giác: mở trang ra là một cột card viền 1px `rounded-2xl` giống nhau, không có phần tử nào nói "đây là chỗ bắt đầu".
- Không có bất kỳ yếu tố thành tựu nào: không streak, không điểm, không huy hiệu, không mốc, không ăn mừng khi nộp bài. Affordance tiến độ duy nhất là thanh teal `h-1.5`.
- `practice/page.tsx` và `exams/page.tsx` gần như trùng khung nhưng lệch chi tiết: practice tách `PRACTICE_FILTERS` thành hằng, exams viết inline (`:170-174`) kèm `filterStatus as any` (`:177`); practice có icon cạnh `h1`, exams không; exams import `Filter`, `AlertCircle` mà không dùng. "Điểm cao nhất" hiện dạng text teal trơn — dữ liệu thành tích tốt nhất đang có mà không được dùng gì.
- `/student/analytics`: gating theo `access_tier` đẩy học sinh gói basic vào `BasicView` với một card khoá — trong bối cảnh một giáo viên, đây là hàng rào tự tạo.

### 6.6 Bottom nav mobile

`StudentSidebar.tsx:223-247`: bottom nav map qua **cùng** `visibleItems` với drawer. 8 mục × `min-w-[60px]` = 480px+, cộng `justify-start` và `overflow-x-auto` → trên điện thoại thường thành dải cuộn ngang, mục thứ 6-8 nằm ngoài màn hình và không có affordance cho biết còn cuộn được. Đã ghi ở mục 3.5; nhắc lại vì nó là lỗi hiển thị nặng nhất trên mobile.

## 7. Hướng thiết kế thị giác

### 7.1 Nguyên tắc chặn trước

"Bắt mắt hơn" là mục tiêu đúng, nhưng dự án này vừa có một lỗi đúng kiểu đó: node emerald ghi "Đã đạt 80%" khi học sinh sai toàn bộ (mục 2.1). Trang trí đi trước ngữ nghĩa là cách sinh ra lỗi loại này. Nên ba rào:

1. **Mỗi yếu tố thị giác phải neo vào một con số thật.** Vòng tiến độ hiển thị `accuracy` từ mục 3.1, không phải % đã làm. Streak chỉ hiện khi có dữ liệu ngày thật.
2. **Không bật UI thành tựu trước khi có cơ chế cấp.** Trang huy hiệu toàn-khoá gây phản tác dụng mạnh hơn là không có trang huy hiệu.
3. **Sửa `prefers-reduced-motion` trước khi thêm animation.** Là phase 0, không thương lượng.

### 7.2 Hướng thẩm mỹ: giấy kẻ ô và mực

Lấy chất liệu từ chính môn học thay vì hiệu ứng chung chung (glassmorphism, neon, gradient tím). Cụ thể:

- **Nền:** hoạ tiết giấy kẻ ô rất nhạt (CSS `repeating-linear-gradient`, không ảnh) trên `--background`, chỉ ở vùng hero. Gợi vở toán mà không ồn.
- **Mực teal là màu duy nhất mang nghĩa "hành động".** Giữ `--accent`. Cấm gradient trên phần tử không phải hành động chính — mỗi trang **tối đa một** bề mặt gradient, dành cho CTA quan trọng nhất.
- **Đường cong hàm số làm hoạ tiết dữ liệu.** Sparkline độ chính xác theo thời gian vẽ như đồ thị hàm số có trục nhạt — vừa là biểu đồ thật vừa là mô-típ thị giác của môn học.
- **Typography:** giữ cặp Inter + Baloo 2 đã có. Dùng Baloo 2 **chỉ cho số liệu và thành tựu** (`StatCard.tsx:56` đã làm đúng với `font-baseloo`), Inter cho mọi nội dung đọc. Thang: số hero 40-48px, số metric 28-32px, body 14-16px. Không thêm font thứ ba.
- **Trạng thái luôn là màu + icon + text**, theo `DESIGN_SYSTEM.md:47`. Vòng tiến độ phải có số ở giữa, không chỉ cung màu.

### 7.3 Ba primitive SVG tự viết, không thêm thư viện chart

Không cài `recharts` (~100KB gzip) cho ba hình. Bundle đã có `gsap` + `@xyflow/react` + `dagre`. Viết vào `src/components/viz/`:

| Component | Dùng ở | Ghi chú |
|---|---|---|
| `ProgressRing` | Hero `/student`, hero `/learn`, metric admin | SVG `circle` + `stroke-dasharray`. Số ở tâm. `role="img"` + `aria-label` |
| `Sparkline` | Độ chính xác theo tuần ở `/student`, `/student/analytics`, thẻ học sinh admin | `polyline` trên trục nhạt. Cần ≥3 điểm, dưới ngưỡng thì hiện text thay vì đường |
| `ActivityHeatmap` | `/student` hero, admin class pulse | Lưới 7×N `rect`, 5 bậc màu teal. Là nguồn dữ liệu cho streak — thay cho việc tính streak lặp hai lần ở 6.1 |

Cả ba nhận `number[]` thuần, không state, không animation mặc định. Animation (nếu có) bọc trong kiểm tra `prefers-reduced-motion`.

### 7.4 `/student` — hero "Hôm nay"

Giữ nguyên thứ tự khối hiện tại. Thay phần header text-only ở `:540-555` bằng một hero hai cột:

- **Trái:** ngày tiếng Việt (đã có), `h1` "Hôm nay, {tên}", và **một** câu nói rõ việc quan trọng nhất — tái dùng `recommendedAction` từ `student-capability.ts:363-389` thay vì câu tĩnh hiện tại. Đây là chỗ duy nhất trong trang dùng bề mặt gradient, kèm CTA.
- **Phải:** `ProgressRing` hiển thị độ chính xác tuần này (từ module mục 3.1), dưới đó `ActivityHeatmap` 4 tuần và dòng streak "N ngày liên tiếp" — chỉ hiện khi `N ≥ 2`, tránh khoe "1 ngày".

Bổ sung một dải mỏng "Mảng cần củng cố" (đã chốt ở mục 3.5) dùng chip trạng thái 6 mức, tối đa 3 mảng, link vào node `/learn`.

Không thêm XP, level, hay confetti ở phase này. Nếu sau này bật, gắn vào cùng nguồn `knowledge-mastery` chứ không tạo thang điểm thứ hai.

### 7.5 `/student/practice` và `/student/exams` — gộp khung

Hai trang trùng khung (6.5). Tách một component dùng chung `AssessmentListPage` nhận `mode: 'practice' | 'simulation'`, filter, và nhãn CTA. Việc này xoá `as any`, xoá import chết, và làm hai trang nhất quán trong một lần sửa.

Phần thị giác: card đổi từ danh sách dọc phẳng sang card có **cột thành tích** bên phải — `ProgressRing` nhỏ cho điểm cao nhất (thay text teal trơn), số lần làm, và dấu "đã hoàn thành". Đề chưa làm thì cột này là CTA rỗng có chủ đích, không phải `0%`.

### 7.6 `/admin` — đổi từ báo cáo sang cockpit

Thay bốn vanity metric bằng **"Cần bạn xử lý"** — danh sách hành động có số đếm, mỗi dòng là link:

- Bài tự luận chờ duyệt (xem `docs/ESSAY_GRADING.md`; cần xác minh bảng/cột trước khi cài số)
- Góp ý `status = 'pending'`
- Học sinh có bài quá hạn
- Chuyên đề chưa có homework nào — nối trực tiếp vào quyết định "chỉ dùng homework được giao" ở mục 1: nếu không giao bài, cây kỹ năng không có tín hiệu, nên đây là chỉ báo vận hành quan trọng nhất của giáo viên

Thay banner trang trí bằng 4 quick-action (đã chốt mục 3.6). Bổ sung một khối "Nhịp lớp": `ActivityHeatmap` toàn lớp + danh sách 5 học sinh có `accuracy` thấp nhất kèm `Sparkline`.

Sửa kèm: `totalStudents` đếm từ `profiles` role student (bỏ tải toàn bảng `exam_attempts`); thống kê đề/câu hỏi lọc `is_published`; `RecentFeedbackList` mỗi dòng thành `Link` tới `/admin/feedback`; card chuyển sang token `--background-card`; hoặc dùng prop `trend` của `StatCard` (kèm sửa `colors.trend` chết ở `StatCard.tsx:58`) hoặc bỏ prop đó.

### 7.7 Gamification: điều kiện để bật

Không bật link tới `/badges`, `/goals`, `/leaderboard` từ `StudentSidebar` cho tới khi đủ cả ba:

1. Có cơ chế trao huy hiệu thật (route handler hoặc RPC chạy sau khi nộp bài, ghi `user_badges`). Không có nó, trang chỉ hiện huy hiệu khoá.
2. Có migration bù cho `badges`, `user_badges`, `user_goals`.
3. Streak tính một chỗ duy nhất, từ `ActivityHeatmap` data, thay hai bản sao ở 6.1.

Trong lúc chưa đủ, phần "thành tựu" trên `/student` chỉ gồm những gì tính được từ dữ liệu có sẵn: streak ngày, độ chính xác, số bài hoàn thành. Đây là gamification thật vì nó không nói dối.

`/leaderboard` là ngoại lệ — RPC `get_simulation_leaderboard` đã hoạt động, có thể bật sớm. Nhưng với một nhóm học sinh nhỏ, bảng xếp hạng công khai có thể gây áp lực ngược; đề nghị chỉ hiện thứ hạng của chính học sinh đó kèm phân phối ẩn danh, không hiện tên bạn cùng lớp. Quyết định này thuộc về bạn với tư cách người dạy.

## 8. Thứ tự thi công dashboard

Nối tiếp bảng ở mục 4.

| Phase | Nội dung | Rủi ro |
|---|---|---|
| 0 | `prefers-reduced-motion`: tắt toàn bộ `animate-*`, `animate-list-stagger`, `slide-in-up`, `card-interactive` trong `globals.css`. **Chặn mọi phase sau** | Thấp |
| 8 | `src/components/viz/`: `ProgressRing`, `Sparkline`, `ActivityHeatmap` + unit test biên (0 điểm, 1 điểm, toàn 0, toàn max) | Thấp |
| 9 | Hero `/student` + dải "Mảng cần củng cố". Cần Phase 1 (module mastery) xong trước | Thấp |
| 10 | Gộp `practice`/`exams` thành `AssessmentListPage`; cột thành tích | Trung bình — gộp hai trang đang chạy |
| 11 | `/admin` cockpit: "Cần bạn xử lý", quick-action, nhịp lớp, sửa 4 lỗi số liệu ở 7.6 | Trung bình — đổi định nghĩa metric đang hiển thị |
| 12 | Điều kiện gamification (7.7). Chỉ làm khi quyết định bật | Cao — cần migration + cơ chế trao thưởng |

Phase 0 phải xong trước Phase 8-11. Phase 9 phụ thuộc Phase 1.

Kiểm chứng thêm cho phần này: ba primitive SVG phải có `aria-label` đọc được số; kiểm tra light mode cho mọi bề mặt mới; chạy với `prefers-reduced-motion: reduce` bật và xác nhận không còn chuyển động; đo bundle trước/sau Phase 8 để chắc không có thư viện chart nào lọt vào; kiểm tra bottom nav 4 mục trên viewport 360px.

## 9. Nợ kỹ thuật cần ghi nhận

`theory_edges` và `knowledge_block_edges` **không có DDL trong `supabase/migrations/**`** — chỉ tồn tại trong snapshot `database/THEORIES_SCHEMA.sql:27` và `database/KNOWLEDGE_BLOCKS_SCHEMA.sql:34`. Cả hai là dữ liệu nền của cây kỹ năng. Theo `AGENTS.md`, snapshot không phải nguồn sự thật và bộ migration hiện chưa dựng được database trắng. Cần một migration bù (`CREATE TABLE IF NOT EXISTS` + RLS) trước khi coi cây kỹ năng là tính năng dựng lại được từ đầu. Việc này nằm ngoài phạm vi kế hoạch, ghi vào `docs/SECURITY_AND_AUDIT.md`.

Cùng loại nợ, phát hiện khi rà dashboard: `badges`, `user_badges`, `user_goals` cũng **không có DDL trong `supabase/migrations/**`**, chỉ ở `database/ANNOUNCEMENTS_SCHEMA.sql:80-144` và `database/SUPABASE_SCHEMA.sql:313-336`. Nghiêm trọng hơn, **không có bất kỳ nơi nào trong repo ghi vào `user_badges`** — không trigger, không RPC, không code client. Xem mục 6.1 và điều kiện bật ở 7.7.

Dead code cần xoá (đã grep, không có caller): ~10 hàm mastery trong `src/lib/theories/actions.ts` (mục 2.3); import `Filter`, `AlertCircle` không dùng trong `src/app/(student)/student/exams/page.tsx:11,13`; `colorClasses[color].trend` không dùng trong `src/components/admin/StatCard.tsx`.

Logic trùng lặp: streak theo ngày viết hai lần (`badges/page.tsx:101-128`, `goals/page.tsx:121-147`); `src/lib/theories/actions.ts:588-612` có `streak` khác ngữ nghĩa (chuỗi trả lời đúng liên tiếp) — trùng tên, dễ gây nhầm khi đọc.

## 10. Nhật ký thi công

Ghi lại phần đã code và các quyết định phát sinh trong lúc làm. Cập nhật ở mỗi phase.

### Đã xong

**Phase 0 — `prefers-reduced-motion`** (`src/app/globals.css`)

Thêm lưới an toàn tắt mọi animation/transition. Hai quyết định đáng ghi: dùng `animation-duration: 0.01ms` thay vì `animation: none` để animation state-driven vẫn chạy tới trạng thái cuối (`both`/`forwards` không bị phá); giữ `.animate-spin` quay nhưng chậm còn 1.5s, vì spinner là chỉ báo đang tải — tắt hẳn thì người dùng tưởng treo. Reset `opacity: 1` cho `.animate-list-stagger > *` và `.stagger-children > *` để nội dung không phụ thuộc vào việc animation có chạy hay không.

**Phase 1 — thang đo dùng chung**

`src/lib/analytics/knowledge-mastery.ts`: hàm thuần, không import Supabase/React, test được không cần mạng. `splitEvidence()` đảm bảo một câu trả lời chỉ đóng góp tổng cộng 1 đơn vị bằng chứng, chia theo `weight`. `getMasteryStatus()` kiểm tra ngưỡng bằng chứng **trước** ngưỡng độ chính xác. Thêm `isMasteryAchieved()` cho khóa mềm — cố ý không tính `collecting` là đạt.

`src/lib/analytics/theory-mastery-data.ts`: adapter tải dữ liệu, tách khỏi phần tính toán.

`student-capability.ts` chuyển sang gọi module chung; `CapabilityStatus` thành alias của `MasteryStatus`, `getCapabilityStatus`/`getCapabilityStatusLabel` giữ lại làm wrapper `@deprecated`. `student/analytics/page.tsx` bổ sung `collecting` vào `statusTone` và `barTone`.

27 test ở `knowledge-mastery.test.ts`, chạy bằng `node --test` (`npm test`), không thêm dependency.

**Phase 2 — `/learn`**

Xoá `percent()` và `unlocked()`. `SkillTreeItem` tách hai khái niệm: `status` (đã làm bài tới đâu) và `mastery`/`accuracy` (làm đúng bao nhiêu). Viền node lấy màu theo `mastery` khi đã có bằng chứng đã chấm, nên **màu xanh trên cây luôn có nghĩa là làm đúng**. Nhãn `completed` đổi từ "Đã đạt 80%" thành "Đã làm hết".

Khóa mềm: `missingPrerequisitesOf()` trả danh sách tên bài chưa vững. Node vẫn click được, panel hiển thị "Bài này vẫn mở — bạn có thể đọc và làm ngay nếu muốn".

**Phase 4 — SkillTree**

`expandedBlockLinks` được destructure và dùng thật; `buildBlockEdges` ưu tiên `knowledge_block_edges`, chỉ fallback chuỗi `order_index` khi bài học chưa khai báo quan hệ nào. `layoutBlocks` tính cột theo độ sâu đồ thị để mũi tên luôn chảy từ trái sang phải.

`layoutLessons` còn một mô hình duy nhất: mỗi chuyên đề một cột, bài chảy từ trên xuống. Bỏ dagre và nhánh grid zig-zag; gỡ luôn import `dagre` khỏi file. Vị trí chỉ phụ thuộc chuyên đề + thứ tự bài, nên lọc/tìm kiếm không làm node dịch chuyển — page truyền toàn bộ node kèm cờ `matched`, lọc bằng cách làm mờ.

Bỏ `displayExpandedId ? [] : links`: mở một bài không còn xoá cạnh tiên quyết, chỉ giảm `opacity` cạnh không liên quan.

**Phase 8 — primitive SVG** (`src/components/viz/`)

`ProgressRing`, `Sparkline`, `ActivityHeatmap`. Không thêm thư viện chart. Phần tính toán nằm ở file `.ts` thuần (`geometry.ts`, `lib/analytics/activity-streak.ts`) để `node --test` chạy trực tiếp — `--experimental-strip-types` gỡ được kiểu nhưng không gỡ JSX.

`activity-streak.ts` là nơi duy nhất tính streak theo ngày, thay hai bản sao ở `badges/page.tsx` và `goals/page.tsx` (hai file đó chưa được sửa để dùng, xem "Chưa làm"). Quy tắc đáng ghi: **hôm nay chưa học không làm mất chuỗi** — ngày vẫn đang diễn ra, chuỗi chỉ đứt khi hôm qua cũng trống. Không có quy tắc này, học sinh mở app buổi sáng sẽ thấy chuỗi về 0 rồi lại lên.

Bậc màu heatmap chia theo **ngưỡng tuyệt đối**, không theo phân vị: chia theo phân vị làm ngày 2 câu trông đậm y như ngày 20 câu chỉ vì đó là ngày cao nhất trong tuần.

`Sparkline` không vẽ khi dưới 3 điểm — hai điểm nối nhau trông như xu hướng rõ ràng trong khi chỉ là hai lần đo.

**Phase 5 — điều hướng học sinh**

Bottom nav mobile chỉ còn 4 mục chính (`primary: true`) chia đều `flex-1`, cộng nút "Thêm" mở drawer. Bỏ `overflow-x-auto`. Sidebar "Cây kỹ năng" trỏ thẳng `/learn` thay vì `/learn/map`; `isActive` khớp chính xác cho cả `/student` và `/learn`. Bổ sung `aria-label` cho các nút icon-only và `aria-current` cho link đang mở.

**Phase 6 — admin**

Sidebar gom 22 mục thành mục "Tổng quan" + 4 nhóm: Dạy học và Học sinh mở sẵn, Nội dung công khai và Hệ thống thu gọn. Nhóm chứa trang đang mở tự bung. `isActive` không còn để mục cha sáng cùng route con (`childRoutes`). "Xem kiến thức" chuyển thành "Xem như học sinh" ở chân sidebar, tách khỏi menu quản trị. `sidebarContent` gộp về **một** `aside`, khác biệt mobile/desktop chỉ nằm ở class — trước đây render hai lần, nhân đôi toàn bộ link trong DOM.

Dashboard `/admin` thay 4 vanity metric bằng "Cần bạn xử lý" (`InboxPanel`): bài tự luận chờ duyệt, góp ý chưa xem, bài tập quá hạn, chuyên đề chưa có bài tập. Dòng cuối nối trực tiếp vào quyết định ở mục 1 — không giao bài thì cây kỹ năng không có tín hiệu nào. Thêm `QuickActions` 4 nút thay banner trang trí. Truy vấn dùng `head: true` để chỉ lấy count, bỏ hẳn việc tải toàn bộ `exam_attempts` về client đếm bằng `Set`. Mỗi truy vấn độc lập qua `allSettled`: một cái hỏng không làm trắng cả trang.

`InboxPanel` phân biệt ba trạng thái: `count > 0` (cần xử lý), `count === 0` (đã xong, vẫn hiện), `count === null` (chưa đo được — nói rõ thay vì hiện 0). `RecentFeedbackList` mỗi dòng thành `Link`. `StatCard` thêm prop `higherIsBetter` và xoá `colorClasses[color].trend` chết.

### Chưa làm

- **Phase 3**: chế độ Lộ trình bằng DOM riêng. Hiện `/learn` vẫn dùng ReactFlow, nhưng đã có một layout ổn định nên vấn đề nhảy bố cục đã hết.
- **Phase 9**: hero `/student` dùng `ProgressRing` + `ActivityHeatmap`. Primitive đã sẵn sàng, chưa gắn vào trang.
- **Phase 10**: gộp `practice`/`exams` thành `AssessmentListPage`.
- **Phase 12**: gamification — vẫn chặn bởi ba điều kiện ở mục 7.7. `badges/page.tsx` và `goals/page.tsx` chưa chuyển sang dùng `activity-streak.ts`; làm việc đó trước khi bật link sẽ hợp lý hơn.
- Dead code mastery trong `src/lib/theories/actions.ts` (mục 2.3) chưa xoá.
- Migration bù cho `theory_edges`, `knowledge_block_edges`, `badges`, `user_badges`, `user_goals` (mục 9).

### Chưa kiểm chứng

Workspace Linux hết dung lượng đĩa nên **không chạy được `tsc`, `eslint` và `npm test` sau các thay đổi từ Phase 4 trở đi**. Cần chạy tay:

```powershell
npx.cmd tsc --noEmit --incremental false
npm.cmd test
npx.cmd eslint src/lib/analytics src/components/viz src/components/admin src/components/student src/components/theories src/app/learn src/app/admin/page.tsx
```

Điểm rủi ro cao nhất: `SkillTreeItem` thêm 5 trường (`pending`, `mastery`, `accuracy`, `missingPrerequisites`, `matched`). Grep chỉ thấy `/learn` dựng object này, nhưng grep không thay được typecheck.
