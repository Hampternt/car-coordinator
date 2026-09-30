'use strict';
/* This browser's colour choice, applied before the page is drawn, so a dark
   choice never flashes light. Loaded in <head>, before store.js exists, so it
   reads the key itself; it only ever reads. The Colours switch on the Data
   tab writes the choice, through Store. No choice, or anything but light or
   dark, means follow the computer. */
try {
  const t = localStorage.getItem('carcoord:pref:theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage refused: follow the computer */ }
