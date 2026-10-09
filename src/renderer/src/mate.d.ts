import type { MateApi } from '../../preload/index';

declare global {
  interface Window {
    mate: MateApi;
  }
}

export {};
