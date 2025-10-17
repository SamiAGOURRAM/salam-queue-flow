# 🎨 Quick Visual Guide - Enhanced Queue Manager

## 📱 Layout Structure

### Desktop View (1440px+)
```
┌──────────────────────────────────────────────────────────────────┐
│ Header: View Details: Counter 1              [Settings] [Avatar] │
├───────────────┬──────────────────────────┬───────────────────────┤
│ LEFT          │ CENTER                   │ RIGHT                 │
│ 380px         │ Flexible                 │ 420px                 │
│               │                          │                       │
│ • Teller      │ • Patient Details        │ • Currently Serving   │
│ • Account     │   - Name & Avatar        │ • Queue (0002-0006)   │
│ • Stats       │   - Contact Info         │ • Scroll List         │
│               │   - Service Details      │                       │
│ (Fixed Width) │ (Scrollable)             │ (Fixed Width)         │
├───────────────┴──────────────────────────┴───────────────────────┤
│ Bottom Actions: [Call Random] [Queue Next] [Mark Absent]         │
└──────────────────────────────────────────────────────────────────┘
```

## 🎨 Color Coding System

### Status Colors
```
✅ IN PROGRESS  → Green    bg-green-50   text-green-700   border-green-300
⏳ PENDING      → Orange   bg-orange-50  text-orange-700  border-orange-300
❌ UNATTENDED   → Red      bg-red-50     text-red-700     border-red-300
📅 SCHEDULED    → Purple   bg-purple-50  text-purple-700  border-purple-300
```

### UI Elements
```
Background       → from-slate-50 to-slate-100
Cards            → bg-white border-slate-200 shadow-lg
Text Primary     → text-slate-900
Text Secondary   → text-slate-600
Text Tertiary    → text-slate-500
```

## 🔘 Button Hierarchy

### Primary Action (Center)
```tsx
<Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600">
  Queue Next / Complete & Queue Next
</Button>
```

### Secondary Actions (Sides)
```tsx
<Button size="lg" variant="outline">
  Call Random / Mark Absent
</Button>
```

## 📋 Patient Card Layout

### Currently Serving (Green Theme)
```
┌─────────────────────────────────────┐
│ 🎯 Currently Serving    [In Progress]│
│                                      │
│  [01] Abdul Shakur                   │
│       Ticket 0001                    │
│       ✓ In progress since 5 mins ago │
└─────────────────────────────────────┘
```

### Queue Item (Orange for Next, Gray for Others)
```
┌─────────────────────────────────────┐
│ [02] Abdullaah Jalil    [Pending]   │
│      Application Status  [NEXT]      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ [03] Wong Hooi Ching    [Unattended]│
│      Application Status              │
└─────────────────────────────────────┘
```

## 🎭 Avatar System

### Sizes
```
Teller (Left)     → h-16 w-16 (64px)
Patient (Center)  → h-24 w-24 (96px)
Queue List        → h-11 w-11 (44px)
Header            → h-10 w-10 (40px)
```

### Colors (Gradient Backgrounds)
```tsx
from-blue-500 to-purple-600    // Teller
from-blue-400 to-purple-500    // Patient
bg-green-500                    // Current patient (solid)
bg-orange-500                   // Next patient (solid)
bg-slate-200                    // Other patients (solid)
```

## 📊 Statistics Section (Left Column)

### Format
```
😊 Excellent  ██████████████████░░  140
😐 Waiting    ████████████████████░  210
😕 Absent     ████░░░░░░░░░░░░░░░░   20
```

### Progress Bar Width
```typescript
width: `${(count * multiplier)}%`
// Excellent: count * 10%
// Waiting:   count * 5%
// Absent:    count * 15%
```

## 🎯 Interactive States

### Hover Effects
```css
Card:     hover:shadow-md transition-all
Button:   hover:bg-blue-50 hover:border-blue-300
Avatar:   group-hover:scale-110 transition-all
Actions:  opacity-0 group-hover:opacity-100
```

### Selected State
```css
Patient: border-blue-300 bg-blue-50 shadow-md
```

### Next Patient Highlight
```css
Position: bg-orange-500 text-white
Badge:    bg-orange-500 text-white "Next"
```

## 📐 Spacing Scale

```
Gap Sizes:
gap-1  → 4px    (tight, inline elements)
gap-2  → 8px    (compact, badges)
gap-3  → 12px   (standard, cards)
gap-4  → 16px   (generous, sections)
gap-6  → 24px   (large, major sections)

Padding:
p-3    → 12px   (compact cards)
p-4    → 16px   (standard cards)
p-6    → 24px   (large cards)
p-8    → 32px   (main content)
```

## 🔤 Typography Scale

```
3xl  → 30px   Patient name (center)
2xl  → 24px   Page title
xl   → 20px   Section titles
lg   → 18px   Card titles
base → 16px   Body text, buttons
sm   → 14px   Secondary info
xs   → 12px   Metadata, timestamps
```

## 🎪 Component Hierarchy

```
EnhancedQueueManager
├── Header (fixed)
│   ├── Back Button
│   ├── Title
│   └── User Avatar
│
├── 3-Column Grid
│   ├── Left Column (380px)
│   │   ├── Teller Card
│   │   ├── Account Info Card
│   │   └── Statistics Card
│   │
│   ├── Center Column (flex-1)
│   │   └── Patient Details Card
│   │       ├── Avatar + Header
│   │       ├── Contact Grid
│   │       ├── Service Info
│   │       └── Alerts
│   │
│   └── Right Column (420px)
│       ├── Currently Serving Card
│       └── Queue Listing Card
│           ├── Waiting Patients
│           └── Absent Patients
│
└── Bottom Actions (fixed)
    ├── Call Random
    ├── Queue Next/Complete
    └── Mark Absent
```

## 🎬 Animation Timings

```typescript
Standard:  transition-all duration-200
Smooth:    ease-in-out
Pulse:     animate-pulse (status indicator)
Spin:      animate-spin (loading)
```

## 🎯 Z-Index Layers

```
Base:           z-0   (cards, content)
Dropdown:       z-10  (menus)
Sticky Header:  z-20  (navigation)
Overlay:        z-30  (modals)
Tooltip:        z-40  (hints)
```

## 📱 Responsive Breakpoints

```typescript
sm:   640px   → Stack columns
md:   768px   → 2 columns
lg:   1024px  → 3 columns
xl:   1280px  → Full layout
2xl:  1536px  → Max width contained
```

## ✅ Accessibility Checklist

- [x] Keyboard navigation support
- [x] Focus visible on interactive elements
- [x] Color contrast ratio > 4.5:1
- [x] Touch targets minimum 44x44px
- [x] Semantic HTML structure
- [x] ARIA labels where needed
- [x] Loading states clearly indicated
- [x] Error states prominently displayed

---

**Pro Tip**: Use Chrome DevTools to inspect specific colors and spacing values in real-time during development.
