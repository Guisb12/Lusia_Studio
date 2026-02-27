"""
LangGraph agent for the Chat AI feature.

Simple tool-calling loop:
    START -> agent -> should_continue? -> tools -> agent (loop)
                                       -> END
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.chat.llm import get_chat_llm
from app.chat.prompts import build_system_prompt
from app.chat.tools import CHAT_TOOLS

logger = logging.getLogger(__name__)


class ChatState(dict):
    """Minimal state for the chat agent."""

    messages: Annotated[list[BaseMessage], add_messages]
    user_name: str
    grade_level: str
    education_level: str
    preferred_subjects: list[dict]


def _should_continue(state: dict) -> Literal["tools", "__end__"]:
    """Route: if the last AI message has tool_calls, go to tools; else finish."""
    messages = state.get("messages", [])
    if not messages:
        return "__end__"

    last = messages[-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return "__end__"


def _agent_node(state: dict) -> dict:
    """Invoke the LLM with the current messages + system prompt."""
    llm = get_chat_llm()
    llm_with_tools = llm.bind_tools(CHAT_TOOLS)

    messages = list(state.get("messages", []))

    # Prepend system prompt if not already present
    if not messages or not isinstance(messages[0], SystemMessage):
        system_msg = SystemMessage(
            content=build_system_prompt(
                user_name=state.get("user_name", "Estudante"),
                grade_level=state.get("grade_level", ""),
                education_level=state.get("education_level", ""),
                preferred_subjects=state.get("preferred_subjects", []),
            )
        )
        messages = [system_msg] + messages

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def build_chat_graph() -> StateGraph:
    """Build and compile the chat agent graph."""
    tool_node = ToolNode(CHAT_TOOLS)

    graph = StateGraph(ChatState)
    graph.add_node("agent", _agent_node)
    graph.add_node("tools", tool_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", _should_continue, {"tools": "tools", "__end__": END})
    graph.add_edge("tools", "agent")

    return graph.compile()


# Singleton compiled graph
_compiled_graph = None


def get_compiled_graph():
    """Get or build the singleton compiled graph."""
    global _compiled_graph
    if _compiled_graph is None:
        logger.info("Building chat agent graph...")
        _compiled_graph = build_chat_graph()
        logger.info("Chat agent graph compiled successfully.")
    return _compiled_graph
