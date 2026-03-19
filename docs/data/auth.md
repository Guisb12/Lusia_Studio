---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on auth, profiles, or organizations data layer."
---

# Auth & Identity Domain Entities

Core identity tables: organizations (multi-tenant containers) and profiles (user accounts). Nearly every other table in the system references these two.

---

## Table: `organizations`

**Purpose:** Multi-tenant organization container. Every non-chat entity in the system is scoped to one organization.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `name` | text | Organization display name | NOT NULL |
| `slug` | text | URL-safe identifier | NOT NULL, UNIQUE |
| `email` | text | Organization contact email | NOT NULL |
| `phone` | text | Contact phone number | |
| `address` | text | Street address | |
| `district` | text | District/region | |
| `city` | text | City | |
| `postal_code` | text | Postal code | |
| `billing_email` | text | Billing contact email | |
| `logo_url` | text | Organization logo URL | |
| `max_teachers` | integer | Teacher seat limit | DEFAULT 100 |
| `max_students` | integer | Student seat limit | DEFAULT 1000 |
| `stripe_customer_id` | text | Stripe billing customer ID | UNIQUE |
| `teacher_enrollment_code` | text | Code teachers use to join the org | UNIQUE, normalized to lowercase/trimmed |
| `student_enrollment_code` | text | Code students use to join the org | UNIQUE, normalized to lowercase/trimmed |
| `status` | text | Organization lifecycle status | DEFAULT 'trial', CHECK: 'trial', 'active', 'suspended', 'canceled' |
| `deleted_at` | timestamptz | Soft delete timestamp | |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

**Note:** This table was created outside of the numbered migration files (likely via Supabase dashboard or initial setup). Migration 003 normalizes enrollment codes to lowercase/trimmed.

### Indexes

No explicit indexes defined in migrations beyond the primary key. Organization lookups are primarily by `id` (PK) and by enrollment codes (during onboarding).

### Relationships

- Organizations are the root of the multi-tenant hierarchy. Almost every other table has `organization_id` → `organizations.id`.
- Each organization has many profiles (users), classrooms, subjects, calendar sessions, assignments, artifacts, document jobs, and questions.
- Enrollment codes allow teachers and students to self-register into the organization during onboarding.

### Access Patterns

**Service:** `auth_service.py`, `enrollment_service.py`

- **Get by ID:** `.eq("id", org_id).limit(1)` — used after auth to load the user's org context.
- **Lookup by enrollment code:** `.eq("teacher_enrollment_code", code)` or `.eq("student_enrollment_code", code)` — used during onboarding to find which org a code belongs to.
- **Create:** `.insert({name, slug, email, teacher_enrollment_code, student_enrollment_code, status: "trial", ...})` — during center creation in onboarding.
- **Update:** `.update({...}).eq("id", org_id)` — admin profile/settings updates.

---

## Table: `profiles`

**Purpose:** User profiles for all application users. Links a Supabase Auth user to an organization with a role (admin, teacher, student) and stores personal/contact details.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key (matches auth.users.id) | PK |
| `organization_id` | uuid | Owning organization | FK → organizations(id), NOT NULL |
| `email` | text | User email address | |
| `full_name` | text | Full legal name | |
| `display_name` | text | Preferred display name | |
| `avatar_url` | text | Profile picture URL | |
| `role` | text | User role in the organization | NOT NULL, CHECK: 'admin', 'teacher', 'student' |
| `status` | text | Account status | DEFAULT 'pending_approval', CHECK: 'pending_approval', 'active', 'suspended' |
| `phone` | text | Contact phone number | |
| `grade_level` | text | Student's grade level (e.g., '10') | Student-only |
| `course` | text | Student's course track | Student-only |
| `school_name` | text | Student's school name | Student-only |
| `subject_ids` | uuid[] | Subjects associated with this user | Array of subject references |
| `subjects_taught` | uuid[] | Subject IDs taught (teacher) | Teacher-only |
| `class_ids` | uuid[] | Classrooms the user belongs to | Array of classroom references |
| `parent_name` | text | Parent/guardian name | Student-only |
| `parent_email` | text | Parent/guardian email | Student-only |
| `parent_phone` | text | Parent/guardian phone | Student-only |
| `hourly_rate` | numeric(8,2) | Teacher's hourly rate | Teacher-only, added in migration 009 |
| `onboarding_completed` | boolean | Whether user has completed onboarding | NOT NULL, DEFAULT false, added in migration 003 |
| `last_login_at` | timestamptz | Last login timestamp | Added in migration 003 |
| `created_at` | timestamptz | Account creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last profile update | |

