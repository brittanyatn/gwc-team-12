// Shared card shell from the Figma user flow: themed background + forest floor.
import { useEffect, useState } from 'react';
import floorLight from '../assets/forest/floor-light.svg';
import floorDark from '../assets/forest/floor-dark.svg';
import './Forest.css';

export default function ForestCard({ theme, className = '', children }) {
  const floor = theme === 'darkForest' ? floorDark : floorLight;
  return (
    <div className={`forest-card ${theme} ${className}`}>
      <img className="forest-floor" src={floor} width="524" height="148" alt="" />
      {children}
    </div>
  );
}

// Before the quiz picks a theme, follow the computer's light/dark mode setting.
export function useSystemForestTheme() {
  const query = '(prefers-color-scheme: dark)';
  const get = () =>
    window.matchMedia?.(query).matches ? 'darkForest' : 'lightForest';
  const [theme, setTheme] = useState(get);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setTheme(get());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return theme;
}
