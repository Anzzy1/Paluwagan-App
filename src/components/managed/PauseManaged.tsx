import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/components/circle/Lifecycle";
import { Input, type IconName } from "@/components/ui/bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { haptic, PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { notify } from "@/lib/alert";
import { longDate, parseDate, todayISO } from "@/lib/format";
import {
  pauseInfo,
  pauseManaged,
  resumeManaged,
  resumePreview,
  type LocalCircle,
} from "@/lib/local";
import { useColors } from "@/lib/prefs";
import { radius } from "@/theme/tokens";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const between = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

/** "Pause paluwagan" button with a reason and what pausing does. */
export function PauseManagedButton({ circle }: { circle: LocalCircle }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button
        title="Pause paluwagan"
        icon="pause"
        variant="secondary"
        size="md"
        onPress={() => setOpen(true)}
      />
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="warning"
        icon="pause"
        title="Pause this paluwagan?"
        points={[
          "Use this when the group needs a break, like an emergency, a calamity or a member who can’t pay for a while.",
          "Hulog and sahod stop. Dates during the pause won’t count as missed.",
          "When you resume, you choose how to adjust the dates: move them by the days paused, pick a new restart date, or keep them.",
        ]}
        confirmLabel="Pause"
        onConfirm={() => {
          pauseManaged(circle.id, reason);
          haptic("warning");
          setOpen(false);
          setReason("");
        }}
      >
        <Input
          label="Reason (optional)"
          placeholder="e.g. Typhoon, we’ll continue next month"
          value={reason}
          onChangeText={setReason}
          maxLength={200}
        />
      </ConfirmSheet>
    </>
  );
}

/** Shown instead of Hulog today / Sahod while paused. */
export function PausedManagedCard({ circle }: { circle: LocalCircle }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const info = pauseInfo(circle);
  return (
    <Card
      style={{
        gap: 10,
        backgroundColor: c.warningBg,
        borderColor: c.warningBg,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Feather name="pause-circle" size={22} color={c.warning} />
        <View style={{ flex: 1 }}>
          <Text variant="h3" color={c.warning}>
            Paused since {longDate(info.from)}
          </Text>
          <Text variant="caption" color={c.warning}>
            {info.pausedDays
              ? `${plural(info.pausedDays, "day")} so far`
              : "Paused today"}
          </Text>
        </View>
      </View>
      {circle.pause_reason && (
        <Text variant="body" color={c.warning}>
          “{circle.pause_reason}”
        </Text>
      )}
      <Text variant="small" color={c.warning}>
        Hulog and sahod are on hold, and dates during the pause don’t count as
        missed. When the group is ready, resume and adjust the dates.
      </Text>
      <Button
        title="Resume paluwagan"
        icon="play"
        onPress={() => setOpen(true)}
      />
      <ResumeSheet
        key={String(open)}
        circle={circle}
        open={open}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

function Change({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  const c = useColors();
  return (
    <View style={styles.change}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      {from === to ? (
        <Text variant="smallBold">{longDate(to)}</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            variant="small"
            tone="faint"
            style={{ textDecorationLine: "line-through" }}
          >
            {longDate(from)}
          </Text>
          <Feather name="arrow-right" size={12} color={c.textFaint} />
          <Text variant="smallBold" tone="brand">
            {longDate(to)}
          </Text>
        </View>
      )}
    </View>
  );
}

type Mode = "shift" | "restart" | "keep";

function ResumeSheet({
  circle,
  open,
  onClose,
}: {
  circle: LocalCircle;
  open: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const info = pauseInfo(circle);
  const today = todayISO();
  const [mode, setMode] = useState<Mode>("shift");
  const [restart, setRestart] = useState(
    info.anchor && info.anchor > today ? info.anchor : today,
  );

  const shift =
    mode === "shift"
      ? info.pausedDays
      : mode === "restart" && info.anchor
        ? between(info.anchor, restart)
        : 0;
  const preview = resumePreview(circle, shift);
  const badRestart = mode === "restart" && restart < today;

  const options: {
    value: Mode;
    icon: IconName;
    title: string;
    body: string;
  }[] = [
    {
      value: "shift",
      icon: "fast-forward",
      title: info.pausedDays
        ? `Move dates ${plural(info.pausedDays, "day")} later`
        : "Continue as scheduled",
      body: info.pausedDays
        ? "Every hulog and sahod after the pause moves by the number of days it was paused."
        : "It was paused today, so no dates need to move.",
    },
    {
      value: "restart",
      icon: "calendar",
      title: "Pick a restart date",
      body: "Choose when the next hulog happens. Everything after it moves to keep the same spacing.",
    },
    {
      value: "keep",
      icon: "lock",
      title: "Keep the original dates",
      body: "Nothing moves. Hulog dates that passed during the pause will count as unpaid.",
    },
  ];

  const resume = () => {
    resumeManaged(circle.id, shift);
    haptic("success");
    onClose();
    notify(
      "Paluwagan resumed",
      shift
        ? `Dates moved ${plural(Math.abs(shift), "day")} ${shift > 0 ? "later" : "earlier"}.`
        : "The dates stay the same.",
      "success",
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Resume paluwagan"
      subtitle={`Paused since ${longDate(info.from)}. How should the dates continue?`}
    >
      <View style={{ gap: 8 }}>
        {options.map((o) => {
          const on = mode === o.value;
          return (
            <PressableScale
              key={o.value}
              hapticOnPress={false}
              onPress={() => setMode(o.value)}
              style={[
                styles.option,
                {
                  borderColor: on ? c.brand : c.border,
                  backgroundColor: on ? c.brandSoft : c.surface,
                },
              ]}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: on ? c.brand : c.borderStrong },
                ]}
              >
                {on && (
                  <View
                    style={[styles.radioDot, { backgroundColor: c.brand }]}
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Feather
                    name={o.icon}
                    size={14}
                    color={on ? c.brand : c.textMuted}
                  />
                  <Text variant="smallBold">{o.title}</Text>
                </View>
                <Text variant="caption" tone="muted">
                  {o.body}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>

      {mode === "restart" && (
        <Card>
          <MonthCalendar value={restart} onChange={setRestart} />
        </Card>
      )}

      <Card style={{ gap: 2 }}>
        <Text variant="overline" tone="muted" style={{ marginBottom: 4 }}>
          After resuming
        </Text>
        {preview.hulog && (
          <Change
            label="Next hulog"
            from={preview.hulog.from}
            to={preview.hulog.to}
          />
        )}
        {preview.sahod && (
          <Change
            label={`Next sahod · ${preview.sahod.name}`}
            from={preview.sahod.from}
            to={preview.sahod.to}
          />
        )}
        {preview.end && (
          <Change
            label="Last sahod"
            from={preview.end.from}
            to={preview.end.to}
          />
        )}
        {!preview.hulog && !preview.sahod && (
          <Text variant="small" tone="muted">
            No upcoming dates are affected.
          </Text>
        )}
      </Card>

      {badRestart ? (
        <Text variant="small" tone="danger">
          Pick today or a later date.
        </Text>
      ) : preview.missedAfter > 0 ? (
        <Text variant="small" tone="warning">
          {plural(preview.missedAfter, "hulog date")} will already be in the
          past and show as unpaid. Move the dates further to avoid this.
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title="Cancel"
          variant="secondary"
          full={false}
          style={{ flex: 1 }}
          onPress={onClose}
        />
        <Button
          title="Resume"
          icon="play"
          full={false}
          style={{ flex: 1.4 }}
          disabled={badRestart}
          onPress={resume}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  change: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    flexWrap: "wrap",
  },
});
