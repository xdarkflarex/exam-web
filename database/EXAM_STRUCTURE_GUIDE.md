# 📚 HƯỚNG DẪN CẤU TRÚC ĐỀ THI 3 PHẦN

## 🎯 Tổng Quan

Đề thi được chia thành **3 phần theo loại câu hỏi**, học sinh phải làm **tuần tự** từ Phần I → II → III:

```
┌─────────────────────────────────────────────────┐
│  PHẦN I: CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN       │
│  (multiple_choice - 4 đáp án A/B/C/D)          │
│  Câu 1, 2, 3, ..., n                           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  PHẦN II: CÂU TRẮC NGHIỆM ĐÚNG SAI            │
│  (true_false - Mỗi câu có 4 mệnh đề a/b/c/d)  │
│  Câu 1, 2, 3, ..., m                           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  PHẦN III: CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN      │
│  (short_answer - Điền số vào ô trống)         │
│  Câu 1, 2, 3, ..., p                           │
└─────────────────────────────────────────────────┘
```

---

## 📊 Database Schema

### **1. exam_questions Table**

```sql
CREATE TABLE exam_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  
  -- Loại câu hỏi
  question_type TEXT NOT NULL CHECK (question_type IN (
    'multiple_choice',  -- Phần I
    'true_false',       -- Phần II
    'short_answer'      -- Phần III
  )),
  
  -- Điểm
  score DECIMAL(5,2) DEFAULT 1.0,
  
  -- Phần & Thứ tự
  part_number INTEGER NOT NULL CHECK (part_number IN (1, 2, 3)),
  order_in_part INTEGER NOT NULL,
  
  UNIQUE(exam_id, part_number, order_in_part)
);
```

### **2. exam_attempts Table (Track Progress)**

```sql
CREATE TABLE exam_attempts (
  -- ... other fields ...
  
  -- Part progress
  current_part INTEGER DEFAULT 1,
  part_1_completed BOOLEAN DEFAULT false,
  part_2_completed BOOLEAN DEFAULT false,
  part_3_completed BOOLEAN DEFAULT false,
  
  -- ... other fields ...
);
```

---

## 🔢 Ví Dụ Cấu Trúc Đề Thi

### **Đề thi: "Đề Thi Toán 12 - Học Kỳ 1"**

**Phần I: 20 câu trắc nghiệm 4 phương án**
```sql
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
VALUES 
  ('exam-hk1', 'q-mc-1', 'multiple_choice', 1, 1, 0.25),
  ('exam-hk1', 'q-mc-2', 'multiple_choice', 1, 2, 0.25),
  ('exam-hk1', 'q-mc-3', 'multiple_choice', 1, 3, 0.25),
  -- ... 17 câu nữa ...
  ('exam-hk1', 'q-mc-20', 'multiple_choice', 1, 20, 0.25);
```

**Phần II: 4 câu đúng/sai (mỗi câu 4 mệnh đề)**
```sql
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
VALUES 
  ('exam-hk1', 'q-tf-1', 'true_false', 2, 1, 0.25),
  ('exam-hk1', 'q-tf-2', 'true_false', 2, 2, 0.25),
  ('exam-hk1', 'q-tf-3', 'true_false', 2, 3, 0.25),
  ('exam-hk1', 'q-tf-4', 'true_false', 2, 4, 0.25);
```

**Phần III: 6 câu trả lời ngắn**
```sql
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
VALUES 
  ('exam-hk1', 'q-sa-1', 'short_answer', 3, 1, 0.5),
  ('exam-hk1', 'q-sa-2', 'short_answer', 3, 2, 0.5),
  ('exam-hk1', 'q-sa-3', 'short_answer', 3, 3, 0.5),
  ('exam-hk1', 'q-sa-4', 'short_answer', 3, 4, 0.5),
  ('exam-hk1', 'q-sa-5', 'short_answer', 3, 5, 0.5),
  ('exam-hk1', 'q-sa-6', 'short_answer', 3, 6, 0.5);
```

**Tổng điểm:** 20×0.25 + 4×0.25 + 6×0.5 = 5 + 1 + 3 = **9 điểm**

