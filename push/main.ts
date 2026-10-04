import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Apns } from './apns.ts';
import { createForwarder } from './forwarder.ts';

const keyFile = process.env.APNS_KEY_FILE;
const keyId = process.env.APNS_KEY_ID;
const teamId = process.env.APNS_TEAM_ID;
if (!keyFile || !keyId || !teamId) {
  throw new Error('Set APNS_KEY_FILE, APNS_KEY_ID and APNS_TEAM_ID.');
}
const topic = process.env.APNS_TOPIC ?? 'im.statim.app';
const port = Number(process.env.PORT ?? 8080);

const apns = new Apns({ key: createPrivateKey(readFileSync(keyFile)), keyId, teamId, topic });

createForwarder(apns, topic).listen(port, () => {
  console.log(`[push] forwarding to APNs for ${topic} on port ${port}`);
});
