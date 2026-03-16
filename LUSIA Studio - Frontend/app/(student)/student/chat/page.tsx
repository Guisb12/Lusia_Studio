import { fetchChatConversationsServer } from "@/lib/chat.server"
import { ChatShell } from "@/components/chat/ChatShell"

export default async function StudentChatPage() {
  const conversations = await fetchChatConversationsServer()

  return <ChatShell initialConversations={conversations} />
}
