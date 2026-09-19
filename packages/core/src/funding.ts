import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { USDC_ASSET } from "./types.js";

export interface TreasuryOptions {
  privateKey: Hex;
  rpcUrl?: string;
  asset?: Hex;
}

export interface Treasury {
  address: Hex;
  /** Agent 지갑에 USDC(atomic units)를 보내고 tx hash를 돌려준다. */
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
  return {
    address: account.address,
    async fund(to, amount) {
      const hash = await wallet.writeContract({
        address: asset,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, BigInt(amount)],
      });
      await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
      return hash;
    },
    async balanceOf(address) {
      return pub.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    },
  };
}
