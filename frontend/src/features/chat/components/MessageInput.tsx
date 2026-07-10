// frontend/src/features/chat/components/MessageInput.tsx
import { useState, useRef, type KeyboardEvent } from "react";
import { Send, Paperclip, Smile } from "lucide-react";
import { useTranslation } from "react-i18next";
import { playMessageOut2 } from "../../../core/utils/sound";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😉", "😍", "😘", "😜", "🤔",
  "😎", "🥳", "😢", "😭", "😡", "😱", "😴", "🥺", "😇", "🙃",
  "👍", "👎", "👏", "🙏", "💪", "👌", "✌️", "🤝", "👋", "🤗",
  "❤️", "🔥", "🎉", "✅", "❌", "⭐", "💯", "😅", "🙄", "🙌",
];

interface Props {
  onSend: (text: string) => void;
  onSendFile?: (file: File, caption: string) => void | Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
  isUploading?: boolean;
}

export const MessageInput: React.FC<Props> = ({ onSend, onSendFile, onTyping, disabled, isUploading }) => {
  const { t } = useTranslation();

  const [text, setText] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEmojiClick = (emoji: string) => {
    setText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    playMessageOut2();
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onSendFile) return;
    const caption = text.trim();
    await onSendFile(file, caption);
    playMessageOut2();
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value) onTyping?.();
  };

  return (
    <div className="flex items-end gap-2 px-3 py-3 border-t border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50">
      {onSendFile && (
        <>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            title={t("AttachFile")}
            className="
              w-9 h-9 rounded-xl flex items-center justify-center shrink-0
              text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700
              transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </>
      )}

      <div className="relative shrink-0">
        <button
          onClick={() => setEmojiPickerOpen((v) => !v)}
          disabled={disabled}
          title={t("Emoji")}
          className="
            w-9 h-9 rounded-xl flex items-center justify-center
            text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700
            transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          <Smile className="w-4 h-4" />
        </button>

        {emojiPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setEmojiPickerOpen(false)} />
            <div className="absolute bottom-11 left-0 z-20 grid grid-cols-8 gap-1 p-2 w-64 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl">
              {EMOJIS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-lg rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        placeholder={isUploading ? t("SendingFile") : t("ChatPlaceholder")}
        rows={1}
        className="
            flex-1 resize-none rounded-xl px-3 py-2 text-sm
            bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100
            placeholder-gray-400 dark:placeholder-slate-400
            border border-gray-200 dark:border-slate-600 focus:border-indigo-500 focus:outline-none
            transition-colors duration-150
            max-h-[120px] overflow-y-auto
            disabled:opacity-50
            "
      />

      <button
        onClick={handleSend}
        disabled={!text.trim() || disabled}
        className="
          w-9 h-9 rounded-xl flex items-center justify-center shrink-0
          bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500
          shadow-[0_0_10px_rgba(99,102,241,0.45)] hover:shadow-[0_0_16px_rgba(99,102,241,0.65)]
          disabled:opacity-40 disabled:shadow-none
          transition-all duration-150
          disabled:cursor-not-allowed
        "
      >
        <Send className="w-4 h-4 text-white" />
      </button>
    </div>
  );
};

