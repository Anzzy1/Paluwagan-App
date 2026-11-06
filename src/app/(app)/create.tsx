import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { Chip, IconButton, Input, ProgressBar, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCreateCircle } from '@/lib/api';
import { frequencyLabel, longDate, looksLikeScam, peso, toISODate } from '@/lib/format';
import { useColors, usePrefs } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Frequency } from '@/lib/types';
import { circleEmojis, circleTints, radius, tintNames, type CircleTint } from '@/theme/tokens';

const DEFAULT_RULES = [
  '1. Magbayad on or before ng due date. Mag-upload ng resibo sa app.',
  '2. Ang may sahod ang magko-confirm ng natanggap na bayad.',
  '3. Bawal tumakbo pagkatapos makuha ang sahod — tuloy ang hulog hanggang matapos.',
  '4. Ang palit-slot ay kailangang pumayag ang dalawang member at ang admin.',
].join('\n');

function nextKinsenas(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const fifteenth = new Date(y, m, 15);
  const eom = new Date(y, m + 1, 0);
  if (d <= fifteenth) return toISODate(fifteenth);
  if (d <= eom) return toISODate(eom);
  return toISODate(new Date(y, m + 1, 15));
}

const STEPS = ['Pangalan', 'Halaga', 'Schedule', 'Kasunduan'];

