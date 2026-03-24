"""
LangGraph agent for the Wizard feature.

Tool-calling loop that STOPS after interactive tools (ask_questions, confirm_and_proceed):
    START -> agent -> should_continue? -> tools -> after_tools? -> agent (loop) or END
                                        -> END
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.wizard.llm import get_wizard_llm
from app.wizard.tools import WIZARD_TOOLS

logger = logging.getLogger(__name__)

# Tools that pause the loop and wait for user interaction on the frontend
INTERACTIVE_TOOLS = {"ask_questions", "confirm_and_proceed"}


class WizardState(dict):
    """State for the wizard agent."""

    messages: Annotated[list[BaseMessage], add_messages]
    system_prompt: str


def _should_continue(state: dict) -> Literal["tools", "__end__"]:
    """Route: if the last AI message has tool_calls, go to tools; else finish."""
    messages = state.get("messages", [])
    if not messages:
        return "__end__"

    last = messages[-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return "__end__"


def _after_tools(state: dict) -> Literal["agent", "__end__"]:
    """After tools execute: if an interactive tool was called, STOP the loop.
    The frontend will render the tool's UI and send the user's response
    as a new request."""
    messages = state.get("messages", [])

    # Check the most recent ToolMessages for interactive tool names
    for msg in reversed(messages):
        if not isinstance(msg, ToolMessage):
            break
        # ToolMessage.name contains the tool function name
        tool_name = getattr(msg, "name", None)
        if tool_name in INTERACTIVE_TOOLS:
            return "__end__"

    # Non-interactive tools → continue the agent loop
    return "agent"


def _agent_node(state: dict) -> dict:
    """Invoke the LLM with the current messages + system prompt."""
    llm = get_wizard_llm()
    llm_with_tools = llm.bind_tools(WIZARD_TOOLS)

    messages = list(state.get("messages", []))

    # Prepend system prompt if not already present
    if not messages or not isinstance(messages[0], SystemMessage):
        system_msg = SystemMessage(content=state.get("system_prompt", ""))
        messages = [system_msg] + messages

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def build_wizard_graph() -> StateGraph:
    """Build and compile the wizard agent graph."""
    tool_node = ToolNode(WIZARD_TOOLS)

    graph = StateGraph(WizardState)
    graph.add_node("agent", _agent_node)
    graph.add_node("tools", tool_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges(
        "agent", _should_continue, {"tools": "tools", "__end__": END}
    )
    # After tools: stop if interactive, continue if not
    graph.add_conditional_edges(
        "tools", _after_tools, {"agent": "agent", "__end__": END}
    )

    return graph.compile()
