# Anti-Eye-Strain Design System

## Overview

This design system ensures consistent, **anti-eye-strain** UI across Admin and Student interfaces. Optimized for **60-120 minute exam sessions**.

**Key Principles:**
- NO pure white (#fff) backgrounds
- NO pure black (#000) backgrounds  
- Reduced contrast for cognitive comfort
- UI fades away, content stands out

---

## 1. CSS Variables (globals.css)

### Light Mode (`:root`) - ANTI-EYE-STRAIN
```css
--background: #f1f5f9;        /* slate-100 - softer than white */
--background-card: #e2e8f0;   /* slate-200 - slightly raised */
--foreground: #1e293b;        /* slate-800 - not pure black */
--foreground-secondary: #475569; /* slate-600 */
--foreground-muted: #64748b;   /* slate-500 */
--border: #cbd5e1;             /* slate-300 */
--accent: #0d9488;             /* teal-600 */
```

### Dark Mode (`html.dark`) - ANTI-EYE-STRAIN
```css
--background: #0f172a;         /* slate-900 */
--background-card: #1e293b;    /* slate-800 */
--foreground: #e2e8f0;         /* slate-200 - not pure white */
--foreground: #f1f5f9;         /* slate-100 */
--foreground-secondary: #cbd5e1; /* slate-300 */
--foreground-muted: #64748b;   /* slate-500 */
--border: #334155;             /* slate-700 */
--accent: #2dd4bf;             /* teal-400 */
```

---

## 2. Background Layers (LOCKED)

| Layer | Light Mode | Dark Mode |
|-------|------------|-----------|
| **Page** | `bg-slate-100` | `dark:bg-slate-900` |
| **Card** | `bg-slate-200` | `dark:bg-slate-800` |
| **Overlay** | `bg-slate-100/90` | `dark:bg-slate-900/90` |
| **Elevated** | `bg-slate-200 shadow-sm` | `dark:bg-slate-800` |

### Example
```jsx
<div className="bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700">
  {/* Card content */}
</div>
```

---

## 3. Text Hierarchy

| Type | Light Mode | Dark Mode |
|------|------------|-----------|
| **Primary** | `text-slate-800` | `dark:text-slate-100` |
| **Secondary** | `text-slate-600` | `dark:text-slate-300` |
| **Muted** | `text-slate-500` | `dark:text-slate-400` |
| **Disabled** | `text-slate-400` | `dark:text-slate-500` |

### Example
```jsx
<h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Title</h1>
<p className="text-slate-500 dark:text-slate-400">Subtitle</p>
```

---

## 4. Border Colors

| Type | Light Mode | Dark Mode |
|------|------------|-----------|
| **Default** | `border-slate-100` | `dark:border-slate-700` |
| **Strong** | `border-slate-200` | `dark:border-slate-600` |
| **Hover** | `hover:border-slate-200` | `dark:hover:border-slate-600` |

---

## 5. Accent Colors

### Teal (Primary)
```jsx
// Background
bg-teal-50 dark:bg-teal-900/30

// Text
text-teal-600 dark:text-teal-400

// Hover
hover:bg-teal-100 dark:hover:bg-teal-800
```

### Indigo (Student UI)
```jsx
// Background
bg-indigo-50 dark:bg-indigo-900/30

// Text
text-indigo-600 dark:text-indigo-400
```

### Status Colors
```jsx
// Success
bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400

// Warning
bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400

// Error
bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400

// Info
bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400
```

---

## 6. Interactive States

### Buttons
```jsx
// Primary Button
className="bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-600 text-white"

// Secondary Button
className="bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"

// Danger Button
className="bg-red-600 hover:bg-red-700 text-white"
```

### Input Fields
```jsx
className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500"
```

### Hover States
```jsx
// List item hover
className="hover:bg-slate-50 dark:hover:bg-slate-700/50"

// Card hover
className="hover:shadow-md hover:border-teal-200 dark:hover:border-teal-600"
```

---

## 7. Component Patterns

### Card
```jsx
<div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
    Card Title
  </h3>
  <p className="text-slate-500 dark:text-slate-400">
    Card content
  </p>
</div>
```

### Modal
```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
  <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6">
    {/* Modal content */}
  </div>
</div>
```

### Sidebar Navigation
```jsx
// Active
className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"

// Inactive
className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
```

---

## 8. Hydration Safety

To prevent hydration mismatch:

1. **ThemeContext** blocks render until client-side theme is known:
```tsx
if (theme === null) {
  return null  // Block render until mounted
}
```

2. **layout.tsx** uses `suppressHydrationWarning`:
```tsx
<html lang="vi" suppressHydrationWarning>
```

3. **Theme persistence** uses `localStorage` with system preference fallback:
```tsx
const saved = localStorage.getItem('theme')
const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
const initialTheme = saved ?? system
```

---

## 9. Do's and Don'ts

### ✅ DO
- Use `dark:` prefix for all color classes
- Use opacity modifiers for subtle backgrounds: `dark:bg-teal-900/30`
- Prefer `slate` over `gray` for consistency
- Use `/30` or `/50` opacity for dark mode accent backgrounds
- Test both light and dark modes before committing

### ❌ DON'T
- Use `prefers-color-scheme` media queries (causes hydration issues)
- Use pure black (`#000`) backgrounds - prefer `slate-900` or `slate-950`
- Use pure white (`#fff`) text - prefer `slate-100`
- Forget to add dark mode classes to new components
- Use inline styles for colors

---

## 10. Quick Reference Cheatsheet

```jsx
// Page background
bg-slate-50 dark:bg-slate-950

// Card
bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700

// Text primary
text-slate-800 dark:text-slate-100

// Text secondary
text-slate-500 dark:text-slate-400

// Accent background
bg-teal-50 dark:bg-teal-900/30

// Accent text
text-teal-600 dark:text-teal-400

// Input
bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600

// Hover
hover:bg-slate-50 dark:hover:bg-slate-700
```
