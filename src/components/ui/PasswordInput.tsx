import { Feather } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';

import { Input } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { useColors } from '@/lib/prefs';

/** Password field with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'secureTextEntry' | 'right'>) {
  const c = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <PressableScale
          onPress={() => setVisible((v) => !v)}
          hapticOnPress={false}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          style={{ paddingLeft: 10, paddingVertical: 8 }}>
          <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={c.textMuted} />
        </PressableScale>
      }
    />
  );
}
