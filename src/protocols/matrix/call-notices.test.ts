import { callNotice } from './call-notices';

const someone = '@alice:example.org';

describe('bridge call notices', () => {
  it('reads a WhatsApp call from any sender', () => {
    expect(callNotice(someone, 'Incoming video call. Use the WhatsApp app to answer.')).toEqual({
      kind: 'call',
      outcome: 'started',
      video: true,
      openIn: { network: 'whatsapp' },
    });
    expect(callNotice(someone, 'Incoming voice call. Use the WhatsApp app to answer.')).toEqual({
      kind: 'call',
      outcome: 'started',
      openIn: { network: 'whatsapp' },
    });
  });

  it('opens a Slack huddle at its own link, whatever text comes before it', () => {
    const url = 'https://app.slack.com/client/T123/C456';
    const expected = { kind: 'call', outcome: 'started', openIn: { network: 'slack', url } };
    expect(callNotice(someone, `\n\nJoin via the Slack app: ${url}`)).toEqual(expected);
    expect(callNotice(someone, `Standup\n\nJoin via the Slack app: ${url}`)).toEqual(expected);
  });

  it('reads Signal calls only from a Signal participant', () => {
    const signal = '@signal_0b5e0f6a-1c2d-4e3f-8a9b-0c1d2e3f4a5b:example.org';
    expect(callNotice(signal, 'Incoming call')).toMatchObject({
      outcome: 'started',
      openIn: { network: 'signal' },
    });
    expect(callNotice(signal, 'Call ended')).toEqual({ kind: 'call', outcome: 'ended' });
    expect(callNotice(someone, 'Incoming call')).toBeUndefined();
  });

  it('reads a Discord call only from a Discord participant’s emote', () => {
    const discord = '@discord_123456789:example.org';
    expect(callNotice(discord, 'started a call', 'emote')).toMatchObject({
      outcome: 'started',
      openIn: { network: 'discord' },
    });
    expect(callNotice(discord, 'started a call')).toBeUndefined();
    expect(callNotice(someone, 'started a call', 'emote')).toBeUndefined();
  });

  it('leaves other text alone', () => {
    expect(callNotice(someone, 'Call me later')).toBeUndefined();
  });
});
