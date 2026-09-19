import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { USDC_ASSET } from "./types";

export interface TreasuryOptions {
  privateKey: Hex;
  rpcUrl?: string;
  asset?: Hex;
}

export interface Treasury {
  address: Hex;
  /** USDC(atomic units) 전송 트랜잭션을 보내고 tx hash만 돌려준다. 영수증은 `confirm`으로 확인한다. */
  send(to: Hex, amount: string): Promise<Hex>;
  /** 전송 영수증을 기다린다. 되돌려졌으면 throw. */
  confirm(hash: Hex, timeoutMs?: number): Promise<void>;
  /** `send` + `confirm`. */
  fund(to: Hex, amount: string): Promise<Hex>;
  balanceOf(address: Hex): Promise<bigint>;
}

/** 플랫폼이 보유한 테스트넷 USDC 지갑. Delegation 발급 시 Agent 지갑에 자금을 넣는다. */
export function createTreasury(opts: TreasuryOptions): Treasury {
  const account = privateKeyToAccount(opts.privateKey);
  const transport = http(opts.rpcUrl);
  const asset = (opts.asset ?? USDC_ASSET) as Hex;
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const pub = createPublicClient({ chain: baseSepolia, transport });
  const treasury: Treasury = {
    address: account.address,
    send(to, amount) {
      return wallet.writeContract({
        address: asset,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, BigInt(amount)],
      });
    },
    async confirm(hash, timeoutMs = 60_000) {
      const receipt = await pub.waitForTransactionReceipt({ hash, confirmations: 1, timeout: timeoutMs });
      if (receipt.status !== "success") throw new Error(`USDC transfer ${hash} reverted`);
    },
    async fund(to, amount) {
      const hash = await treasury.send(to, amount);
      await treasury.confirm(hash);
      return hash;
    },
    async balanceOf(address) {
      return pub.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    },
  };
  return treasury;
}
