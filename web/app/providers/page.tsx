"use client";
import { usePoll } from "@/lib/use-poll";
import { fetchMarket, usd } from "@/lib/hourglass";

export default function Providers() {
  const { data: market } = usePoll(fetchMarket, [], 5000);
  const providers = Object.values(
    (market ?? []).reduce<Record<string, NonNullable<typeof market>[number][]>>((acc, s) => {
      (acc[s.provider] ??= []).push(s);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Providers</h1>
        <p className="text-muted text-sm max-w-2xl">
          Every provider&apos;s track record is onchain: bond posted, hours delivered as measured by the oracle network, and
          every slash. Reliability is a public, portable asset — not a marketing claim.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {providers.map((series) => {
          const p = series[0];
          const total = p.providerSettled + p.providerSlashed;
          return (
            <div key={p.provider} className="bg-panel border border-line rounded-xl p-5 space-y-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{p.providerName}</div>
                  <div className="num text-xs text-muted">{p.provider}</div>
                </div>
                <div className="text-right">
                  <div className="num text-lg">{total ? `${Math.round((p.providerSettled / total) * 100)}%` : "—"}</div>
                  <div className="text-xs text-muted">leases delivered</div>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Bond</dt>
                  <dd className="num">{usd(p.providerBond, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Free bond</dt>
                  <dd className="num">{usd(p.providerFreeBond, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Hours delivered</dt>
                  <dd className="num">{p.providerHoursDelivered.toString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Settled</dt>
                  <dd className="num">{p.providerSettled}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Slashed</dt>
                  <dd className="num text-down">{p.providerSlashed}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Series</dt>
                  <dd className="num">{series.length}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