---

## 🎮 Flow Làm Bài Thi

### **Bước 1: Bắt đầu thi**
```javascript
// Create exam attempt
const attempt = await supabase
  .from('exam_attempts')
  .insert({
    exam_id: 'exam-hk1',
    student_id: userId,
    current_part: 1,  // Bắt đầu từ Phần I
    status: 'in_progress'
  });
```

### **Bước 2: Làm Phần I**
```javascript
// Fetch questions for Part I
const { data: part1Questions } = await supabase
  .from('exam_questions')
  .select('*')
  .eq('exam_id', 'exam-hk1')
  .eq('part_number', 1)
  .order('order_in_part');

// Student answers questions...
// Save answers to student_answers table
```

### **Bước 3: Hoàn thành Phần I → Chuyển sang Phần II**
```javascript
// Mark Part I as completed
await supabase
  .from('exam_attempts')
  .update({
    part_1_completed: true,
    current_part: 2  // Chuyển sang Phần II
  })
  .eq('id', attemptId);
```

### **Bước 4: Làm Phần II & III tương tự**

### **Bước 5: Nộp bài**
```javascript
// Submit exam
await supabase
  .from('exam_attempts')
  .update({
    part_3_completed: true,
    status: 'submitted',
    submit_time: new Date()
  })
  .eq('id', attemptId);

// Trigger calculate_exam_score() sẽ tự động tính điểm
```

---

## 🔒 ANTI-CHEAT FEATURES

### **1. Exam Settings (exams table)**

```sql
CREATE TABLE exams (
  -- ... other fields ...
  
  -- Anti-cheat settings
  allow_dev_tools BOOLEAN DEFAULT false,      -- Chặn F12/DevTools
  allow_tab_switch BOOLEAN DEFAULT false,     -- Chặn chuyển tab
  max_tab_switches INTEGER DEFAULT 0,         -- Số lần chuyển tab cho phép
  require_webcam BOOLEAN DEFAULT false,       -- Yêu cầu bật webcam
  
  -- ... other fields ...
);
```

### **2. Tracking (exam_attempts table)**

```sql
CREATE TABLE exam_attempts (
  -- ... other fields ...
  
  -- Security monitoring
  tab_switches INTEGER DEFAULT 0,
  dev_tools_opened BOOLEAN DEFAULT false,
  suspicious_activities JSONB DEFAULT '[]'::jsonb,
  
  -- Flagging
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  
  -- ... other fields ...
);
```

### **3. Anti-Cheat Logs**

```sql
CREATE TABLE anti_cheat_logs (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dev_tools_opened',
    'tab_switch',
    'window_blur',
    'right_click',
    'copy_paste',
    'network_request',
    'suspicious_timing'
  )),
  
  description TEXT,
  details JSONB,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **4. Auto-Flag Trigger**

```sql
CREATE OR REPLACE FUNCTION check_suspicious_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Flag if dev tools opened
  IF NEW.dev_tools_opened = true THEN
    NEW.is_flagged = true;
    NEW.flag_reason = 'Dev tools detected';
  END IF;
  
  -- Flag if too many tab switches
  IF NEW.tab_switches > (
    SELECT COALESCE(max_tab_switches, 0) 
    FROM exams 
    WHERE id = NEW.exam_id
  ) THEN
    NEW.is_flagged = true;
    NEW.flag_reason = 'Excessive tab switching';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 🛡️ Frontend Anti-Cheat Implementation

### **1. Block DevTools**

```javascript
// Detect DevTools
const detectDevTools = () => {
  const threshold = 160;
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  
  if (widthThreshold || heightThreshold) {
    // Log to anti_cheat_logs
    logAntiCheat('dev_tools_opened', 'DevTools detected', 'high');
    
    // Update exam_attempts
    updateAttempt({ dev_tools_opened: true });
  }
};

// Block right-click
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  logAntiCheat('right_click', 'Right-click blocked', 'low');
});

// Block F12, Ctrl+Shift+I, etc.
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && e.key === 'I') ||
    (e.ctrlKey && e.shiftKey && e.key === 'C') ||
    (e.ctrlKey && e.key === 'U')
  ) {
    e.preventDefault();
    logAntiCheat('dev_tools_opened', 'DevTools shortcut blocked', 'medium');
  }
});
```

