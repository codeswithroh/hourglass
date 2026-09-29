import { parseAbi, parseAbiParameters } from "viem"

export const Hourglass = parseAbi([
  "event LeaseRequested(uint256 indexed leaseId, uint256 indexed seriesId, address indexed holder, address provider, uint32 hoursCount, string sshPublicKey, bytes32 encryptionPublicKey)",
  "function activeLeases() view returns (uint256[] ids, string[] healthUrls)",
  "function getLease(uint256) view returns ((uint256 seriesId,address holder,uint32 hoursCount,uint64 requestedAt,uint64 startedAt,uint16 uptimeBps,uint8 status,uint32 probesTotal,uint32 probesUp,uint256 payout,bytes32 accessKeysHash,string healthUrl))",
])

/** report = abi.encode(uint8 kind, uint256 leaseId, bytes payload) — see Hourglass.onReport */
export const REPORT = parseAbiParameters("uint8 kind, uint256 leaseId, bytes payload")
export const PROVISIONED_PAYLOAD = parseAbiParameters("bytes encryptedAccess, string healthUrl")
export const PROBES_PAYLOAD = parseAbiParameters("uint256[] leaseIds, bool[] up")

export const ReportKind = { Provisioned: 1, Probes: 2, Failed: 3 } as const
