# Integrated Curriculum Viewer - Unified Layout

## Overview

Replaced the dialog-based curriculum navigation with a unified, single-view layout where clicking a subject card updates the main content area below with curriculum tree and note viewer.

## Visual Changes

### Before (Dialog-Based)
```
┌─────────────────────────────────────┐
│ [Card] [Card] [Card]  [Add Subject] │
├─────────────────────────────────────┤
│ ┌──────────────────────────────┐    │
│ │ Subject 1                    │    │  ← Expandable table rows
│ │   └─ Curriculum nodes...     │    │
│ └──────────────────────────────┘    │
│ ┌──────────────────────────────┐    │
│ │ Subject 2                    │    │
│ └──────────────────────────────┘    │
└─────────────────────────────────────┘

Click card → Dialog opens with curriculum tree + note
```

### After (Integrated Layout)
```
┌─────────────────────────────────────────────┐
│ [Card] [Card] [Card]  [Selecionar...]       │  ← Smaller cards (200x140)
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 📚 Matemática - Secundário   [10º][11º] │ │  ← Subject header + grade selector
│ ├───────────────┬─────────────────────────┤ │
│ │ Curriculum    │ Note Viewer             │ │
│ │ Tree          │                         │ │
│ │               │                         │ │
│ │ • Álgebra     │ [Note content renders   │ │
│ │   └─ Linear   │  here when you click a  │ │
│ │ • Geometria   │  topic from the tree]   │ │
│ │               │                         │ │
│ └───────────────┴─────────────────────────┘ │
└─────────────────────────────────────────────┘

Click card → Updates content area below (no dialog)
```

## Component Changes

### 1. SubjectsGallery (Cards Made Smaller)

**Before:**
- Card size: `260px × 180px`
- Icon size: `40px × 40px`
- Shows up to 3 grade badges

**After:**
- Card size: `200px × 140px` (23% smaller)
- Icon size: `32px × 32px`
- Shows up to 2 grade badges
- More compact styling throughout

**Visual Adjustments:**
- Reduced padding: `p-5` → `p-4`
- Smaller text: `text-base` → `text-sm`
- Tighter grade badges: `text-[10px]` → `text-[9px]`
- Smaller decorative papers

### 2. IntegratedCurriculumViewer (NEW)

Replaces both `BaseStandardTable` and `CurriculumNavigator` dialog.

**Structure:**
```typescript
<section>
  {/* Header with subject name + inline grade selector */}
  <div>
    <Icon + Subject Name + Education Level>
    <Grade Selector Tabs>
  </div>

  {/* Split view: Curriculum (left) + Notes (right) */}
  <div className="flex">
    {/* Left: Curriculum Tree - 360px wide */}
    <div>
      <TreeNode recursive structure>
    </div>

    {/* Right: Note Viewer - flexible width */}
    <div>
      <NoteViewer>
    </div>
  </div>
</section>
```

**Features:**
- Subject header with icon, name, education level
- Inline grade selector (horizontal tabs)
- Curriculum tree navigation (left panel, 360px)
- Note content viewer (right panel, flexible)
- Empty states for all scenarios
- Loading indicators for tree and notes
- Smooth transitions between grades

### 3. Page Layout Updates

**Removed:**
- `CurriculumNavigator` dialog component
- `BaseStandardTable` component
- Dialog state management (`navigatorOpen`, `navigatorSubject`, `navigatorNode`)

**Added:**
- `activeSubject` state (tracks selected subject)
- `IntegratedCurriculumViewer` component
- Auto-selection of first subject on load

**Flow:**
```typescript
1. Page loads → Fetch subjects
2. Auto-select first subject → setActiveSubject(selectedSubjects[0])
3. Click card → Update activeSubject
4. IntegratedCurriculumViewer reacts → Fetch curriculum for new subject
5. Click grade tab → Refetch curriculum for that grade
6. Click tree node → Load and display note
```

## User Experience

### Card Gallery
- **Compact**: More cards visible in same space
- **Clean**: Simplified visual hierarchy
- **Quick**: Click to instantly switch subjects

### Curriculum View
- **Always Visible**: No need to open/close dialogs
- **Contextual**: Header shows current subject + grade
- **Split View**: Tree and notes side-by-side
- **Persistent**: Selection stays when adding new subjects

### Grade Switching
- **Inline**: Grade selector right in the header
- **Instant**: One click to switch grades
- **Visual**: Active grade highlighted in brand-accent

## Technical Details

### State Management