### **2. Track Tab Switches**

```javascript
let tabSwitchCount = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    tabSwitchCount++;
    
    // Log to anti_cheat_logs
    logAntiCheat('tab_switch', `Tab switch #${tabSwitchCount}`, 'medium');
    
    // Update exam_attempts
    updateAttempt({ tab_switches: tabSwitchCount });
  }
});

window.addEventListener('blur', () => {
  logAntiCheat('window_blur', 'Window lost focus', 'low');
});
```

### **3. Block Copy/Paste**

```javascript
document.addEventListener('copy', (e) => {
  e.preventDefault();
  logAntiCheat('copy_paste', 'Copy blocked', 'low');
});

document.addEventListener('paste', (e) => {
  e.preventDefault();
  logAntiCheat('copy_paste', 'Paste blocked', 'low');
});
```

### **4. Fullscreen Mode**

```javascript
// Request fullscreen on exam start
const enterFullscreen = () => {
  document.documentElement.requestFullscreen();
};

// Detect fullscreen exit
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    logAntiCheat('window_blur', 'Exited fullscreen', 'medium');
  }
});
```

---

## 📝 Teacher Dashboard - View Flagged Students

```javascript
// Get flagged attempts
const { data: flaggedAttempts } = await supabase
  .from('exam_attempts')
  .select(`
    *,
    profiles:student_id (full_name, email)
  `)
  .eq('exam_id', examId)
  .eq('is_flagged', true);

// Get anti-cheat logs for an attempt
const { data: logs } = await supabase
  .from('anti_cheat_logs')
  .select('*')
  .eq('attempt_id', attemptId)
  .order('created_at', { ascending: false });
```

---

## 🎯 Best Practices

### **1. Không Random Câu Hỏi Giữa Các Phần**
- ✅ Phần I: Câu 1, 2, 3, ..., 20 (multiple_choice)
- ✅ Phần II: Câu 1, 2, 3, 4 (true_false)
- ✅ Phần III: Câu 1, 2, 3, 4, 5, 6 (short_answer)
- ❌ KHÔNG: Câu 1 (MC), Câu 2 (TF), Câu 3 (MC), ...

### **2. Có Thể Shuffle Trong Cùng Phần**
```javascript
// Shuffle questions within Part I only
const shuffledPart1 = shuffleArray(part1Questions);
```

### **3. Lưu Source Exam**
```sql
-- Khi tạo đề thi từ question-bank
INSERT INTO exams (id, title, source_exam, ...)
VALUES ('exam-hk1', 'Đề HK1', 'Đề Thi Toán 12 - Học Kỳ 1 - 2024', ...);
```

### **4. Anti-Cheat Settings**
```sql
-- Đề thi quan trọng (THPT Quốc Gia)
UPDATE exams SET
  allow_dev_tools = false,
  allow_tab_switch = false,
  max_tab_switches = 0,
  require_webcam = true
WHERE id = 'exam-thpt-qg';

-- Đề thi thử (cho phép 3 lần chuyển tab)
UPDATE exams SET
  allow_dev_tools = false,
  allow_tab_switch = true,
  max_tab_switches = 3,
  require_webcam = false
WHERE id = 'exam-test';
```

---

## 🚀 Next Steps

1. ✅ Schema đã update với 3 phần + anti-cheat
2. ⏳ Tạo API routes để log anti-cheat events
3. ⏳ Tạo exam taking interface với 3 phần
4. ⏳ Implement frontend anti-cheat (block dev tools, track tab switch)
5. ⏳ Tạo teacher dashboard để xem flagged students

---

**Lưu ý:** Đây là cấu trúc hiện tại dùng `source_exam` (tên đề). Sau này có thể mở rộng để cho học sinh chọn câu hỏi từ ngân hàng (Phase mở rộng).
