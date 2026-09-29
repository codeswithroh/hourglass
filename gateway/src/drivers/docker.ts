import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Driver, Machine, ProvisionRequest } from "./types.ts";

const run = promisify(execFile);

/**
 * Real SSH-able containers on the provider's own host (CPU stand-in for a GPU node).
 * The holder's passkey-derived key is the only authorized key.
 */
export class DockerDriver implements Driver {
  name = "docker";
  constructor(
    private publicHost: string,
    private image = "lscr.io/linuxserver/openssh-server:latest",
  ) {}

  async provision(req: ProvisionRequest): Promise<Machine> {
    const name = `hourglass-lease-${req.leaseId}`;
    // Reuse the container if a previous attempt already created it (provisioning must be idempotent).
    const existing = await run("docker", ["ps", "-aq", "-f", `name=^${name}$`]).then((r) => r.stdout.trim());
    if (!existing) {
      await run("docker", [
        "run", "-d", "--name", name, "-p", "0:2222",
        "-e", `PUBLIC_KEY=${req.sshPublicKey}`,
        "-e", "USER_NAME=hourglass",
        "-e", "PASSWORD_ACCESS=false",
        "--label", `hourglass.lease=${req.leaseId}`,
        this.image,
      ]);
    }
    const port = await run("docker", ["port", name, "2222/tcp"]).then((r) =>
      Number(r.stdout.trim().split("\n")[0].split(":").pop()),
    );
    return {
      instanceId: name,
      access: {
        host: this.publicHost,
        port,
        user: "hourglass",
        command: `ssh -i ~/.ssh/hourglass -p ${port} hourglass@${this.publicHost}`,
        note: `Container stand-in for ${req.gpuModel} (${req.region})`,
      },
    };
  }

  async health(instanceId: string) {
    try {
      const { stdout } = await run("docker", ["inspect", "-f", "{{.State.Running}}", instanceId]);
      const up = stdout.trim() === "true";
      return { up, detail: { driver: this.name, running: up } };
    } catch {
      return { up: false, detail: { driver: this.name, running: false } };
    }
  }

  async terminate(instanceId: string) {
    await run("docker", ["rm", "-f", instanceId]).catch(() => {});
  }
}
