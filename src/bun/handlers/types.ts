import type { MainRPC } from "../../shared/rpc";

type Requests = MainRPC["bun"]["requests"];

// Maps each RPC request name to its `(params) => Promise<response>` handler.
// Domain handler files export a `Pick<RpcHandlers, ...>` of this so each group
// is type-checked in isolation, and the assembled object stays exhaustive.
export type RpcHandlers = {
	[K in keyof Requests]: (
		params: Requests[K]["params"]
	) => Promise<Requests[K]["response"]>;
};
