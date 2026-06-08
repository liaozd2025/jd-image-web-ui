import { getLegacyBridge } from "./state";
import type { WebUIElements } from "./elements";

export type { WebUIElements };

export function getEls(): WebUIElements {
  return getLegacyBridge().els;
}
