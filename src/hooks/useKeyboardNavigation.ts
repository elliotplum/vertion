import { useEffect } from 'react';
import type { AppView } from '../types/project';

// Centralize the top-level page cycle so view components stay unaware of global listeners.
export function useKeyboardNavigation(
  currentView: AppView,
  selectedProjectId: string | null,
  setCurrentView: (view: AppView) => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Tab remains available for normal form navigation while the user is typing.
      if (event.key !== 'Tab' || event.target instanceof HTMLInputElement) return;

      event.preventDefault();

      if (currentView === 'explorer') {
        setCurrentView('dashboard');
      } else if (currentView === 'dashboard') {
        setCurrentView(selectedProjectId ? 'project-history' : 'explorer');
      } else if (currentView === 'project-history') {
        setCurrentView('explorer');
      } else {
        setCurrentView('explorer');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, selectedProjectId, setCurrentView]);
}
