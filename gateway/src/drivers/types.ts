export interface ProvisionRequest {
  leaseId: string;
  gpuModel: string;
  region: string;
  hours: number;
  sshPublicKey: string;
}

export interface Machine {
  instanceId: string;
  /** Human-readable access details. Sealed to the holder's passkey key before leaving the gateway. */
  access: { host: string; port: number; user: string; command: string; note?: string };
}

/** A compute backend the provider sells capacity from. */
export interface Driver {
  name: string;
  provision(req: ProvisionRequest): Promise<Machine>;
  /** true = machine reachable and GPU healthy. */
  health(instanceId: string): Promise<{ up: boolean; detail: Record<string, unknown> }>;
  terminate(instanceId: string): Promise<void>;
}
