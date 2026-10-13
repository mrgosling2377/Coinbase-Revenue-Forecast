'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export function ThemeToggle(){
  const [dark,setDark]=useState(false);
  useEffect(()=>{setDark(document.documentElement.dataset.theme==='dark');},[]);
  const toggle=()=>{const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';try{localStorage.setItem('coinbase-theme',next?'dark':'light');}catch{}};
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label={dark?'Switch to light mode':'Switch to dark mode'} title={dark?'Switch to light mode':'Switch to dark mode'}>{dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?'Light mode':'Dark mode'}</span></button>;
}
