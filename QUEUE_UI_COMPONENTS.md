# 🎨 UI Component Examples - Queue Manager

## 🎯 Copy-Paste Ready Components

### 1. Status Badge Component
```tsx
// Usage: Display patient status with consistent colors
<Badge 
  variant="outline" 
  className={cn(
    "text-xs font-medium",
    status === "IN_PROGRESS" && "bg-green-100 text-green-700 border-green-300",
    status === "WAITING" && "bg-orange-100 text-orange-700 border-orange-300",
    status === "ABSENT" && "bg-red-100 text-red-700 border-red-300"
  )}
>
  {statusText}
</Badge>
```

### 2. Patient Avatar with Initials
```tsx
// Usage: Display patient avatar with gradient background
<Avatar className="h-24 w-24 border-4 border-white shadow-xl">
  <AvatarImage src={patient.photoUrl} />
  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white text-3xl font-bold">
    {getInitials(patient.fullName)}
  </AvatarFallback>
</Avatar>

// Helper function
const getInitials = (name?: string) => {
  if (!name) return "P";
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};
```

### 3. Queue Position Badge
```tsx
// Usage: Display position number with dynamic styling
<div className={cn(
  "h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg shadow-sm",
  isNext 
    ? "bg-orange-500 text-white shadow-md" 
    : "bg-slate-200 text-slate-700"
)}>
  {position.toString().padStart(2, '0')}
</div>
```

### 4. Info Field with Icon
```tsx
// Usage: Display labeled information with icon
<div>
  <label className="text-sm font-medium text-slate-600 mb-2 block">
    Phone Number<span className="text-red-500">*</span>
  </label>
  <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2">
    <Phone className="h-4 w-4 text-slate-400" />
    <p className="text-slate-900 font-mono">
      {phoneNumber}
    </p>
  </div>
</div>
```

### 5. Progress Bar with Emoji
```tsx
// Usage: Visual statistics display
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <span className="text-2xl">😊</span>
    <span className="text-sm text-slate-600">Excellent</span>
  </div>
  <div className="flex-1 mx-4">
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div 
        className="h-full bg-green-500 rounded-full transition-all duration-500" 
        style={{ width: `${percentage}%` }} 
      />
    </div>
  </div>
  <span className="text-sm font-semibold text-slate-700">{count}</span>
</div>
```

### 6. Action Button with Icon
```tsx
// Primary action button
<Button
  onClick={handleAction}
  disabled={loading}
  size="lg"
  className="flex-1 h-14 text-base font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all"
>
  <ChevronRight className="mr-3 h-5 w-5" />
  Queue Next
</Button>

// Secondary action button
<Button
  onClick={handleAction}
  disabled={loading}
  size="lg"
  variant="outline"
  className="flex-1 h-14 text-base font-semibold border-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
>
  <PhoneCall className="mr-3 h-5 w-5" />
  Call Random
</Button>
```

### 7. Interactive Queue Card
```tsx
// Usage: Clickable patient card in queue
<div
  onClick={() => setSelectedPatient(patient)}
  className={cn(
    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md",
    isSelected
      ? "border-blue-300 bg-blue-50 shadow-md"
      : "border-slate-200 bg-white hover:border-slate-300"
  )}
>
  <div className={cn(
    "h-11 w-11 rounded-full flex items-center justify-center font-bold text-base shadow-sm",
    isNext ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"
  )}>
    {position.toString().padStart(2, '0')}
  </div>
  
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-0.5">
      <p className="font-semibold text-slate-900 truncate text-sm">
        {patient.fullName}
      </p>
      {isNext && (
        <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0">
          Next
        </Badge>
      )}
    </div>
    <p className="text-xs text-slate-500 truncate">{serviceName}</p>
  </div>
  
  <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 text-xs">
    Pending
  </Badge>
</div>
```

### 8. Alert Card Component
```tsx
// Usage: Display important notifications
<div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
  <div className="flex items-center gap-2 mb-1">
    <AlertTriangle className="h-4 w-4 text-orange-600" />
    <p className="font-medium text-orange-900">Patient Skipped</p>
  </div>
  <p className="text-sm text-orange-700">
    This patient has been skipped {skipCount} time(s)
  </p>
</div>
```

### 9. Stats Card with Icon
```tsx
// Usage: Display key metrics
<Card className="shadow-lg border-slate-200">
  <CardContent className="pt-6">
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-600">Waiting</p>
        <p className="text-3xl font-bold text-orange-600">{count}</p>
        <p className="text-xs text-slate-500">patients in queue</p>
      </div>
      <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
        <Users className="h-6 w-6 text-orange-600" />
      </div>
    </div>
  </CardContent>
</Card>
```

