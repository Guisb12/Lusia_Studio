"""
LangChain tools for the Wizard agent.

Two interactive tools that pause the agent loop and render UI on the frontend:
  1. ask_questions — renders option selectors for teacher clarification
  2. confirm_and_proceed — renders a confirm button to move to the next phase
"""

from __future__ import annotations

from langchain_core.tools import tool


@tool
def ask_questions(questions: list[dict]) -> str:
    """Ask the teacher 1-3 clarifying questions as a clickable widget.

    Always write a brief conversational message BEFORE calling this tool.
    Prefer collecting multiple questions at once (up to 3) rather than
    asking one at a time across turns. Keep option labels short.

    Each question dict has:
      - question (str): short question text (1 sentence)
      - options (list[str]): 2-4 short option labels
      - type (str): "single_select" or "multi_select" (default: "single_select")

    The teacher can also type a free response instead of picking an option.
    Their answers arrive in the next message as:
      P: <question>
      R: <selected option or free text>

    Example:
      [{"question": "Queres incluir estruturas de mercado?",
        "options": ["Sim, incluir", "Não, focar só no básico", "Incluir apenas monopólios"],
        "type": "single_select"}]
    """
    return "Questions sent to teacher. Awaiting response."


@tool
def confirm_and_proceed(
    summary: str,
    curriculum_codes: list[str] | None = None,
) -> str:
    """Confirm the current selections and move to the next phase.

    Call this when you have enough information and want the teacher to confirm.

    Args:
        summary: A brief summary of what was selected/agreed upon.
        curriculum_codes: (Phase 1 only) The curriculum node IDs that match
            the teacher's described content. Pass an empty list if none apply.
    """
    return f"Confirmed: {summary}"


WIZARD_TOOLS = [ask_questions, confirm_and_proceed]
