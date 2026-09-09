import type { Sha256Hex } from '../domain/common.js';

export interface HashPort {
  sha256Hex(data: string | Uint8Array): Promise<Sha256Hex>;
}
