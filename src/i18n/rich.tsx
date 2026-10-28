import { Fragment, type ReactNode } from "react";
import { t, type MessageKey } from "./index";

/**
 * Like `t()`, but placeholders may be React nodes, so translators can move them within the sentence:
 * `tx("shell.hint.erase", { key: <Kbd>Alt</Kbd> })` with `"Hold {key} to erase"`.
 */
export function tx(key: MessageKey, vars: Record<string, ReactNode>): ReactNode {
  const plain: Record<string, string | number> = {};
  const nodes: ReactNode[] = [];
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string" || typeof v === "number") plain[k] = v;
    else {
      plain[k] = `\u0000${nodes.length}\u0000`;
      nodes.push(v);
    }
  }
  const parts = t(key, plain).split("\u0000");
  return parts.map((part, i) => <Fragment key={i}>{i % 2 ? nodes[Number(part)] : part}</Fragment>);
}
