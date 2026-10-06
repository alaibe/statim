import { keccak256, parseSignature, serializeTransaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex, Signature, TransactionSerializable } from 'viem';

import type { HardwareSigner, TypedData } from '../hardware';

export class FakeHardwareSigner implements HardwareSigner {
  readonly label = 'Test device';

  refuse = false;
  readonly calls: string[] = [];

  constructor(private readonly privateKey: Hex) {}

  private account() {
    return privateKeyToAccount(this.privateKey);
  }

  async getAddress(path: string): Promise<Address> {
    this.calls.push(`getAddress:${path}`);
    return this.account().address;
  }

  async signMessage(path: string, message: Uint8Array): Promise<Hex> {
    this.calls.push(`signMessage:${path}`);
    this.guard();
    return this.account().signMessage({ message: { raw: message } });
  }

  async signTransaction(path: string, transaction: TransactionSerializable): Promise<Signature> {
    this.calls.push(`signTransaction:${path}`);
    this.guard();
    return parseSignature(
      await this.account().sign({ hash: keccak256(serializeTransaction(transaction)) })
    );
  }

  async signTypedData(path: string, typedData: TypedData): Promise<Hex> {
    this.calls.push(`signTypedData:${path}`);
    this.guard();
    return this.account().signTypedData(typedData as never);
  }

  private guard(): void {
    if (this.refuse) throw new Error('Rejected on the device');
  }
}
