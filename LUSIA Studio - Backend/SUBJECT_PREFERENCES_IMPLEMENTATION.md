# Subject Preferences Implementation

## Overview

Implemented persistent storage of user subject preferences in "Meus Materiais". When users add or remove subjects, their choices are now saved to `profiles.subject_ids` in the database.

## Backend Changes

### 1. Schema (`app/api/http/schemas/materials.py`)

Added new schema for updating subject preferences:

```python
class UpdateSubjectPreferencesIn(BaseModel):
    subject_ids: list[str] = Field(
        ...,
        description="List of subject IDs to save as user preferences"
    )
```

### 2. Service (`app/api/http/services/materials_service.py`)

Added service function to update profile:

```python
def update_subject_preferences(db: Client, user_id: str, subject_ids: list[str]) -> None:
    """
    Update user's subject preferences (profiles.subject_ids).
    Stores the list of subject IDs the user has selected in "Meus Materiais".
    """
```

### 3. Router (`app/api/http/routers/materials.py`)

Added PATCH endpoint:

```python
@router.patch("/base/subject-preferences")
async def update_material_subject_preferences(
    payload: UpdateSubjectPreferencesIn,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """
    Update user's subject preferences for "Meus Materiais".
    Stores selected subject IDs in profiles.subject_ids.
    """
```

**Endpoint**: `PATCH /api/v1/materials/base/subject-preferences`

## Frontend Changes

### 1. API Client (`lib/materials.ts`)

Added function to call the backend:

```typescript
export async function updateSubjectPreferences(
    subjectIds: string[],
): Promise<void> {
    const res = await fetch("/api/materials/subject-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_ids: subjectIds }),
    });
    if (!res.ok) throw new Error(`Failed to update subject preferences: ${res.status}`);
}
```

### 2. API Route (`app/api/materials/subject-preferences/route.ts`)

Created Next.js API route to proxy requests:

```typescript
export async function PATCH(request: NextRequest) {
    const body = await request.json();
    return proxyAuthedJson("/api/v1/materials/base/subject-preferences", "PATCH", body);
}
```

### 3. Page Logic (`app/(teacher)/dashboard/materiais/page.tsx`)

Updated subject toggle/remove handlers to persist changes:

```typescript
const handleToggleSubject = async (subject: MaterialSubject, grade: string) => {
    // Update local state
    const updatedSubjects = ...;
    setSelectedSubjects(updatedSubjects);

    // Persist to backend
    try {
        await updateSubjectPreferences(updatedSubjects.map((s) => s.id));
    } catch (err) {
        console.error("Failed to save subject preferences", err);
    }
};
```

## Data Flow

1. User clicks subject in SubjectSelector dialog
2. `handleToggleSubject()` or `handleRemoveSubject()` is called
3. Local state is updated immediately (optimistic update)
4. `updateSubjectPreferences()` is called with new subject ID list
5. Frontend API route proxies request to backend
6. Backend updates `profiles.subject_ids` in database
7. On next page load, subjects are restored from database

## Database Schema

The `profiles` table already includes:

```sql
subject_ids text[]  -- Array of subject UUIDs
```

This field is used by:
- **Students**: To store their selected subjects
- **Teachers**: Can also use this (alternatively uses `subjects_taught`)

## Notes

- Changes persist immediately on toggle/remove
- Errors are logged but don't block UI updates (optimistic)
- Subject preferences are user-scoped (not organization-scoped)
- The backend reads from both `subject_ids` and `subjects_taught` for backwards compatibility
