import TdJson from '../../../modules/tdjson';

import type { TdObject } from './api';
import { TdJsonClient, type TdDriver } from './json-client';

// How long one receive may block natively; closing the client waits for it.
const RECEIVE_TIMEOUT_S = 1;
const RECEIVE_LIMIT = 500;

let clientId: number | null = null;

const driver: TdDriver = {
  async create() {
    clientId = TdJson.create();
  },
  async send(request) {
    if (clientId === null) throw new Error('No TDLib client');
    TdJson.send(clientId, JSON.stringify(request));
  },
  async receive() {
    const id = clientId;
    const batch = JSON.parse(await TdJson.receive(RECEIVE_TIMEOUT_S, RECEIVE_LIMIT)) as TdObject[];
    return batch.filter((each) => each['@client_id'] === id);
  },
  async destroy() {
    if (clientId !== null) TdJson.destroy(clientId);
    clientId = null;
  },
};

export const TdClient = {
  create: () => TdJsonClient.create(driver),
};
