import type { Driver, Machine, ProvisionRequest } from "./types.ts";

/**
 * In-memory machines for demos without cloud credentials. Outages can be injected through the
 * admin API so the SLA slashing path can be shown live.
 */
export class SimulatedDriver implements Driver {
  name = "simulated";
  private down = new Set<string>();

  async provision(req: ProvisionRequest): Promise<Machine> {
    const instanceId = `sim-${req.leaseId}`;
    return {
      instanceId,
      access: {
        host: `${instanceId}.sim.hourglass.compute`,
        port: 22,
        user: "hourglass",
        command: `ssh -i ~/.ssh/hourglass hourglass@${instanceId}.sim.hourglass.compute`,
        note: `Simulated ${req.gpuModel} in ${req.region}`,
      },
    };
  }

  async health(instanceId: string) {
    const up = !this.down.has(instanceId);
    return { up, detail: { driver: this.name, gpu: up ? "ok" : "unreachable" } };
  }

  async terminate(instanceId: string) {
    this.down.delete(instanceId);
  }

  setOutage(instanceId: string, down: boolean) {
    if (down) this.down.add(instanceId);
    else this.down.delete(instanceId);
  }
}
