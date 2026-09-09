import { createHash } from 'node:crypto';
import type { Sha256Hex } from '../../domain/common.js';
import type { HashPort } from '../../ports/hash.js';

export class Sha256Hash implements HashPort {
  async sha256Hex(data: string | Uint8Array): Promise<Sha256Hex> {
    return createHash('sha256').update(data).digest('hex');
  }
}
