# Subject Preferences - Test Plan

## Test Scenarios

### 1. Add Subject
**Steps:**
1. Navigate to "Meus Materiais" page
2. Click "Selecionar disciplinas..." button (formerly "Adicionar disciplina")
3. Select a subject and choose a grade level
4. Close the dialog

**Expected:**
- Subject appears in the gallery
- Database `profiles.subject_ids` is updated with the new subject ID
- Console shows no errors

**Verify:**
- Reload the page - subject should still be selected
- Check network tab for PATCH `/api/materials/subject-preferences` with `subject_ids` array

### 2. Remove Subject
**Steps:**
1. Have at least one subject selected
2. Click "Selecionar disciplinas..." button
3. Click the X button on a selected subject

**Expected:**
- Subject is removed from the gallery
- Database `profiles.subject_ids` is updated (subject ID removed)
- Console shows no errors

**Verify:**
- Reload the page - subject should remain removed
- Check network tab for PATCH request with updated `subject_ids` array

### 3. Toggle Subject (Add then Remove)
**Steps:**
1. Add a subject
2. Immediately remove it
3. Add it again

**Expected:**
- Each action triggers a separate PATCH request
- Final state matches the last action
- No race conditions or stale data

### 4. Multiple Subject Changes
**Steps:**
1. Add 3 different subjects in sequence
2. Remove 1 subject
3. Add 2 more subjects
4. Reload the page

**Expected:**
- All 4 subjects (3 + 2 - 1) are still selected after reload
- Database has correct array of 4 subject IDs

### 5. Error Handling
**Steps:**
1. Simulate network error (disable backend)
2. Try to add a subject

**Expected:**
- UI updates optimistically (shows subject)
- Error is logged in console
- User is not blocked from continuing
- After backend recovers and page reloads, old state is restored (subject not saved)

### 6. Cross-User Isolation
**Steps:**
1. User A selects subjects X, Y, Z
2. User B (different account) selects subjects A, B, C
3. Both reload their pages

**Expected:**
- User A sees only X, Y, Z
- User B sees only A, B, C
- No cross-contamination

## API Contract

### Request
```
PATCH /api/materials/subject-preferences
Content-Type: application/json

{
  "subject_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

### Response
```json
{
  "success": true
}
```

## Database Verification

Check the database directly:

```sql
SELECT id, full_name, subject_ids
FROM profiles
WHERE email = 'test@example.com';
```

Should return an array of UUIDs matching selected subjects.

## Known Limitations

1. **Optimistic Updates**: UI updates immediately before backend confirmation
2. **No Rollback**: If backend fails, user must refresh to see correct state
3. **No Debouncing**: Rapid clicks create multiple requests (acceptable for now)
4. **No Loading State**: No spinner during save (by design - optimistic)

## Future Enhancements

1. Add toast notification on successful save
2. Add retry logic for failed requests
3. Debounce multiple rapid changes
4. Show loading indicator for slow networks
5. Cache invalidation for user context after update
