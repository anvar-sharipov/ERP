// frontend/src/core/utils/sound.ts
export const playClickSound = () => {
  const audio = new Audio("/sounds/click.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};


export const playClick2Sound = () => {
  const audio = new Audio("/sounds/click2.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};


export const playAsideSound = () => {
  const audio = new Audio("/sounds/aside.mp3");
  audio.volume = 0.2;
  audio.play().catch(() => {});
};

export const playAside2Sound = () => {
  const audio = new Audio("/sounds/aside2.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};


export const playInfoSound = () => {
  const audio = new Audio("/sounds/info.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};


export const playMessageOut = () => {
  const audio = new Audio("/sounds/message-out.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};


export const playMessageOut2 = () => {
  const audio = new Audio("/sounds/message-out2.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};