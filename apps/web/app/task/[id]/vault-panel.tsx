"use client";

import type { Mandate } from "@custodia/schema";
import {
  capsFromMandate,
  deployArgs,
  etherscanAddress,
  etherscanTx,
  formatAmount,
  SEPOLIA,
  taskVaultAbi,
  taskVaultBytecode,
} from "@custodia/vault";
import { useState } from "react";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  type Hex,
  http,
  parseEther,
} from "viem";
import { sepolia } from "viem/chains";

type VaultView = {
  address: Address;
  active: boolean;
  expiry: number;
  actionNonce: number;
  weth: string;
  usdc: string;
  caps: {
    weth: { maxTrade: string; maxCumulative: string };
    usdc: { maxTrade: string; maxCumulative: string };
  };
  spent: { weth: string; usdc: string };
};

type ActionView = {
  id: string;
  status: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string | null;
  txHash: string | null;
  reason: string | null;
  createdAt: string;
};

const getEthereum = () => {
  const provider = (window as Window & { ethereum?: unknown }).ethereum;
  if (!provider) throw new Error("Connect a browser wallet.");
  return provider as Parameters<typeof custom>[0];
};

const wallet = async () => {
  const client = createWalletClient({ chain: sepolia, transport: custom(getEthereum()) });
  const [account] = await client.requestAddresses();
  if (!account) throw new Error("The wallet did not return an account.");
  await client.switchChain({ id: sepolia.id }).catch(() => undefined);
  return { client, account };
};

const pub = () => createPublicClient({ chain: sepolia, transport: http() });

/**
 * Deploy, fund, watch and revoke the task's on-chain vault. Every transaction
 * here is signed by the owner's wallet; the server only records the address
 * after verifying the deployed contract on-chain.
 */
