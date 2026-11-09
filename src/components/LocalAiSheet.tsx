import { useState } from 'react';

import { Input, Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { LOCAL_AI_DEFAULT, setLocalAiConfig, testLocalAi, useLocalAiConfig } from '@/lib/localAi';

/** Settings for the offline AI: where Ollama runs and which model to use. */
export function LocalAiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cfg = useLocalAiConfig();
  const [url, setUrl] = useState(cfg.url);
  const [model, setModel] = useState(cfg.model);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const save = () => setLocalAiConfig({ url, model });
  const test = async () => {
    save();
    setTesting(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await testLocalAi() });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Local AI" subtitle="Used by Ask Ipon when there’s no internet. Runs on your own computer with Ollama.">
      <Input label="Ollama address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={LOCAL_AI_DEFAULT.url} hint="On the same computer, keep http://localhost:11434. On a phone, use the computer’s Wi-Fi address, e.g. http://192.168.1.5:11434." />
      <Input label="Model" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder={LOCAL_AI_DEFAULT.model} />
      {result && <Notice tone={result.ok ? 'success' : 'warning'} icon={result.ok ? 'check-circle' : 'alert-triangle'} title={result.ok ? 'Local AI is ready' : 'Not connected'} body={result.text} />}
      <Button title="Test connection" icon="zap" variant="secondary" onPress={test} loading={testing} />
      <Button
        title="Save"
        onPress={() => {
          save();
          onClose();
        }}
      />
      <Text variant="caption" tone="faint">
        For the web app or a phone, start Ollama with OLLAMA_ORIGINS set to allow this app (and OLLAMA_HOST=0.0.0.0 for phones on the same Wi-Fi).
      </Text>
    </Sheet>
  );
}
