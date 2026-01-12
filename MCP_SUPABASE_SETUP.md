# Hướng dẫn cài đặt MCP cho Supabase

## Bước 1: Cài đặt MCP Server cho PostgreSQL

```bash
npm install -g @modelcontextprotocol/server-postgres
```

## Bước 2: Lấy thông tin kết nối Supabase

1. Truy cập [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào **Settings** → **Database**
4. Copy **Connection String** (chế độ Session hoặc Transaction)

## Bước 3: Thêm biến môi trường vào file `.env`

Tạo hoặc cập nhật file `.env` trong thư mục `exam-web`:

```env
# Supabase Configuration (Next.js format)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Database Connection String (cho MCP)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

### Cách lấy các giá trị:

- **NEXT_PUBLIC_SUPABASE_URL**: Settings → API → Project URL
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Settings → API → Project API keys → anon public
- **SUPABASE_SERVICE_KEY**: Settings → API → Project API keys → service_role (bảo mật)
- **DATABASE_URL**: Settings → Database → Connection string → URI (chọn tab "URI")

## Bước 4: Cấu hình MCP

File `mcp.json` đã được tạo sẵn. Cập nhật connection string trong file này.

## Bước 5: Sử dụng MCP

Sau khi cấu hình xong, bạn có thể:

1. Query database trực tiếp qua MCP
2. Tự động lấy schema và metadata
3. Thực hiện các truy vấn SQL an toàn

## Lưu ý bảo mật

⚠️ **QUAN TRỌNG:**
- Không commit file `.env` lên Git
- Không share `service_role_key` công khai
- Chỉ dùng `anon_key` cho client-side
- Dùng `service_role_key` cho server-side hoặc admin tasks

## Ví dụ sử dụng

Sau khi setup, bạn có thể hỏi AI:
- "Query tất cả exams từ database"
- "Lấy danh sách students"
- "Tạo một question mới"

AI sẽ tự động sử dụng MCP để thực hiện queries lên Supabase.
