# Multi-Grade Subject Selection - Teacher Dashboard

## Overview

Updated the "Meus Materiais" subject selection flow for teachers to select subjects with **ALL grade levels at once**, rather than requiring a specific grade selection for each subject.

## Why This Change?

In the teacher dashboard context:
- Teachers often teach the same subject across multiple grade levels
- Selecting subjects individually for each grade is tedious and unnecessary
- Material organization should show all relevant grades for a subject

## Changes Made

### 1. SubjectSelector Component (`components/materiais/SubjectSelector.tsx`)

**Before:**
- Clicking a subject with multiple grades showed a grade picker
- User had to select one specific grade (e.g., "10º")
- `onToggleSubject` callback required a `grade` parameter

**After:**
- Clicking any subject immediately adds it with ALL its grade levels
- No grade picker needed
- Displays all grade levels as small badges
- `onToggleSubject` callback takes only the subject (no grade parameter)

**Key Changes:**
```typescript
// Before
interface SubjectSelectorProps {
    onToggleSubject: (subject: MaterialSubject, grade: string) => void;
}

// After
interface SubjectSelectorProps {
    onToggleSubject: (subject: MaterialSubject) => void;
}
```

Removed:
- `GradePicker` component (grade selection UI)
- `showGrades` state toggle
- Grade expansion logic

Added:
- `GradeDisplay` component - shows all grades as small badges
- Instant subject selection without intermediate steps

### 2. SubjectsGallery Component (`components/materiais/SubjectsGallery.tsx`)

**Before:**
- Displayed only `selected_grade` (e.g., "10º ano")

**After:**
- Displays all `grade_levels` for each subject
- Shows up to 3 grades, then "+N" for remainder
- Grade badges styled to match subject color

**Example Display:**
```
Subject Card: Matemática
Grades: 10º 11º 12º
```

### 3. CurriculumNavigator Component (`components/materiais/CurriculumNavigator.tsx`)

**Before:**
- Header showed only `selected_grade`

**After:**
- Header shows all `grade_levels` (e.g., "10, 11, 12º ano · Secundário")
- Still fetches curriculum for first grade level when navigating

### 4. BaseStandardTable Component (`components/materiais/BaseStandardTable.tsx`)

**Before:**
- Required `selected_grade` to fetch curriculum
- Would fail if `selected_grade` was null

**After:**
- Falls back to first grade level: `subject.selected_grade || subject.grade_levels[0] || "10"`
- Displays all grade levels as badges
- Fetches curriculum using first available grade

### 5. Page Logic (`app/(teacher)/dashboard/materiais/page.tsx`)

**Before:**
```typescript
const handleToggleSubject = async (subject: MaterialSubject, grade: string) => {
    const updatedSubjects = [
        ...selectedSubjects,
        { ...subject, is_selected: true, selected_grade: grade }
    ];
    // ...
}
```

**After:**
```typescript
const handleToggleSubject = async (subject: MaterialSubject) => {
    const updatedSubjects = [
        ...selectedSubjects,
        { ...subject, is_selected: true, selected_grade: null }
    ];
    // ...
}
```

## User Experience

### Before (Grade Selection Required)
1. Click "Adicionar disciplina"
2. Click "Matemática"
3. **Choose grade**: 10º, 11º, or 12º
4. Subject appears with selected grade only

### After (Multi-Grade Selection)
1. Click "Selecionar disciplinas..."
2. Click "Matemática"
3. ✅ Subject immediately appears with ALL grades (10º, 11º, 12º)

## Data Model

### MaterialSubject Type

```typescript
interface MaterialSubject {
    id: string;
    name: string;
    grade_levels: string[];      // e.g., ["10", "11", "12"]
    selected_grade: string | null; // Now null for teachers (all grades)
    // ... other fields
}
```

- `grade_levels`: Always contains all available grades for the subject
- `selected_grade`: Set to `null` for teacher dashboard (indicates "all grades")
- For students, could still use `selected_grade` if needed

## Backend Compatibility

**No backend changes required!**
- Subject preferences still stored as array of subject IDs
- `grade_levels` already exists in the subject data
- All curriculum fetching logic has fallback to first grade

## Benefits

1. **Faster Selection**: One click per subject instead of two
2. **Teacher-Focused**: Reflects how teachers actually work (across multiple grades)
3. **Clearer Display**: Shows full scope of each subject's coverage
4. **Backward Compatible**: Fallback logic ensures curriculum loading works

## Testing Checklist

- [ ] Select a subject → appears immediately with all grades
- [ ] Click subject card → CurriculumNavigator shows all grades
- [ ] Expand subject in BaseStandardTable → shows all grades, fetches first grade's curriculum
- [ ] Remove subject → removes from gallery
- [ ] Reload page → subjects persist with correct grades
- [ ] Subject with single grade (e.g., "10º") → displays correctly

## Future Enhancements

If needed, could add:
1. **Grade-specific curriculum view**: Tabs or dropdown to switch between grades in CurriculumNavigator
2. **Grade filtering**: Filter materials by specific grade in BaseStandardTable
3. **Student mode**: Keep single-grade selection for student dashboard (if different UX desired)
