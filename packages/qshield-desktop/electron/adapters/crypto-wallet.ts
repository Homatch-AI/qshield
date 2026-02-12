import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface CryptoEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const CHAINS = ['bitcoin', 'ethereum', 'solana', 'polygon', 'arbitrum', 'optimism'] as const;
const WALLET_ADDRESSES = {
  ethereum: [
    '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  ],
  bitcoin: [
    'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  ],
  solana: [
    'DRpbCBMxVnDK7maPMoGQfFiKLmGnvhRVnQrFVH5pZ5Bz',
    '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  ],
};

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomAddress(chain: string): string {
  const addrs = WALLET_ADDRESSES[chain as keyof typeof WALLET_ADDRESSES];
  if (addrs) return pickRandom(addrs);
  return pickRandom(WALLET_ADDRESSES.ethereum);
}

function randomTxHash(chain: string): string {
  const hex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  if (chain === 'bitcoin') return hex;
  return `0x${hex}`;
}

const CRYPTO_EVENTS: CryptoEventTemplate[] = [
  {
    eventType: 'clipboard-check',
    trustImpact: 5,
    dataGenerator: () => {
      const chain = pickRandom(CHAINS);
      return {
        chain,
        clipboardContent: randomAddress(chain),
        isCryptoAddress: true,
        matchesTrusted: Math.random() > 0.3,
        scamDetected: Math.random() > 0.95,
        checkTimestamp: new Date().toISOString(),
      };
    },
  },
  {
    eventType: 'transaction-signed',
    trustImpact: -10,
    dataGenerator: () => {
      const chain = pickRandom(CHAINS);
      return {
        chain,
        txHash: randomTxHash(chain),
        from: randomAddress(chain),
        to: randomAddress(chain),
        amount: (Math.random() * 10).toFixed(6),
        currency: chain === 'bitcoin' ? 'BTC' : chain === 'solana' ? 'SOL' : 'ETH',
        gasEstimate: chain === 'bitcoin' ? undefined : `${(Math.random() * 50 + 5).toFixed(2)} gwei`,
        verified: Math.random() > 0.2,
      };
    },
  },
  {
    eventType: 'wallet-connected',
    trustImpact: 15,
    dataGenerator: () => {
      const chain = pickRandom(CHAINS);
      return {
        chain,
        walletType: pickRandom(['MetaMask', 'Phantom', 'Ledger', 'Trezor', 'Coinbase Wallet', 'WalletConnect']),
        address: randomAddress(chain),
        isHardwareWallet: Math.random() > 0.6,
        networkId: chain === 'ethereum' ? 1 : chain === 'polygon' ? 137 : undefined,
      };
    },
  },
  {
    eventType: 'address-verified',
    trustImpact: 10,
    dataGenerator: () => {
      const chain = pickRandom(CHAINS);
      return {
        chain,
        address: randomAddress(chain),
        checksumValid: Math.random() > 0.1,
        inTrustedBook: Math.random() > 0.4,
        scamDetected: false,
        verificationMethod: pickRandom(['checksum', 'manual', 'ens-lookup', 'contact-book']),
      };
    },
  },
  {
    eventType: 'chain-mismatch',
    trustImpact: -25,
    dataGenerator: () => ({
      expectedChain: pickRandom(CHAINS),
      actualChain: pickRandom(CHAINS),
      address: randomAddress('ethereum'),
      riskLevel: 'danger',
      description: 'Transaction target chain does not match expected chain',
    }),
  },
];

/**
 * Crypto Wallet adapter.
 * Monitors cryptocurrency wallet activity including clipboard hijack detection,
 * transaction signing, wallet connections, and address verification.
 * Produces simulated events at a configurable interval (default 12 seconds).
 */
export class CryptoWalletAdapter extends BaseAdapter {
  readonly id: AdapterType = 'crypto';
  readonly name = 'Crypto Wallet Monitor';
  protected override defaultInterval = 12000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[CryptoWalletAdapter] Configured for crypto wallet monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[CryptoWalletAdapter] Monitoring crypto wallet activity');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[CryptoWalletAdapter] Stopped crypto monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[CryptoWalletAdapter] Crypto adapter destroyed');
  }

  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(CRYPTO_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
