# Bộ tài liệu chuẩn

Bộ này thay thế các wiki/checklist/plan cũ. Mục tiêu là một nguồn sự thật nhỏ, có chủ sở hữu rõ và đủ để người hoặc AI tìm đúng code trước khi sửa.

## Thứ tự đọc

1. [`../README.md`](../README.md): mục tiêu và chạy nhanh.
2. [`../AGENTS.md`](../AGENTS.md): rào chắn bắt buộc.
3. [`PROJECT_MAP.md`](PROJECT_MAP.md): route, module và luồng dữ liệu.
4. Tài liệu đúng miền:
   - [`FEATURES.md`](FEATURES.md)
   - [`DATA_MODEL.md`](DATA_MODEL.md)
   - [`SCORING.md`](SCORING.md): thang điểm Bộ GD&ĐT, bậc thang Đúng/Sai, quy đổi thang 10. **Đọc trước khi chạm bất cứ đường tính điểm nào**
   - [`ESSAY_GRADING.md`](ESSAY_GRADING.md) cho pilot tự luận simulation, copy/paste AI và giáo viên duyệt
   - [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
   - [`STUDENT_SKILL_TREE_REDESIGN.md`](STUDENT_SKILL_TREE_REDESIGN.md): kế hoạch thiết kế lại cây kỹ năng và trang học sinh (chưa thi công)
5. [`RUNBOOK.md`](RUNBOOK.md): setup/verify/deploy.
6. [`SECURITY_AND_AUDIT.md`](SECURITY_AND_AUDIT.md): baseline và backlog rủi ro.

## Quy ước duy trì

- Route, role, mode, bảng, biến môi trường hoặc command đổi thì cập nhật tài liệu trong cùng PR/commit.
- Phát hiện tạm thời đi vào `SECURITY_AND_AUDIT.md`, không tạo thêm file audit có ngày ở root.
- Không commit graph/vector/context pack. Chỉ commit `ai/project.manifest.json`; output nằm trong `.ai-cache/`.
- Mỗi tuyên bố runtime phải ghi rõ là đã test live, kiểm tra tĩnh hay chỉ là giả định.
- Xóa thông tin đã lỗi thời thay vì thêm đoạn “update” chồng lên nội dung cũ.

## Chủ sở hữu theo thay đổi

| Thay đổi | Tài liệu phải xem lại |
|---|---|
| Route/layout/middleware | `PROJECT_MAP.md`, `FEATURES.md` |
| Bảng/view/RPC/RLS/migration | `DATA_MODEL.md`, `SECURITY_AND_AUDIT.md` |
| Trọng số câu, hàm chấm, quy đổi điểm | `SCORING.md`, `DATA_MODEL.md`, `RUNBOOK.md` |
| Câu tự luận/rubric/AI hỗ trợ | `ESSAY_GRADING.md`, `SCORING.md`, `DATA_MODEL.md`, `SECURITY_AND_AUDIT.md` |
| Env/build/deploy/MCP | `RUNBOOK.md`, `.env.example` |
| UI token/component/UX | `DESIGN_SYSTEM.md` |
| Quy tắc AI/index | `AGENTS.md`, `ai/project.manifest.json` |
