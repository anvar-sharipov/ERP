// frontend/src/features/chat/components/MessageInput.tsx
import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onSend: (text: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
}

export const MessageInput: React.FC<Props> = ({ onSend, onTyping, disabled }) => {
  const { t } = useTranslation();

  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
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
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        placeholder={t("ChatPlaceholder")}
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
          bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
          transition-all duration-150
          disabled:cursor-not-allowed
        "
      >
        <Send className="w-4 h-4 text-white" />
      </button>
    </div>
  );
};

// // frontend/src/features/chat/components/MessageInput.tsx
// import { useState, useRef, type KeyboardEvent } from "react";
// import { Send } from "lucide-react";

// interface Props {
//   onSend: (text: string) => void;
//   onTyping?: () => void; // ✅ новый проп
//   disabled?: boolean;
// }

// export const MessageInput: React.FC<Props> = ({ onSend, onTyping, disabled }) => {
//   const [text, setText] = useState("");
//   const textareaRef = useRef<HTMLTextAreaElement>(null);

//   const handleSend = () => {
//     const trimmed = text.trim();
//     if (!trimmed || disabled) return;
//     onSend(trimmed);
//     setText("");
//     if (textareaRef.current) {
//       textareaRef.current.style.height = "auto";
//     }
//   };

//   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       handleSend();
//     }
//   };

//   const handleInput = () => {
//     const el = textareaRef.current;
//     if (!el) return;
//     el.style.height = "auto";
//     el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
//   };

//   const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
//     setText(e.target.value);
//     // ✅ Сообщаем о наборе текста
//     if (e.target.value) onTyping?.();
//   };

//   return (
//     // <div className="flex items-end gap-2 px-3 py-3 border-t border-slate-700/50 bg-slate-800/50">
//     <div className="flex items-end gap-2 px-3 py-3 border-t border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50">
//       <textarea
//         ref={textareaRef}
//         value={text}
//         onChange={handleChange}
//         onKeyDown={handleKeyDown}
//         onInput={handleInput}
//         disabled={disabled}
//         placeholder="Написать сообщение... (Enter — отправить)"
//         rows={1}
//         className="
//             flex-1 resize-none rounded-xl px-3 py-2 text-sm
//             bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100
//             placeholder-gray-400 dark:placeholder-slate-400
//             border border-gray-200 dark:border-slate-600 focus:border-indigo-500 focus:outline-none
//             transition-colors duration-150
//             max-h-[120px] overflow-y-auto
//             disabled:opacity-50
//             "
//       />
//       <button
//         onClick={handleSend}
//         disabled={!text.trim() || disabled}
//         className="
//           w-9 h-9 rounded-xl flex items-center justify-center shrink-0
//           bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
//           transition-all duration-150
//           disabled:cursor-not-allowed
//         "
//       >
//         <Send className="w-4 h-4 text-white" />
//       </button>
//     </div>
//   );
// };
