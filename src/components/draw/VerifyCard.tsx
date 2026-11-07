import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { verifyDraw, type VerifyResult } from '@/lib/draw';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

function Check({ ok, label }: { ok: boolean; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Feather name={ok ? 'check-circle' : 'x-circle'} size={16} color={ok ? c.success : c.danger} />
      <Text variant="smallBold" tone={ok ? 'success' : 'danger'} style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

export function VerifyCard({ seed, seedHash, groups, order }: { seed: string; seedHash: string; groups: string[]; order: string[] }) {
  const c = useColors();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await verifyDraw({ seed, seedHash, slotGroups: groups, publishedOrder: order }, sha256));
      haptic('success');
    } catch (e) {
      notifyError(e, 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text variant="h3">Verify this draw</Text>
      <Text variant="small" tone="muted">
        Your device recomputes the result from the revealed seed. If both checks pass, the order could not have been altered.
      </Text>
      <View style={{ padding: 12, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, gap: 4 }}>
        <Text variant="caption" tone="faint">
          Revealed seed
        </Text>
        <Text variant="mono" selectable>
          {seed}
        </Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 6 }}>
          Commitment (SHA-256)
        </Text>
        <Text variant="mono" selectable>
          {seedHash}
        </Text>
      </View>
      {result ? (
        <View style={{ gap: 8 }}>
          <Check ok={result.hashMatches} label={result.hashMatches ? 'Seed matches the published commitment' : 'Seed does NOT match the commitment'} />
          <Check ok={result.orderMatches} label={result.orderMatches ? 'Payout order matches the recomputed result' : 'Payout order does NOT match'} />
        </View>
      ) : (
        <Button title="Verify now" icon="shield" variant="secondary" onPress={run} loading={busy} />
      )}
    </Card>
  );
}
