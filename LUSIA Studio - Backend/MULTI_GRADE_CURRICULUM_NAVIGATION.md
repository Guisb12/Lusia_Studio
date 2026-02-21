# Multi-Grade Curriculum Navigation

## Overview

Added grade selector tabs/buttons to allow teachers to browse curriculum across all grade levels for each subject, rather than being locked to the first grade level.

## Problem

Previously, when a teacher selected a subject with multiple grade levels (e.g., Matemática for 10º, 11º, 12º), the system would:
- Only fetch curriculum for the FIRST grade level (10º)
- Teachers couldn't view materials for 11º or 12º
- Curriculum was locked to one grade despite selecting multiple

## Solution

Added **interactive grade selectors** in two places:
1. **CurriculumNavigator** (full curriculum tree dialog)
2. **BaseStandardTable** (quick curriculum view on main page)

### 1. CurriculumNavigator Changes

**Added:**
- State for `selectedGrade` (defaults to first grade level)
- Grade selector tabs in header (only shown when subject has multiple grades)
- Clicking a grade tab refetches entire curriculum tree for that grade

**UI Location:**
- Header section, below subject name
- Displays as horizontal tabs: `10º | 11º | 12º`
- Active grade highlighted in brand-accent color

**Code:**
```typescript
const [selectedGrade, setSelectedGrade] = useState<string>("");

// Initialize grade when subject changes
useEffect(() => {
    if (subject && subject.grade_levels && subject.grade_levels.length > 0) {
        setSelectedGrade(subject.selected_grade || subject.grade_levels[0]);
    }
}, [subject]);

// Refetch curriculum when grade changes
useEffect(() => {
    if (!open || !subject || !selectedGrade) return;
    // Fetch curriculum for selectedGrade
}, [open, subject, selectedGrade]);
```

### 2. BaseStandardTable Changes

**Added:**
- State for `selectedGrade` per subject section
- Grade selector buttons in subject row header
- Clicking a grade button:
  1. Updates `selectedGrade`
  2. Resets curriculum state (nodes, expanded, children)
  3. Refetches curriculum for new grade

**UI Location:**
- Subject row header, after education level badge
- Only shown when subject has multiple grades
- Interactive buttons with hover states

**Code:**
```typescript
const [selectedGrade, setSelectedGrade] = useState<string>(
    subject.selected_grade || subject.grade_levels[0] || "10"
);

// Refetch when grade changes (if section is expanded)
useEffect(() => {
    if (sectionExpanded && nodes.length === 0) {
        fetchCurriculumNodes(subject.id, selectedGrade)
            .then((data) => setNodes(data.nodes))
            // ...
    }
}, [sectionExpanded, nodes.length, subject.id, selectedGrade]);

// Grade button click handler
onClick={(e) => {
    e.stopPropagation();
    if (grade !== selectedGrade) {
        setSelectedGrade(grade);
        setNodes([]);         // Reset curriculum
        setExpanded({});      // Reset expanded state
        setChildrenMap({});   // Reset children
    }
}}
```

## User Experience

### CurriculumNavigator

**Before:**
1. Click subject card → Opens curriculum for 10º only
2. No way to view 11º or 12º materials

**After:**
1. Click subject card → Opens curriculum for 10º (default)
2. Click "11º" tab → Curriculum reloads for 11º
3. Click "12º" tab → Curriculum reloads for 12º
4. ✅ Full navigation across all grade levels

### BaseStandardTable

**Before:**
1. Expand subject → Shows curriculum for 10º only
2. Grade badges were static (not clickable)

**After:**
1. Expand subject → Shows curriculum for 10º (default)
2. Click "11º" button → Curriculum reloads for 11º
3. Click "12º" button → Curriculum reloads for 12º
4. Active grade highlighted in brand-accent color

## Visual Design

### Grade Selector Tabs (CurriculumNavigator)
```
┌─────────────────────────────────────┐
│ 📚 Matemática                       │
│    Secundário                       │
│                                     │
│ Ano: [10º] [11º] [12º]            │ ← Interactive tabs
└─────────────────────────────────────┘
```

- Active grade: Brand-accent background, white text
- Inactive grades: Light background, gray text
- Hover state: Darker background

### Grade Selector Buttons (BaseStandardTable)
```
[Chevron] [Icon] Matemática  [Secundário] [10º] [11º] [12º]
                                          ↑ Clickable buttons
```

- Active grade: Brand-accent background, white text
- Inactive grades: Light background, gray text
- Hover state: Darker background

## Technical Details

### State Management

Each component manages its own `selectedGrade` state:
- **CurriculumNavigator**: Single state for the dialog
- **BaseStandardTable**: Per-subject state (each SubjectSection)

### Data Flow

```
User clicks grade button
    ↓
Update selectedGrade state
    ↓
(BaseStandardTable only: Reset nodes/expanded/children)
    ↓
useEffect triggers
    ↓
fetchCurriculumNodes(subject.id, selectedGrade)
    ↓
Update curriculum tree
    ↓
Re-render with new data
```

### API Calls

- **fetchCurriculumNodes** already supported `year_level` parameter
- No backend changes needed
- Each grade change triggers a fresh API call

## Benefits

1. **Complete Access**: Teachers can view curriculum for ALL grade levels
2. **Flexible Navigation**: Switch grades without closing/reopening dialogs
3. **Clear Indication**: Active grade always visible and highlighted
4. **Efficient**: Only fetches curriculum when needed (lazy loading)
5. **User-Friendly**: One click to switch grades

## Edge Cases Handled

1. **Single Grade Subject**: Grade selector hidden (no tabs/buttons shown)
2. **No Grades**: Defaults to "10" as fallback
3. **Dialog Close**: Grade selection persists during session
4. **Multiple Subjects**: Each subject in BaseStandardTable has independent grade selection

## Future Enhancements

1. **Remember Last Selected Grade**: Store in localStorage or user preferences
2. **Grade-Specific Indicators**: Show which grades have content vs. which are empty
3. **Keyboard Navigation**: Arrow keys to switch between grades
4. **Grade Comparison**: Side-by-side view of curriculum across grades
5. **Deep Linking**: URL parameter to open specific subject + grade directly

## Testing Checklist

- [ ] Open CurriculumNavigator → See grade tabs (if multiple grades)
- [ ] Click different grade tab → Curriculum reloads for that grade
- [ ] Expand subject in BaseStandardTable → See grade buttons
- [ ] Click different grade button → Curriculum reloads for that grade
- [ ] Active grade is highlighted in brand-accent color
- [ ] Subject with single grade → No grade selector shown
- [ ] Multiple subjects → Independent grade selection per subject
- [ ] Close and reopen dialog → Grade selection resets to first grade
