import { sha256 } from '@noble/hashes/sha2';

import { base64ToBytes, toHex } from '@/lib/bytes';

import { AudioType } from './messages';
import recordings from './testing/voice-recordings.json';
import { statusAudio } from './voice';

describe('voice notes for Status', () => {
  it.each(Object.entries(recordings))(
    'come out of the %s recording as ffmpeg copies them',
    (_, recording) => {
      const audio = statusAudio(base64ToBytes(recording.input))!;
      expect(audio.payload).toHaveLength(recording.outputBytes);
      expect(toHex(sha256(audio.payload))).toBe(recording.output);
    }
  );

  it('are AAC from iPhones and browsers, AMR from Android', () => {
    const typeOf = (input: string) => statusAudio(base64ToBytes(input))?.type;
    expect(typeOf(recordings.iphone.input)).toBe(AudioType.AAC);
    expect(typeOf(recordings.fragmented.input)).toBe(AudioType.AAC);
    expect(typeOf(recordings.android.input)).toBe(AudioType.AMR);
  });

  it("pass through what is already in Status's format and refuse the rest", () => {
    const adts = statusAudio(base64ToBytes(recordings.mp4.input))!.payload;
    expect(statusAudio(adts)).toEqual({ payload: adts, type: AudioType.AAC });
    expect(statusAudio(new TextEncoder().encode('#!AMR\n<'))?.type).toBe(AudioType.AMR);
    expect(statusAudio(Uint8Array.of(1, 2, 3))).toBeNull();
    expect(statusAudio(base64ToBytes(recordings.iphone.input).slice(0, 1000))).toBeNull();
  });
});
