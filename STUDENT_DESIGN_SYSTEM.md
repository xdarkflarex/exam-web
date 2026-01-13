# Student UI Design System

## Overview

This design system defines the visual language for the Student-facing UI. The goal is to create a **calm, focused, low-stress** learning environment optimized for long exam sessions.

---

## 1. Color Palette

### Primary Accent: Teal
Teal is used for all interactive elements, providing a calm yet visible accent.

```
Light: teal-600 (#0d9488)
Dark:  teal-400 (#2dd4bf) / teal-500 (#14b8a6)
```

### Backgrounds

| Layer | Light Mode | Dark Mode |
|-------|------------|-----------|
| Page | `bg-slate-50` | `dark:bg-slate-950` |
| Card | `bg-white` | `dark:bg-slate-900` |
| Card Alt | `bg-slate-50` | `dark:bg-slate-800` |
| Overlay | `bg-black/30` | `dark:bg-black/60` |

### Text Colors

| Type | Light Mode | Dark Mode |
|------|------------|-----------|
| Primary | `text-slate-800` | `dark:text-white` |
| Secondary | `text-slate-600` | `dark:text-slate-300` |
| Muted | `text-slate-500` | `dark:text-slate-400` |
| Disabled | `text-slate-400` | `dark:text-slate-500` |

### Status Colors (Muted for low-stress)

| Status | Light Mode | Dark Mode |
|--------|------------|-----------|
| Success | `text-green-600 bg-green-50` | `dark:text-green-400 dark:bg-green-900/30` |
| Warning | `text-amber-600 bg-amber-50` | `dark:text-amber-400 dark:bg-amber-900/20` |
| Error | `text-red-600 bg-red-50` | `dark:text-red-400 dark:bg-red-900/20` |

---

## 2. Typography

### Hierarchy

```jsx
// Page Title
<h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">

// Section Title
<h2 className="text-lg font-semibold text-slate-800 dark:text-white">

// Card Title
<h3 className="font-semibold text-slate-800 dark:text-white">

// Body Text
<p className="text-slate-600 dark:text-slate-300">

// Muted Text
<p className="text-sm text-slate-500 dark:text-slate-400">
```

---

## 3. Component Patterns

### Card

```jsx
<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
  {/* content */}
</div>
```

### Exam Card (Clickable)

```jsx
<button className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all group">
  <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400">
    {title}
  </h3>
</button>
```

### Question Card (Exam Runner)

```jsx
<div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-100 dark:border-slate-800">
  {/* Question number badge */}
  <span className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-sm font-bold">
    {number}
  </span>
  {/* Question content */}
</div>
```

---

## 4. Answer Option States

### Multiple Choice

```jsx
// Default
className="border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50"

// Selected
className="border-teal-500 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/20"

// Option Label - Default
className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"

// Option Label - Selected
className="bg-teal-600 dark:bg-teal-500 text-white"
```

### True/False

```jsx
// Default
className="bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"

// Selected True
className="bg-green-500 text-white"

// Selected False
className="bg-red-500 text-white"
```

---

## 5. Button Styles

### Primary Button

```jsx
<button className="px-6 py-3 bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 text-white rounded-xl font-medium transition-colors">
  Button Text
</button>
```

### Secondary Button

```jsx
<button className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
  Button Text
</button>
```

### Ghost Button

```jsx
<button className="text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
  Link Text
</button>
```

---

## 6. Form Inputs

```jsx
<input
  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
/>
```

### Disabled Input

```jsx
<input
  disabled
  className="bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed"
/>
```

---

## 7. Score Display

```jsx
// High Score (>= 8)
className="text-green-600 dark:text-green-400"

// Medium Score (>= 5)
className="text-yellow-600 dark:text-yellow-400"

// Low Score (< 5)
className="text-red-600 dark:text-red-400"
```

### Score Badge

```jsx
<div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
  score >= 8 
    ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
    : score >= 5 
      ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
      : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
}`}>
  {score.toFixed(1)}
</div>
```

---

## 8. Timer States

```jsx
// Normal (> 5 min)
className="text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20"

// Warning (< 5 min)
className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"

// Critical (< 1 min)
className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
```

---

## 9. Header Pattern

```jsx
<header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/90 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-800/50">
  <div className="max-w-6xl mx-auto px-4 sm:px-6">
    <div className="flex items-center justify-between h-14">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      {/* Actions */}
    </div>
  </div>
</header>
```

---

## 10. Modal Pattern

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" />
  
  {/* Modal Content */}
  <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full">
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
        Modal Title
      </h3>
    </div>
    {/* Body */}
    <div className="p-4">
      {/* content */}
    </div>
  </div>
</div>
```

---

## 11. Key UX Principles

1. **Low Contrast in Dark Mode**: Use `slate-900`/`slate-800` instead of pure black
2. **Soft Text**: Use `slate-200`/`slate-300` instead of pure white
3. **Muted Accents**: Use opacity variants like `bg-teal-900/30` for dark mode
4. **Minimal Animations**: Avoid distracting animations during exams
5. **Clear Hierarchy**: Obvious visual distinction between sections
6. **Consistent Spacing**: Use Tailwind's spacing scale consistently
7. **Accessible Focus States**: Always use `focus:ring-2 focus:ring-teal-500`

---

## 12. File Structure

```
src/components/student/
  StudentHeader.tsx    # Minimal header with logo, theme toggle, profile
  index.ts             # Exports

src/components/
  StudentDashboard.tsx # Main dashboard with exam list
  ExamRunner.tsx       # Exam taking interface
  ExamSidebar.tsx      # Timer, progress, navigation
  ConfirmModal.tsx     # Reusable modal

src/app/(student)/student/
  page.tsx             # Dashboard page
  settings/page.tsx    # Settings page
```

---

## Quick Reference

```jsx
// Page wrapper
<div className="min-h-screen bg-slate-50 dark:bg-slate-950">

// Card
bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800

// Text primary
text-slate-800 dark:text-white

// Text secondary
text-slate-500 dark:text-slate-400

// Accent
text-teal-600 dark:text-teal-400
bg-teal-600 dark:bg-teal-500

// Input
bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700

// Hover
hover:bg-slate-50 dark:hover:bg-slate-800/50
```
