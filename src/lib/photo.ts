import * as ImagePicker from 'expo-image-picker';

import { notify } from '@/lib/alert';

export type Photo = { uri: string; mime?: string | null };

/** Opens the library or camera with a square crop. Returns null if cancelled or rejected. */
export async function pickPhoto(camera: boolean): Promise<Photo | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  if (camera) {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      notify('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
      return null;
    }
  }
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  if (a.fileSize && a.fileSize > 5 * 1024 * 1024) {
    notify('Photo too large', 'Please choose a photo under 5 MB.');
    return null;
  }
  return { uri: a.uri, mime: a.mimeType };
}