**Page Level:**
```typescript
const [activeSubject, setActiveSubject] = useState<MaterialSubject | null>(null);

// Auto-select first subject
useEffect(() => {
    if (selectedSubjects.length > 0 && !activeSubject) {
        setActiveSubject(selectedSubjects[0]);
    }
}, [selectedSubjects, activeSubject]);
```

**Component Level:**
```typescript
// IntegratedCurriculumViewer manages:
const [selectedGrade, setSelectedGrade] = useState<string>("");
const [rootNodes, setRootNodes] = useState<CurriculumNode[]>([]);
const [treeState, setTreeState] = useState<TreeState>({});
const [activeId, setActiveId] = useState<string | null>(null);
const [noteData, setNoteData] = useState<CurriculumNoteResponse | null>(null);
```

### Data Flow

```
User clicks subject card
    ↓
setActiveSubject(subject)
    ↓
IntegratedCurriculumViewer receives new subject prop
    ↓
useEffect triggers on subject/selectedGrade change
    ↓
fetchCurriculumNodes(subject.id, selectedGrade)
    ↓
Render tree in left panel
    ↓
User clicks tree node
    ↓
handleSelect(node)
    ↓
fetchNoteByCurriculumId(node.id)
    ↓
Render note in right panel
```

### Responsive Considerations

**Current Implementation:**
- Fixed left panel: 360px
- Flexible right panel: Takes remaining space
- Minimum height: 600px

**Future Enhancements:**
- Mobile: Stack panels vertically
- Tablet: Collapsible tree panel
- Desktop: Current layout

## Empty States

### 1. No Subject Selected
```
┌─────────────────────────────────┐
│                                 │
│     📁 Folder Icon              │
│                                 │
│  Seleciona uma disciplina       │
│  Clica num cartão acima para    │
│  ver os materiais               │
│                                 │
└─────────────────────────────────┘
```

### 2. No Curriculum Content
```
Left Panel:
┌─────────────┐
│    📁       │
│  Nenhum     │
│  conteúdo   │
└─────────────┘
```

### 3. No Note Selected
```
Right Panel:
┌─────────────────────┐
│       📄            │
│  Seleciona um       │
│  tópico             │
│                     │
│  Clica num tópico   │
│  do menu para ver   │
│  as notas           │
└─────────────────────┘
```

### 4. Note Unavailable
```
Right Panel:
┌─────────────────────┐
│       📄            │
│  Conteúdo           │
│  indisponível       │
│                     │
│  Este tópico ainda  │
│  não tem notas      │
│  associadas         │
└─────────────────────┘
```

## Benefits

1. **Unified Experience**: No context switching between dialog and main page
2. **Better Space Usage**: Curriculum and notes always visible
3. **Faster Navigation**: One click to switch subjects, no dialog overhead
4. **Clearer Context**: Subject name + grade always visible
5. **More Cards Visible**: Smaller cards = more subjects in viewport
6. **Simpler State**: Removed dialog state management
7. **Better Performance**: No dialog mounting/unmounting

## Comparison

| Aspect | Before (Dialog) | After (Integrated) |
|--------|----------------|-------------------|
| Card Size | 260×180px | 200×140px |
| Subject View | Dialog overlay | Inline content area |
| Context | Modal, blocks page | Always visible |
| Navigation | Open/close dialog | Click to switch |
| Space Usage | Overlays content | Uses available space |
| Tree Width | Fixed in dialog | Fixed left panel |
| Note Width | Fixed in dialog | Flexible right panel |
| Grade Switch | Tabs in dialog | Inline header tabs |

## Testing Checklist

- [ ] Click subject card → Content area updates
- [ ] Click another card → Content smoothly transitions
- [ ] No subjects → Shows "select a subject" empty state
- [ ] Click tree node → Note loads in right panel
- [ ] Click grade tab → Tree reloads for that grade
- [ ] Add new subject → Card appears, can click it
- [ ] Remove subject → If active, shows empty state or switches to next
- [ ] Load page with subjects → First subject auto-selected
- [ ] Tree node with no note → Shows "unavailable" message
- [ ] Loading states → Spinners visible during fetches

## Future Enhancements

1. **Breadcrumbs**: Show path to current note in header
2. **Quick Navigation**: Jump to section within note
3. **Search**: Search within current subject's curriculum
4. **Bookmarks**: Save frequently accessed notes
5. **Print View**: Export note as PDF
6. **Fullscreen Note**: Expand note to full width temporarily
7. **Split Adjustable**: Drag to resize tree/note panels
8. **Keyboard Navigation**: Arrow keys through tree, hotkeys for grades
