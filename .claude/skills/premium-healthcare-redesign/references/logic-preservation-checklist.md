# Logic Preservation Checklist

This checklist ensures that existing React logic remains 100% intact during visual redesigns.

## Critical Rules - Never Break These

### 1. Hooks Must Stay Identical
**Rule**: All hooks must remain in the exact same order with identical dependencies.

**Examples of what NOT to change:**
```jsx
// ❌ DON'T reorder hooks
// ❌ DON'T add/remove hooks
// ❌ DON'T change dependency arrays
// ❌ DON'T modify hook logic

// Original
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
useEffect(() => {
  fetchData();
}, [userId]);

// ✅ KEEP EXACTLY AS IS - only change JSX/styling
```

**What you CAN change:**
- How the hook's return values are displayed
- CSS classes on elements that use hook values
- Layout and positioning of rendered data

### 2. State Management Stays Untouched
**Rule**: All state variables, setters, and state logic must remain identical.

**Protected elements:**
- `useState` declarations and their setters
- Context providers and consumers
- Redux/Zustand stores and their selectors
- Any state-related logic

**What you CAN change:**
- How state is visually displayed
- Styling of elements that reflect state
- Layout organization of stateful components

### 3. API Calls Are Sacred
**Rule**: Backend communication must not change in any way.

**Protected elements:**
- Fetch/axios calls and their parameters
- Request payloads and structure
- Response handling logic
- Error handling for API calls
- API endpoints and query parameters

**Examples of what NOT to change:**
```jsx
// ❌ DON'T modify this
const response = await fetch('/api/patients', {
  method: 'POST',
  body: JSON.stringify({ name, age, condition })
});

// ❌ DON'T add/remove parameters
// ❌ DON'T change payload structure
// ❌ DON'T modify error handling
```

**What you CAN change:**
- Loading spinners and visual feedback
- Success/error message styling
- Layout of data after it's fetched

### 4. Event Handlers Must Persist
**Rule**: All onClick, onChange, onSubmit handlers must remain connected and functional.

**Protected elements:**
- Event handler functions
- Handler logic and parameters
- Form submission handlers
- Input change handlers

**What you CAN change:**
- Visual appearance of interactive elements
- Button/input styling
- Layout of form fields
- Feedback animations (as long as handler still fires)

**Example:**
```jsx
// Original
<button onClick={handleSubmit}>Submit</button>

// ✅ GOOD - handler preserved
<button 
  onClick={handleSubmit}
  className="px-6 py-3 bg-blue-600 text-white rounded-xl"
>
  Submit Application
</button>

// ❌ BAD - handler modified
<button onClick={() => handleSubmit(newParam)}>Submit</button>
```

### 5. Props Must Flow Unchanged
**Rule**: Component props and their structure must remain identical.

**Protected elements:**
- Props passed to child components
- Prop destructuring patterns
- Default prop values
- PropTypes or TypeScript interfaces

**What you CAN change:**
- How props are visually rendered
- Styling of elements that use props
- Layout of prop-dependent content

### 6. Conditional Rendering Logic Preserved
**Rule**: All if statements, ternaries, and conditional logic must remain unchanged.

**Protected elements:**
```jsx
// ❌ DON'T change these conditions
{loading && <Spinner />}
{error ? <ErrorMessage /> : <Content />}
{user.role === 'admin' && <AdminPanel />}
```

**What you CAN change:**
- Visual appearance of conditionally rendered elements
- Styling of branches
- Layout within conditional blocks

## Pre-Redesign Analysis Checklist

Before starting the redesign, identify and document:

- [ ] **All hooks used** (useState, useEffect, useCallback, useMemo, custom hooks)
- [ ] **State variables** and their setters
- [ ] **API endpoints** called and their parameters
- [ ] **Event handlers** (onClick, onChange, onSubmit, etc.)
- [ ] **Props** received and passed down
- [ ] **Conditional rendering** patterns
- [ ] **Form validation** logic
- [ ] **Side effects** (useEffect dependencies)
- [ ] **Context** usage
- [ ] **Refs** used

## During Redesign - Continuous Verification

As you redesign, continuously verify:

1. **Hook count and order unchanged**: Same number of hooks in same order
2. **Function signatures intact**: Event handlers have same parameters
3. **API calls unmodified**: Same endpoints, payloads, and error handling
4. **State flows preserved**: Data flows through components identically
5. **Conditional logic unchanged**: Same if/else and ternary patterns

## Post-Redesign Verification

After redesign, verify these work:

- [ ] All buttons trigger their original handlers
- [ ] Forms submit with correct data structure
- [ ] API calls send/receive correct data
- [ ] Loading states display correctly
- [ ] Error handling works as before
- [ ] State updates trigger correct re-renders
- [ ] Navigation and routing unchanged
- [ ] All user interactions preserved

## Common Pitfalls to Avoid

### Pitfall 1: Breaking Hooks While Styling
```jsx
// ❌ BAD - moved hook inside condition
if (shouldShow) {
  const [value, setValue] = useState('');
}

// ✅ GOOD - hook at top level, conditionally render JSX
const [value, setValue] = useState('');
return shouldShow ? <input value={value} onChange={e => setValue(e.target.value)} /> : null;
```

### Pitfall 2: Modifying API Payloads
```jsx
// Original sends: { patientId, notes }
// ❌ BAD - added extra field
fetch('/api/save', { 
  body: JSON.stringify({ patientId, notes, timestamp: Date.now() })
})

// ✅ GOOD - keep original payload
fetch('/api/save', { 
  body: JSON.stringify({ patientId, notes })
})
```

### Pitfall 3: Disconnecting Event Handlers
```jsx
// ❌ BAD - wrapped in new function that might break logic
<button onClick={() => { 
  console.log('clicked'); 
  handleSave(); 
}}>

// ✅ GOOD - kept original handler
<button onClick={handleSave}>
```

### Pitfall 4: Changing Form Structure
```jsx
// Original has specific name attributes for form data
// ❌ BAD - changed name
<input name="patient_name" />

// ✅ GOOD - preserved name
<input name="patientName" className="new-styling" />
```

## Emergency Recovery

If logic breaks during redesign:

1. **Identify the break**: Use browser console and React DevTools
2. **Compare with original**: Check hooks, handlers, API calls
3. **Revert incrementally**: Undo recent changes until it works
4. **Test thoroughly**: Verify all interactions after fixes