export function VaultPanel({
  taskId,
  taskStatus,
  mandate,
  mandateHash,
  priceUsd,
  signers,
  vault,
  actions,
  onChanged,
}: {
  taskId: string;
  taskStatus: string;
  mandate: Mandate | null;
  mandateHash: string | null;
  priceUsd: number | null;
  signers: { execution: string | null; policy: string | null };
  vault: VaultView | null;
  actions: ActionView[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depositEth, setDepositEth] = useState("0.02");
  const [withdrawEth, setWithdrawEth] = useState("0.01");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message.split("\n")[0] ?? message);
    } finally {
      setBusy(null);
    }
  };

  const deploy = () =>
    run("Deploying vault…", async () => {
      if (!mandate || !mandateHash) throw new Error("Sign the mandate first.");
      if (!signers.execution || !signers.policy)
        throw new Error("Execution keys are not configured on the server.");
      if (!priceUsd) throw new Error("No ETH price available to size the limits.");
      const { client, account } = await wallet();
      const caps = capsFromMandate(mandate, priceUsd);
      const data = encodeDeployData({
        abi: taskVaultAbi,
        bytecode: taskVaultBytecode,
        args: deployArgs({
          owner: account,
          executionSigner: signers.execution as Address,
          policySigner: signers.policy as Address,
          mandateHash: mandateHash as Hex,
          mandateVersion: 1,
          caps,
        }),
      });
      const hash = await client.sendTransaction({ account, data, chain: sepolia });
      const receipt = await pub().waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error("Deployment did not return an address.");
      const response = await fetch(`/api/tasks/${taskId}/vault`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vault: receipt.contractAddress }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The server did not accept the vault.");
    });

  const deposit = () =>
    run("Depositing…", async () => {
      if (!vault) return;
      const { client, account } = await wallet();
      const hash = await client.writeContract({
        account,
        chain: sepolia,
        address: vault.address,
        abi: taskVaultAbi,
        functionName: "deposit",
        value: parseEther(depositEth),
      });
      await pub().waitForTransactionReceipt({ hash });
    });

  const withdraw = () =>
    run("Withdrawing…", async () => {
      if (!vault) return;
      const { client, account } = await wallet();
      const hash = await client.writeContract({
        account,
        chain: sepolia,
        address: vault.address,
        abi: taskVaultAbi,
        functionName: "withdrawEth",
        args: [parseEther(withdrawEth), account],
      });
      await pub().waitForTransactionReceipt({ hash });
    });

  const revokeOnChain = () =>
    run("Revoking on-chain…", async () => {
      if (!vault) return;
      const { client, account } = await wallet();
      const hash = await client.writeContract({
        account,
        chain: sepolia,
        address: vault.address,
        abi: taskVaultAbi,
        functionName: "revoke",
      });
      await pub().waitForTransactionReceipt({ hash });
    });

  const caps = mandate && priceUsd ? capsFromMandate(mandate, priceUsd) : null;

  return (
    <section className="guard-page__details" id="vault">
      <p className="guard-card__eyebrow">Real execution</p>
      <h2>Task vault</h2>
      {!vault ? (
        <>
          <p className="guard-page__muted">
            Deploy a vault owned by your wallet and bound to this signed mandate. The agent can then
            execute orders from chat — only inside the limits below, only through Uniswap V3 on
            Sepolia, and the proceeds never leave the vault. You can withdraw or revoke at any time.
          </p>
          {caps && (
            <p className="guard-page__muted">
              Limits that will be enforced on-chain: per trade{" "}
              {formatAmount(SEPOLIA.weth, caps.weth.maxTrade)} /{" "}
              {formatAmount(SEPOLIA.usdc, caps.usdc.maxTrade)}, total{" "}
              {formatAmount(SEPOLIA.weth, caps.weth.maxCumulative)} /{" "}
              {formatAmount(SEPOLIA.usdc, caps.usdc.maxCumulative)}, 60 s between actions, until{" "}
              {new Date(Number(caps.expiry) * 1000).toLocaleString()}.
            </p>
          )}
          <div className="guard-preview__action">
            <button
              disabled={busy !== null || taskStatus !== "active" || !mandate}
              onClick={() => void deploy()}
              type="button"
            >
              {busy ?? "Deploy vault (one transaction)"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="guard-page__muted">
            Vault{" "}
            <a href={etherscanAddress(vault.address)} rel="noreferrer" target="_blank">
              {vault.address.slice(0, 8)}…{vault.address.slice(-4)}
            </a>{" "}
            · {vault.active ? "active" : "revoked"} · {vault.actionNonce} action
            {vault.actionNonce === 1 ? "" : "s"} executed
          </p>
          <p>
            <strong>{formatAmount(SEPOLIA.weth, BigInt(vault.weth))}</strong> ·{" "}
            <strong>{formatAmount(SEPOLIA.usdc, BigInt(vault.usdc))}</strong>
            <span className="guard-page__muted">
              {" "}
              in the vault · spent {formatAmount(SEPOLIA.weth, BigInt(vault.spent.weth))} of{" "}
              {formatAmount(SEPOLIA.weth, BigInt(vault.caps.weth.maxCumulative))} ETH cap,{" "}
              {formatAmount(SEPOLIA.usdc, BigInt(vault.spent.usdc))} of{" "}
              {formatAmount(SEPOLIA.usdc, BigInt(vault.caps.usdc.maxCumulative))} USDC cap
            </span>
          </p>
          <p className="guard-page__muted">
            From chat, say “swap 0.01 ETH to USDC” or “buy 0.005 ETH”. Orders over the per-trade
            limit ({formatAmount(SEPOLIA.weth, BigInt(vault.caps.weth.maxTrade))} /{" "}
            {formatAmount(SEPOLIA.usdc, BigInt(vault.caps.usdc.maxTrade))}) are refused on-chain.
          </p>
          <label>
            Deposit ETH{" "}
            <input
              disabled={busy !== null}
              min="0.001"
              onChange={(e) => setDepositEth(e.target.value)}
              step="0.001"
              type="number"
              value={depositEth}
            />
          </label>
          <label>
            Withdraw ETH{" "}
            <input
              disabled={busy !== null}
              min="0.001"
              onChange={(e) => setWithdrawEth(e.target.value)}
              step="0.001"
              type="number"
              value={withdrawEth}
            />
          </label>
          <div className="guard-preview__action">
            <button
              disabled={busy !== null || !vault.active}
              onClick={() => void deposit()}
              type="button"
            >
              {busy === "Depositing…" ? busy : "Deposit"}
            </button>
            <button disabled={busy !== null} onClick={() => void withdraw()} type="button">
              {busy === "Withdrawing…" ? busy : "Withdraw"}
            </button>
            <button
              disabled={busy !== null || !vault.active}
              onClick={() => void revokeOnChain()}
              type="button"
            >
              {busy === "Revoking on-chain…" ? busy : "Revoke vault"}
            </button>
          </div>
          {actions.length > 0 && (
            <ul className="guard-page__list">
              {actions.map((a) => (
                <li key={a.id}>
                  <strong>{a.status}</strong> ·{" "}
                  {formatAmount(a.tokenIn as Address, BigInt(a.amountIn))} →{" "}
                  {a.amountOut
                    ? formatAmount(a.tokenOut as Address, BigInt(a.amountOut))
                    : a.tokenOut.toLowerCase() === SEPOLIA.usdc.toLowerCase()
                      ? "USDC"
                      : "ETH"}
                  {a.txHash && (
                    <>
                      {" · "}
                      <a href={etherscanTx(a.txHash as Hex)} rel="noreferrer" target="_blank">
                        tx {a.txHash.slice(0, 10)}…
                      </a>
                    </>
                  )}
                  {a.reason && a.status !== "confirmed" && (
                    <span className="guard-page__muted"> · {a.reason}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="chat-error">{error}</p>}
    </section>
  );
}
