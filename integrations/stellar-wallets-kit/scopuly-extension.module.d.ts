import type {
  IOnChangeEvent,
  ModuleInterface,
  ModuleType,
} from '@creit.tech/stellar-wallets-kit/types';

export declare const SCOPULY_EXTENSION_ID = "scopuly-extension";

export declare class ScopulyExtensionModule implements ModuleInterface {
  moduleType: ModuleType;
  productId: string;
  productName: string;
  productUrl: string;
  productIcon: string;
  runChecks(): Promise<void>;
  isAvailable(): Promise<boolean>;
  isPlatformWrapper(): Promise<boolean>;
  onChange(callback: (event: IOnChangeEvent) => void): void;
  getAddress(params?: {
    path?: string;
    skipRequestAccess?: boolean;
  }): Promise<{address: string}>;
  signTransaction(xdr: string, opts?: {
    networkPassphrase?: string;
    address?: string;
    path?: string;
  }): Promise<{signedTxXdr: string; signerAddress?: string}>;
  signAndSubmitTransaction(xdr: string, opts?: {
    networkPassphrase?: string;
    address?: string;
  }): Promise<{status: "success" | "pending"}>;
  signAuthEntry(authEntry: string, opts?: {
    networkPassphrase?: string;
    address?: string;
    path?: string;
  }): Promise<{signedAuthEntry: string; signerAddress?: string}>;
  signMessage(message: string, opts?: {
    networkPassphrase?: string;
    address?: string;
    path?: string;
  }): Promise<{signedMessage: string; signerAddress?: string}>;
  reportX402Receipt(receipt?: {
    receiptId?: string;
    receiptUrl?: string;
  }): Promise<{receiptId: string; status: string; transaction?: string}>;
  getNetwork(): Promise<{network: string; networkPassphrase: string}>;
  disconnect(): Promise<void>;
}