**Note:** This table was created outside of the numbered migration files. Columns `onboarding_completed` and `last_login_at` were added in migration 003. Column `hourly_rate` was added in migration 009. Column `course` was added in migration 008 (on `student_grade_settings`, but profiles also has it).

### Indexes

```
Index: idx_profiles_active_students_org_name
Columns: (organization_id, full_name)
Type: btree composite partial (WHERE role = 'student' AND status = 'active')
Purpose: Serves: student search/sort by name within an org

Index: idx_profiles_active_students_full_name_trgm
Columns: full_name (gin_trgm_ops)
Type: GIN trigram partial (WHERE role = 'student' AND status = 'active')
Purpose: Serves: fuzzy/partial student name search (ILIKE patterns)

Index: idx_profiles_active_students_display_name_trgm
Columns: display_name (gin_trgm_ops)
Type: GIN trigram partial (WHERE role = 'student' AND status = 'active')
Purpose: Serves: fuzzy/partial student display name search

Index: idx_profiles_class_ids_gin
Columns: class_ids
Type: GIN
Purpose: Serves: finding all students in a specific classroom via .contains()
```

### Relationships

- Each profile belongs to one organization (`organization_id` → `organizations.id`).
- Profile `id` matches `auth.users.id` from Supabase Auth — this is the identity link.
- Profiles are referenced as teachers in `calendar_sessions.teacher_id`, `assignments.teacher_id`, `classrooms.teacher_id`.
- Profiles are referenced as students via array columns: `calendar_sessions.student_ids`, `assignments.student_ids`.
- Student-classroom membership is stored as `class_ids` on the profile (not a join table), queried via GIN index.
- Student-subject associations stored as `subject_ids` on the profile.
- Profiles are the parent for all grades domain tables via `student_grade_settings.student_id`, `student_subject_cfd.student_id`, `student_cfs_snapshot.student_id`.

### Access Patterns

**Service:** `members_service.py`

```
SELECT constants:
MEMBER_LIST_SELECT =
    "id,full_name,display_name,email,role,status,
     avatar_url,grade_level,course,subject_ids,class_ids,
     onboarding_completed,created_at"

MEMBER_DETAIL_SELECT =
    "id,full_name,display_name,email,role,status,
     avatar_url,grade_level,course,school_name,phone,
     subjects_taught,subject_ids,class_ids,
     parent_name,parent_email,parent_phone,
     hourly_rate,onboarding_completed,created_at"
```

- **List members by org + role:** `paginated_query(db, "profiles", filters={"organization_id": org_id, "role": role_filter}, ...)` — supports pagination, role filtering.
- **List by class:** `.contains("class_ids", [classroom_id])` — uses GIN index.
- **Student search:** `.or_(f"full_name.ilike.%{query}%,display_name.ilike.%{query}%")` — uses trigram indexes for fuzzy matching.
- **Batch profile hydration:** `.select("id,full_name,display_name,avatar_url").in_("id", ids)` — called by calendar, assignments, and analytics services to resolve teacher/student names. This is the most frequently batch-queried table.
- **Get by ID:** `.eq("organization_id", org_id).eq("id", member_id).limit(1)` with `MEMBER_DETAIL_SELECT`.
- **Create (onboarding):** `.insert({id: auth_user_id, organization_id, role, full_name, email, ...})`.
- **Update profile:** `.update({...}).eq("organization_id", org_id).eq("id", member_id)`.
- **Soft delete (suspend):** `.update({"status": "suspended"}).eq("organization_id", org_id).eq("id", member_id)` — not hard-deleted.
- **Class membership:** Read-modify-write on `class_ids` array to add/remove classroom references.

---

## Domain Relationships Summary

Organizations and profiles form the identity foundation of the entire system. Every org-scoped table (23 of 24, excluding chat) references `organizations.id`. Profiles serve dual duty: they are the user identity (linked 1:1 to `auth.users`) and the most frequently batch-hydrated table (calendar, assignments, analytics, and classrooms all resolve teacher/student names from profiles). The denormalized array columns on profiles (`class_ids`, `subject_ids`) trade referential integrity for query simplicity — classroom membership and subject associations are checked via GIN indexes with `.contains()` rather than through join tables.
