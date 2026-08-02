// frontend/src/features/chat/components/MessageInput.tsx
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Send, Paperclip, Smile, Mic, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { playMessageOut2 } from "../../../core/utils/sound";
import { useNotify } from "../../../core/context/NotificationContext";
import { RecordingEqualizer } from "./RecordingEqualizer";

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
  const notify = useNotify();

  const [text, setText] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const closeAudioContext = () => {
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setAnalyser(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopStream();
      closeAudioContext();
    };
  }, []);

  const handleStartRecording = async () => {
    if (disabled || isUploading || !onSendFile || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 128;
      source.connect(analyserNode);
      audioContextRef.current = audioContext;
      setAnalyser(analyserNode);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopStream();
        closeAudioContext();
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        const wasCancelled = cancelledRef.current;
        setIsRecording(false);
        setRecordingSeconds(0);
        if (wasCancelled || chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        await onSendFile(file, "");
        playMessageOut2();
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      notify("error", t("MicPermissionDenied"));
    }
  };

  const handleStopRecording = () => {
    cancelledRef.current = false;
    mediaRecorderRef.current?.stop();
  };

  const handleCancelRecording = () => {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  };

  const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 border-t border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50">
        <button
          onClick={handleCancelRecording}
          title={t("CancelRecording")}
          className="
            w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10
            transition-all duration-150
          "
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-700" title={t("Recording")}>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <RecordingEqualizer analyser={analyser} />
          <span className="text-sm text-gray-500 dark:text-slate-400 shrink-0 tabular-nums">{formatDuration(recordingSeconds)}</span>
        </div>

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleStopRecording}
          title={t("SendVoiceMessage")}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[#3390ec] hover:bg-[#2f80d8] transition-colors duration-150"
        >
          <Check className="w-4 h-4 text-white" />
        </motion.button>
      </div>
    );
  }

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
            border border-gray-200 dark:border-slate-600 focus:border-[#3390ec] focus:outline-none
            transition-colors duration-150
            max-h-[120px] overflow-y-auto
            disabled:opacity-50
            "
      />

      {!text.trim() && onSendFile ? (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleStartRecording}
          disabled={disabled || isUploading}
          title={t("RecordVoiceMessage")}
          className="
            w-9 h-9 rounded-full flex items-center justify-center shrink-0
            bg-[#3390ec] hover:bg-[#2f80d8]
            disabled:opacity-40
            transition-colors duration-150
            disabled:cursor-not-allowed
          "
        >
          <Mic className="w-4 h-4 text-white" />
        </motion.button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="
            w-9 h-9 rounded-full flex items-center justify-center shrink-0
            bg-[#3390ec] hover:bg-[#2f80d8]
            disabled:opacity-40
            transition-colors duration-150
            disabled:cursor-not-allowed
          "
        >
          <Send className="w-4 h-4 text-white" />
        </motion.button>
      )}
    </div>
  );
};

