type FocusRegion = 'sidebar' | 'table' | 'none' | 'pagination' | 'search' | 'action' | "sidebar-right";
type Listener = (region: FocusRegion) => void;

let currentRegion: FocusRegion = 'table';
const listeners = new Set<Listener>();

export const focusManager = {
  setRegion: (region: FocusRegion) => {
    currentRegion = region;
    listeners.forEach(l => l(region));
  },
  getRegion: () => currentRegion,
  subscribe: (l: Listener) => { 
    listeners.add(l); 
    return () => { 
      listeners.delete(l); 
    }; 
  },
};

// type FocusRegion = 'sidebar' | 'table' | 'none';
// type Listener = (region: FocusRegion) => void;

// let currentRegion: FocusRegion = 'table';
// const listeners = new Set<Listener>();

// export const focusManager = {
//   setRegion: (region: FocusRegion) => {
//     currentRegion = region;
//     listeners.forEach(l => l(region));
//   },
//   getRegion: () => currentRegion,
//   subscribe: (l: Listener) => { 
//   listeners.add(l); 
//   return () => { 
//     listeners.delete(l); 
//   }; 
// },
// };