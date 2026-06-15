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
  audio.volume = 0.5;
  audio.play().catch(() => {});
};

export const playAside2Sound = () => {
  const audio = new Audio("/sounds/aside2.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {});
};