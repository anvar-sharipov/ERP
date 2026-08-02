// frontend/src/features/chat/components/VoiceMessagePlayer.tsx
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

interface Props {
  src: string;
  isMe: boolean;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export const VoiceMessagePlayer: React.FC<Props> = ({ src, isMe }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const displayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  return (
    <div className="flex items-center gap-2 w-full max-w-[240px] mb-1">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-[#3390ec]/15 hover:bg-[#3390ec]/25 text-[#3390ec] dark:text-[#6ab2f2]"
        }`}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
      </button>

      <div className="flex-1 min-w-0">
        <div onClick={handleSeek} className={`h-1.5 rounded-full cursor-pointer ${isMe ? "bg-white/25" : "bg-gray-400/30 dark:bg-slate-500/40"}`}>
          <div className={`h-full rounded-full ${isMe ? "bg-white" : "bg-[#3390ec] dark:bg-[#6ab2f2]"}`} style={{ width: `${progress}%` }} />
        </div>
        <div className={`text-[10px] mt-0.5 tabular-nums ${isMe ? "text-white/70" : "text-gray-500 dark:text-slate-400"}`}>{formatTime(displayTime)}</div>
      </div>
    </div>
  );
};