### 10. Empty State Component
```tsx
// Usage: Display when queue is empty
<div className="flex-1 flex items-center justify-center py-12">
  <div className="text-center space-y-3">
    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
      <Users className="h-8 w-8 text-slate-300" />
    </div>
    <div>
      <p className="font-medium text-slate-700">No patients waiting</p>
      <p className="text-sm text-slate-500">Queue is empty</p>
    </div>
  </div>
</div>
```

### 11. Loading State
```tsx
// Usage: Display while data is loading
<div className="flex items-center justify-center p-16">
  <div className="text-center space-y-4">
    <RefreshCw className="h-10 w-10 animate-spin text-primary mx-auto" />
    <p className="text-sm text-muted-foreground">Loading queue...</p>
  </div>
</div>
```

### 12. Error State
```tsx
// Usage: Display error with retry option
<Card className="border-destructive/50 bg-destructive/5">
  <CardHeader>
    <CardTitle className="flex items-center text-destructive gap-2">
      <AlertCircle className="h-5 w-5" />
      Error Loading Queue
    </CardTitle>
    <CardDescription>{error.message}</CardDescription>
  </CardHeader>
  <CardContent>
    <Button onClick={refreshQueue} variant="outline">
      <RefreshCw className="mr-2 h-4 w-4" />
      Retry
    </Button>
  </CardContent>
</Card>
```

## 🎨 Color Palette Reference

### Status Colors
```css
/* Success / In Progress */
--green-50:  #f0fdf4
--green-100: #dcfce7
--green-500: #22c55e
--green-600: #16a34a
--green-700: #15803d

/* Warning / Pending */
--orange-50:  #fff7ed
--orange-100: #ffedd5
--orange-500: #f97316
--orange-600: #ea580c
--orange-700: #c2410c

/* Error / Absent */
--red-50:  #fef2f2
--red-100: #fee2e2
--red-500: #ef4444
--red-600: #dc2626
--red-700: #b91c1c

/* Info / Scheduled */
--purple-50:  #faf5ff
--purple-100: #f3e8ff
--purple-500: #a855f7
--purple-600: #9333ea
--purple-700: #7e22ce

/* Neutral */
--slate-50:  #f8fafc
--slate-100: #f1f5f9
--slate-200: #e2e8f0
--slate-500: #64748b
--slate-600: #475569
--slate-700: #334155
--slate-900: #0f172a
```

## 📏 Spacing System

```typescript
// Tailwind spacing scale (in pixels)
const spacing = {
  1: 4,    // 0.25rem
  2: 8,    // 0.5rem
  3: 12,   // 0.75rem
  4: 16,   // 1rem
  5: 20,   // 1.25rem
  6: 24,   // 1.5rem
  8: 32,   // 2rem
  10: 40,  // 2.5rem
  12: 48,  // 3rem
  16: 64,  // 4rem
  20: 80,  // 5rem
  24: 96,  // 6rem
}
```

## 🎯 Common Utilities

### Date Formatting
```typescript
import { format, formatDistanceToNow } from "date-fns";

// Display time ago
const timeAgo = formatDistanceToNow(date, { addSuffix: true });
// Output: "5 minutes ago"

// Display formatted date
const formattedDate = format(date, 'dd MMM, yyyy');
// Output: "16 Oct, 2025"

// Display time
const formattedTime = format(date, 'HH:mm a');
// Output: "11:23 AM"
```

### Class Name Utility
```typescript
import { cn } from "@/lib/utils";

// Combine classes conditionally
<div className={cn(
  "base-class",
  isActive && "active-class",
  isDisabled && "disabled-class",
  customClassName
)} />
```

### Number Formatting
```typescript
// Pad with zeros
const ticketNumber = position.toString().padStart(4, '0');
// Input: 1 → Output: "0001"

// Format phone number
const formatPhone = (phone: string) => {
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
};
```

## 🎬 Animation Examples

### Fade In Animation
```tsx
<div className="animate-in fade-in duration-300">
  Content appears smoothly
</div>
```

### Slide In from Bottom
```tsx
<div className="animate-in slide-in-from-bottom duration-500">
  Content slides up
</div>
```

### Pulse for Attention
```tsx
<div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
```

### Spin for Loading
```tsx
<RefreshCw className="h-5 w-5 animate-spin" />
```

## 🔗 Useful Links

- **Tailwind CSS Docs**: https://tailwindcss.com/docs
- **shadcn/ui Components**: https://ui.shadcn.com
- **Lucide Icons**: https://lucide.dev
- **date-fns**: https://date-fns.org

---

**Tip**: Save this file as a reference when building new features or modifying the UI!