export default function CreateCircle() {
  const c = useColors();
  const { lang } = usePrefs();
  const create = useCreateCircle();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(circleEmojis[0]);
  const [color, setColor] = useState<CircleTint>('mango');
  const [amount, setAmount] = useState('1000');
  const [slots, setSlots] = useState(10);
  const [frequency, setFrequency] = useState<Frequency>('kinsenas');
  const [startDate, setStartDate] = useState(nextKinsenas());
  const [lateFee, setLateFee] = useState('0');
  const [grace, setGrace] = useState(1);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [orderMode, setOrderMode] = useState<'draw' | 'manual'>('draw');

  const tint = useTint(color);
  const amt = Number(amount) || 0;
  const pot = amt * slots;
  const scam = looksLikeScam(rules) || looksLikeScam(name);

  const canNext = [name.trim().length > 0, amt > 0 && slots >= 2, !!startDate, true][step];

  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        emoji,
        color,
        amount: amt,
        slots,
        frequency,
        start_date: startDate,
        late_fee: Number(lateFee) || 0,
        grace_days: grace,
        rules: rules.trim(),
        order_mode: orderMode,
      },
      {
        onSuccess: (id) => router.replace(`/circle/${id}`),
        onError: (e) => Alert.alert('May mali', errMsg(e)),
      },
    );

  return (
    <Screen
      right={<IconButton icon="x" onPress={() => router.back()} />}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {step > 0 && <Button title="Bumalik" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />}
          <Button
            title={step === STEPS.length - 1 ? 'Gawin ang circle ✨' : 'Sunod'}
            onPress={() => (step === STEPS.length - 1 ? submit() : setStep(step + 1))}
            disabled={!canNext}
            loading={create.isPending}
            style={{ flex: 2 }}
          />
        </View>
      }>
      <View style={{ gap: 10 }}>
        <Text variant="caption" tone="muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
        <ProgressBar progress={(step + 1) / STEPS.length} color={c.ink} height={6} />
      </View>

      {/* live preview */}
      <View style={[styles.preview, { backgroundColor: tint.bg }]}>
        <View style={[styles.previewEmoji, { backgroundColor: c.surface }]}>
          <Text style={{ fontSize: 30, lineHeight: 38 }}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h2" numberOfLines={1}>
            {name || 'Pangalan ng circle'}
          </Text>
          <Text variant="small" tone="muted">
            {peso(amt)} × {slots} slots · {frequencyLabel[frequency][lang]}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" tone="muted">
            Pot
          </Text>
          <Text variant="h2">{peso(pot, { compact: true })}</Text>
        </View>
      </View>

      <Animated.View key={step} entering={FadeInRight.springify().damping(18)} style={{ gap: 16 }}>
        {step === 0 && (
          <>
            <Text variant="h1">Anong tawag sa paluwagan niyo?</Text>
            <Input placeholder="hal. Barkada Ipon 2026" value={name} onChangeText={setName} maxLength={40} autoFocus />
            <Text variant="smallBold" tone="muted">
              Icon
            </Text>
            <View style={styles.wrap}>
              {circleEmojis.map((e) => (
                <PressableScale
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={[styles.emojiBtn, { backgroundColor: e === emoji ? c.ink : c.surface, borderColor: c.border }]}>
                  <Text style={{ fontSize: 24, lineHeight: 30 }}>{e}</Text>
                </PressableScale>
              ))}
            </View>
            <Text variant="smallBold" tone="muted">
              Kulay
            </Text>
            <View style={styles.wrap}>
              {tintNames.map((t) => (
                <PressableScale
                  key={t}
                  onPress={() => setColor(t)}
                  style={[styles.swatch, { backgroundColor: circleTints[t].strong, borderColor: t === color ? c.ink : 'transparent' }]}
                />
              ))}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text variant="h1">Magkano at ilan kayo?</Text>
            <Input
              label="Hulog kada slot (₱)"
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              style={{ fontSize: 28, height: 72 }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[500, 1000, 2000, 2500, 5000, 10000].map((v) => (
                <PressableScale key={v} onPress={() => setAmount(String(v))}>
                  <Chip label={peso(v)} tone={amt === v ? 'ink' : 'neutral'} />
                </PressableScale>
              ))}
            </ScrollView>
            <Card style={styles.stepper}>
              <View>
                <Text variant="bodyBold">Bilang ng slots</Text>
                <Text variant="small" tone="muted">
                  = bilang ng rounds
                </Text>
              </View>
              <View style={styles.stepperCtl}>
                <IconButton icon="minus" size={40} onPress={() => setSlots(Math.max(2, slots - 1))} />
                <Text variant="h1" style={{ minWidth: 40, textAlign: 'center' }}>
                  {slots}
                </Text>
                <IconButton icon="plus" size={40} onPress={() => setSlots(Math.min(50, slots + 1))} />
              </View>
            </Card>
            <Card tint={color}>
              <Text variant="caption" tone="muted">
                Bawat round, may isang makakatanggap ng
              </Text>
              <Text variant="display">{peso(pot)}</Text>
              <Text variant="small" tone="muted">
                Puwedeng mag-hati ang dalawang tao sa isang slot (Hati-Slot) — kalahati ang hulog, kalahati ang sahod.
              </Text>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="h1">Kailan ang hulugan?</Text>
            <Segmented
              value={frequency}
              onChange={(f) => {
                setFrequency(f);
                if (f === 'kinsenas') setStartDate(nextKinsenas());
              }}
              options={[
                { value: 'weekly', label: 'Lingguhan' },
                { value: 'kinsenas', label: 'Kinsenas' },
                { value: 'monthly', label: 'Buwanan' },
              ]}
            />
            {frequency === 'kinsenas' && (
              <Text variant="small" tone="muted">
                Tuwing 15 at katapusan ng buwan — sakto sa sahod. Naka-highlight ang mga payday.
              </Text>
            )}
            <Card>
              <MonthCalendar
                value={startDate}
                onChange={setStartDate}
                highlight={
                  frequency === 'kinsenas'
                    ? (d) => d.getDate() === 15 || d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
                    : undefined
                }
              />
            </Card>
            <Text variant="bodyBold">Unang due: {longDate(startDate)}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Input label="Late fee (₱)" value={lateFee} onChangeText={(v) => setLateFee(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="smallBold" tone="muted">
                  Palugit (araw)
                </Text>
                <View style={[styles.stepperCtl, { height: 54 }]}>
                  <IconButton icon="minus" size={38} onPress={() => setGrace(Math.max(0, grace - 1))} />
                  <Text variant="h2" style={{ minWidth: 28, textAlign: 'center' }}>
                    {grace}
                  </Text>
                  <IconButton icon="plus" size={38} onPress={() => setGrace(Math.min(30, grace + 1))} />
                </View>
              </View>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text variant="h1">Paano pipiliin ang pagkakasunod?</Text>
            <PressableScale
              onPress={() => setOrderMode('draw')}
              style={[styles.option, { backgroundColor: orderMode === 'draw' ? c.accent : c.surface, borderColor: c.border }]}>
              <Text style={{ fontSize: 30, lineHeight: 38 }}>🎲</Text>
              <View style={{ flex: 1 }}>
                <Text variant="h3" color={orderMode === 'draw' ? c.accentInk : c.text}>
                  Digital Bunot (recommended)
                </Text>
                <Text variant="small" color={orderMode === 'draw' ? c.accentInk : c.textMuted}>
                  Random at provably fair — kayang i-verify ng lahat na walang dayaan.
                </Text>
              </View>
            </PressableScale>
            <PressableScale
              onPress={() => setOrderMode('manual')}
              style={[styles.option, { backgroundColor: orderMode === 'manual' ? c.accent : c.surface, borderColor: c.border }]}>
              <Text style={{ fontSize: 30, lineHeight: 38 }}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text variant="h3" color={orderMode === 'manual' ? c.accentInk : c.text}>
                  Ang admin ang mag-aayos
                </Text>
                <Text variant="small" color={orderMode === 'manual' ? c.accentInk : c.textMuted}>
                  Para sa mga napag-usapan na ang pagkakasunod.
                </Text>
              </View>
            </PressableScale>
            <Input label="Kasunduan / Rules" value={rules} onChangeText={setRules} multiline style={{ minHeight: 160 }} />
            <Text variant="small" tone="faint">
              Kailangang pumayag ang bawat member sa kasunduang ito bago sumali.
            </Text>
            {scam && (
              <Card style={{ borderColor: c.warning, backgroundColor: c.warningBg }}>
                <Text variant="bodyBold" tone="warning">
                  ⚠️ Mukhang may “tubo” o investment sa rules
                </Text>
                <Text variant="small" tone="warning">
                  Ang tunay na paluwagan ay walang interes — ang pot ay galing lang sa hulog ng members. Ang pangakong tubo
                  ay karaniwang senyales ng scam (babala ng SEC).
                </Text>
              </Card>
            )}
          </>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg },
  previewEmoji: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiBtn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepperCtl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
});
