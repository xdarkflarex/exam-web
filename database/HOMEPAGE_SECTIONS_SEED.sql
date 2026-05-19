-- =============================================
-- HOMEPAGE SECTIONS - New CMS Keys
-- Run AFTER POSTS_SCHEMA.sql
-- =============================================

-- Hero Slides (image carousel)
-- Upload ảnh qua Admin > Thư viện Media, sau đó chọn ảnh trong CMS Landing Page > Hero Slides
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.hero_slides',
    '[
      {"image_url": "", "title": "Nền tảng luyện thi Toán THPT", "subtitle": "Luyện đề – phân tích – cải thiện điểm số"},
      {"image_url": "", "title": "Hệ thống đề thi phong phú", "subtitle": "Hàng trăm đề thi chuẩn cấu trúc mới nhất"}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Enrollment banners (Tải ảnh lên qua Admin Media Library rồi paste URL vào CMS)
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.enrollment',
    '[
      {"image_url": "", "title": "Tuyển sinh lớp học Toán 10-11-12"},
      {"image_url": "", "title": "Lịch khai giảng Toán"},
      {"image_url": "", "title": "Lịch khai giảng Tin học"}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Gallery data
-- Upload ảnh qua Admin > Thư viện Media, sau đó chọn ảnh trong CMS Landing Page > Gallery
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.gallery',
    '[
      {"image_url": "", "title": "Lớp học Toán", "category": "Toán"},
      {"image_url": "", "title": "Phòng máy tính", "category": "Tin học"},
      {"image_url": "", "title": "Sự kiện cuối năm", "category": "Sự kiện"},
      {"image_url": "", "title": "Lớp Toán nâng cao", "category": "Toán"},
      {"image_url": "", "title": "Thực hành lập trình", "category": "Tin học"},
      {"image_url": "", "title": "Lễ trao giải", "category": "Sự kiện"}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Videos data
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.videos',
    '[
      {"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Giới thiệu Minh Math"},
      {"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Hướng dẫn sử dụng hệ thống"}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Sections config (order + visibility) - Figma-like layout management
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.sections_config',
    '[
      {"id": "hero", "label": "Hero Carousel", "visible": true},
      {"id": "exams", "label": "Đề thi nổi bật", "visible": true},
      {"id": "gallery", "label": "Thư viện ảnh", "visible": true},
      {"id": "enrollment", "label": "Tuyển sinh & Lịch khai giảng", "visible": true},
      {"id": "posts", "label": "Bài viết mới nhất", "visible": true},
      {"id": "benefits", "label": "Lợi ích", "visible": true},
      {"id": "videos", "label": "Video giới thiệu", "visible": true},
      {"id": "enrollment_form", "label": "Form đăng ký học", "visible": true},
      {"id": "cta", "label": "Kêu gọi hành động", "visible": true}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Enrollment form section heading
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.enrollment_form_section',
    '{"title": "Đăng ký học ngay hôm nay", "subtitle": "Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Enrollment section heading
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.enrollment_section',
    '{"title": "Tuyển sinh & Lịch khai giảng", "subtitle": "Đăng ký ngay — Số lượng có hạn!"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Gallery section heading
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.gallery_section',
    '{"title": "Thư viện ảnh", "subtitle": "Hình ảnh hoạt động, lớp học và sự kiện"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Videos section heading
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.videos_section',
    '{"title": "Video giới thiệu", "subtitle": "Tìm hiểu thêm về chúng tôi qua video"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;
