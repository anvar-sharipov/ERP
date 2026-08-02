// frontend/src/features/chat/pages/ChatPage.tsx
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ConversationList } from "../components/ConversationList";
import { ConversationWindow } from "../components/ConversationWindow";
import { NewChatModal } from "../components/NewChatModal";
import { useChat } from "../context/ChatContext";
import { Plus, MessageSquare } from "lucide-react";

const ChatPage = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setActiveConvId } = useChat();
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedConvName, setSelectedConvName] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);

  // ✅ Сбрасываем activeConvId когда уходим со страницы
  useEffect(() => {
    return () => {
      setActiveConvId(null);
    };
  }, []);

  const handleSelectConv = (convId: number, convName: string) => {
    setSelectedConvId(convId);
    setSelectedConvName(convName);
    setActiveConvId(convId);
  };

  const handleCreated = (convId: number) => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setSelectedConvId(convId);
    setActiveConvId(convId);
  };

  return (
    <div className="flex h-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900">
      <div className="w-72 shrink-0 flex flex-col border-r border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <span className="text-sm font-semibold text-slate-200">{t("Messages")}</span>
          <button
            onClick={() => setNewChatOpen(true)}
            className="w-7 h-7 rounded-full bg-[#3390ec] hover:bg-[#2f80d8] flex items-center justify-center transition-colors"
            title={t("NewConversation")}
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList onSelect={(convId, convName) => handleSelectConv(convId, convName)} />
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-slate-900/20">
        {selectedConvId ? (
          <ConversationWindow convId={selectedConvId} convName={selectedConvName} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#3390ec]/40 gap-3">
            <MessageSquare className="w-16 h-16" />
            <span className="text-sm">{t("SelectChat")}</span>
            <button
              onClick={() => setNewChatOpen(true)}
              className="mt-2 px-4 py-2 rounded-full bg-[#3390ec]/15 hover:bg-[#3390ec]/25 text-[#3390ec] dark:text-[#6ab2f2] text-sm transition-colors"
            >
              + {t("NewConversation")}
            </button>
          </div>
        )}
      </div>

      <NewChatModal isOpen={newChatOpen} onClose={() => setNewChatOpen(false)} onCreated={handleCreated} />
    </div>
  );
};

export default ChatPage;
