import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/hooks/use-theme';

const ORDER: Theme[] = ['light', 'dark', 'system'];
const META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
};

/** Cycles the theme light → dark → system. Icon + accessible label reflect state. */
export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const { icon: Icon, label } = META[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${label}. Switch to ${META[next].label}.`}
      title={`Theme: ${label}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
