import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from './ipc/channels';

type Callback<T> = (data: T) => void;

const unsubscribers = new Map<string, () => void>();

contextBridge.exposeInMainWorld('qshield', {
  trust: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.TRUST_GET_STATE),
    subscribe: (callback: Callback<unknown>) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_SUBSCRIBE);
      unsubscribers.set('trust', () => {
        ipcRenderer.removeListener(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      });
    },
    unsubscribe: () => {
      const unsub = unsubscribers.get('trust');
      if (unsub) {
        unsub();
        unsubscribers.delete('trust');
      }
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_UNSUBSCRIBE);
    },
  },
  evidence: {
    list: (opts: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_LIST, opts),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_GET, id),
    verify: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_VERIFY, id),
    search: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_SEARCH, query),
    export: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_EXPORT, ids),
  },
  certificates: {
    generate: (opts: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CERT_GENERATE, opts),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CERT_LIST),
  },
  gateway: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_STATUS),
    connect: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_CONNECT, url),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_DISCONNECT),
  },
  alerts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ALERT_LIST),
    dismiss: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ALERT_DISMISS, id),
    subscribe: (callback: Callback<unknown>) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(IPC_EVENTS.ALERT_RECEIVED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.ALERT_SUBSCRIBE);
      unsubscribers.set('alerts', () => {
        ipcRenderer.removeListener(IPC_EVENTS.ALERT_RECEIVED, handler);
      });
    },
  },
  policy: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.POLICY_GET),
    update: (policy: unknown) => ipcRenderer.invoke(IPC_CHANNELS.POLICY_UPDATE, policy),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, key),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, key, value),
  },
  adapters: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_STATUS),
    enable: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_ENABLE, id),
    disable: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_DISABLE, id),
  },
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  },
});
