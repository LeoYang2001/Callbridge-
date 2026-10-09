import { rm } from 'node:fs/promises';
import path from 'node:path';

/** Call recordings on disk: data/recordings/<call id>.wav. */

export function recordingPath(dir: string, callId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(callId)) throw new Error('Bad call id');
  return path.join(dir, `${callId}.wav`);
}

/** Deletes a call's recording, if it has one. */
export async function removeRecording(dir: string | null | undefined, callId: string): Promise<void> {
  if (!dir || !/^[0-9a-f-]{36}$/.test(callId)) return;
  await rm(recordingPath(dir, callId), { force: true });
}
