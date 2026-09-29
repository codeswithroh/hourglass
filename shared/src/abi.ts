/** Minimal Hourglass ABI fragments shared by the gateway and the web app. Full ABI: contracts/out/Hourglass.sol */
export const hourglassAbi = [
  {
    type: "event",
    name: "LeaseRequested",
    inputs: [
      { name: "leaseId", type: "uint256", indexed: true },
      { name: "seriesId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "provider", type: "address", indexed: false },
      { name: "hoursCount", type: "uint32", indexed: false },
      { name: "sshPublicKey", type: "string", indexed: false },
      { name: "encryptionPublicKey", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "getLease",
    stateMutability: "view",
    inputs: [{ name: "leaseId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "seriesId", type: "uint256" },
          { name: "holder", type: "address" },
          { name: "hoursCount", type: "uint32" },
          { name: "requestedAt", type: "uint64" },
          { name: "startedAt", type: "uint64" },
          { name: "uptimeBps", type: "uint16" },
          { name: "status", type: "uint8" },
          { name: "probesTotal", type: "uint32" },
          { name: "probesUp", type: "uint32" },
          { name: "payout", type: "uint256" },
          { name: "accessKeysHash", type: "bytes32" },
          { name: "healthUrl", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getSeries",
    stateMutability: "view",
    inputs: [{ name: "seriesId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "provider", type: "address" },
          { name: "token", type: "address" },
          { name: "gpuModel", type: "bytes32" },
          { name: "region", type: "bytes32" },
          { name: "deliveryStart", type: "uint64" },
          { name: "deliveryEnd", type: "uint64" },
          { name: "minUptimeBps", type: "uint16" },
          { name: "expiredReleased", type: "bool" },
          { name: "penaltyPerHour", type: "uint256" },
          { name: "primaryPrice", type: "uint256" },
          { name: "primaryRemaining", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const LeaseStatus = { None: 0, Requested: 1, Active: 2, Settled: 3, Slashed: 4 } as const;
