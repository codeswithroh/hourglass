import type { Driver, Machine, ProvisionRequest } from "./types.ts";

const GPU_TYPES: Record<string, string> = {
  "H100-80GB-SXM": "NVIDIA H100 80GB HBM3",
  "H100-80GB-PCIE": "NVIDIA H100 PCIe",
  "A100-80GB-PCIE": "NVIDIA A100 80GB PCIe",
  "A100-80GB-SXM": "NVIDIA A100-SXM4-80GB",
  "L40S-48GB": "NVIDIA L40S",
  "RTX4090-24GB": "NVIDIA GeForce RTX 4090",
};

/** Real GPU pods on RunPod. The provider resells its RunPod capacity as Hourglass hours. */
export class RunPodDriver implements Driver {
  name = "runpod";
  constructor(
    private apiKey: string,
    private image = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
  ) {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch("https://api.runpod.io/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`runpod: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data as T;
  }

  async provision(req: ProvisionRequest): Promise<Machine> {
    const gpuTypeId = GPU_TYPES[req.gpuModel];
    if (!gpuTypeId) throw new Error(`no RunPod mapping for ${req.gpuModel}`);
    const { podFindAndDeployOnDemand: pod } = await this.gql<{ podFindAndDeployOnDemand: { id: string } }>(
      `mutation Deploy($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) { id }
      }`,
      {
        input: {
          name: `hourglass-lease-${req.leaseId}`,
          gpuTypeId,
          gpuCount: 1,
          cloudType: "SECURE",
          imageName: this.image,
          containerDiskInGb: 40,
          ports: "22/tcp",
          startSsh: true,
          env: [{ key: "PUBLIC_KEY", value: req.sshPublicKey }],
        },
      },
    );
    const ssh = await this.waitForSsh(pod.id);
    return {
      instanceId: pod.id,
      access: {
        host: ssh.ip,
        port: ssh.port,
        user: "root",
        command: `ssh -i ~/.ssh/hourglass -p ${ssh.port} root@${ssh.ip}`,
        note: `${gpuTypeId} on RunPod`,
      },
    };
  }

  private async podRuntime(id: string) {
    const { pod } = await this.gql<{
      pod: {
        desiredStatus: string;
        runtime: {
          uptimeInSeconds: number;
          ports: { ip: string; publicPort: number; privatePort: number; isIpPublic: boolean }[];
          gpus: { id: string; gpuUtilPercent: number }[];
        } | null;
      } | null;
    }>(
      `query Pod($input: PodFilter) { pod(input: $input) {
        desiredStatus
        runtime { uptimeInSeconds ports { ip publicPort privatePort isIpPublic } gpus { id gpuUtilPercent } }
      } }`,
      { input: { podId: id } },
    );
    return pod;
  }

  private async waitForSsh(id: string) {
    for (let i = 0; i < 60; i++) {
      const pod = await this.podRuntime(id);
      const p = pod?.runtime?.ports?.find((x) => x.privatePort === 22 && x.isIpPublic);
      if (p) return { ip: p.ip, port: p.publicPort };
      await new Promise((r) => setTimeout(r, 5_000));
    }
    throw new Error(`pod ${id} did not expose SSH within 5 minutes`);
  }

  async health(instanceId: string) {
    const pod = await this.podRuntime(instanceId).catch(() => null);
    const up = pod?.desiredStatus === "RUNNING" && !!pod.runtime && (pod.runtime.gpus?.length ?? 0) > 0;
    return {
      up,
      detail: { driver: this.name, status: pod?.desiredStatus ?? "UNKNOWN", gpus: pod?.runtime?.gpus?.length ?? 0 },
    };
  }

  async terminate(instanceId: string) {
    await this.gql(`mutation Stop($input: PodTerminateInput!) { podTerminate(input: $input) }`, {
      input: { podId: instanceId },
    }).catch(() => {});
  }
}
