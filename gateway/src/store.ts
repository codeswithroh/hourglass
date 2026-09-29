import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export interface LeaseRecord {
  leaseId: string;
  instanceId: string;
  encryptedAccess: `0x${string}`;
  healthUrl: string;
  hours: number;
  provisionedAt: number;
  endsAt: number;
  terminated?: boolean;
}

/** Tiny durable JSON store: provisioning results must survive restarts so repeated CRE calls stay idempotent. */
export class Store {
  private data: Record<string, LeaseRecord> = {};
  constructor(private path: string) {
    try {
      this.data = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      mkdirSync(dirname(path), { recursive: true });
    }
  }
  get(id: string) {
    return this.data[id];
  }
  all() {
    return Object.values(this.data);
  }
  put(rec: LeaseRecord) {
    this.data[rec.leaseId] = rec;
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
