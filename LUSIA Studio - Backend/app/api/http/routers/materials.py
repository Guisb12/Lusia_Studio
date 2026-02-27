from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.http.schemas.materials import (
    CurriculumListOut,
    CurriculumNoteOut,
    MaterialsSubjectCatalogOut,
    UpdateSubjectPreferencesIn,
)
from app.api.http.services.materials_service import (
    get_base_note_by_code,
    get_base_note_by_curriculum_id,
    get_curriculum_titles_batch,
    list_base_subject_catalog,
    list_curriculum_nodes,
    update_subject_preferences,
)
from app.core.database import get_b2b_db, get_content_db
from app.core.security import get_current_user

router = APIRouter()


@router.get("/base/subjects", response_model=MaterialsSubjectCatalogOut)
async def list_base_material_subjects(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """
    Subject picker payload for "Meus Materiais" standard base flow.
    Includes profile-prioritized subjects and grouped load-more buckets.
    """
    return list_base_subject_catalog(db, current_user)


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
    update_subject_preferences(db, current_user["id"], payload.subject_ids)
    return {"success": True}


@router.get("/base/curriculum/titles")
async def batch_curriculum_titles(
    codes: str = Query(..., description="Comma-separated curriculum codes"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_content_db),
):
    """
    Resolve multiple curriculum codes → titles in one query.
    Returns a JSON object mapping code → title.
    Unknown codes map to themselves as a fallback.
    """
    _ = current_user
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    return get_curriculum_titles_batch(db, code_list)


@router.get("/base/curriculum", response_model=CurriculumListOut)
async def list_base_curriculum(
    subject_id: str = Query(..., description="Subject ID (UUID)"),
    year_level: str = Query(..., description="Grade/year (e.g. 10, 11, 12)"),
    parent_id: Optional[str] = Query(
        None,
        description="Optional parent curriculum ID. Omit to get root nodes.",
    ),
    subject_component: Optional[str] = Query(
        None,
        description="Optional component filter for multi-discipline subjects.",
    ),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_content_db),
):
    """
    List curriculum nodes by subject/year, optionally scoped to one parent ID.
    """
    _ = current_user
    return list_curriculum_nodes(
        db,
        subject_id=subject_id,
        year_level=year_level,
        parent_id=parent_id,
        subject_component=subject_component,
    )


@router.get("/base/notes/by-code/{curriculum_code}", response_model=CurriculumNoteOut)
async def get_base_note_by_code_endpoint(
    curriculum_code: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_content_db),
):
    """
    Resolve curriculum by code, then return its base note.
    This is the default navigation flow.
    """
    _ = current_user
    return get_base_note_by_code(db, curriculum_code)


@router.get(
    "/base/notes/by-curriculum/{curriculum_id}",
    response_model=CurriculumNoteOut,
)
async def get_base_note_by_curriculum_endpoint(
    curriculum_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_content_db),
):
    """
    Return base note directly by curriculum_id.
    This supports direct linking and specific fetch cases.
    """
    _ = current_user
    return get_base_note_by_curriculum_id(db, curriculum_id)
