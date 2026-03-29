"""
LangChain tools for the Wizard agent.

Three interactive tools that pause the agent loop and render UI on the frontend:
  1. ask_questions — renders option selectors for teacher clarification
  2. confirm_and_proceed — renders a confirm widget with the selected codes
  3. cancel_conversation — gracefully ends the wizard when the user deviates
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
    curriculum_codes: list[str],
) -> str:
    """Confirm the selected topics and move to the next phase.

    Always write a structured analysis BEFORE calling this tool:
    - List the specific topics that will be covered
    - Mention the focus/depth agreed upon
    - Then call this tool with the codes

    Args:
        curriculum_codes: The curriculum node IDs that match the teacher's
            described content. Must be valid codes from the curriculum tree.
    """
    return f"Confirmed: {', '.join(curriculum_codes)}"


@tool
def cancel_conversation(reason: str) -> str:
    """Cancel the conversation gracefully when the user clearly deviates from the purpose.

    ONLY use this after:
    1. You've warned the user once that this step is for topic selection
    2. The user continues to deviate (asking off-topic questions, requesting
       unrelated things like weather, general chat, etc.)

    Never use this for legitimate clarifications or topic changes within
    the scope of creating educational materials.

    Args:
        reason: A polite explanation of why the conversation was ended.
    """
    return f"Conversation cancelled: {reason}"


WIZARD_TOOLS = [ask_questions, confirm_and_proceed, cancel_conversation]
