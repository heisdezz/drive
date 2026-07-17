import { Electroview } from "electrobun/view";
import type { MainRPC } from "../../shared/rpc";

/**
 * Shared Electroview RPC singleton.
 *
 * Electroview.defineRPC() only creates the RPC descriptor with a stub transport.
 * The live WebSocket transport is wired up only when `new Electroview({ rpc })`
 * is instantiated. Therefore we MUST create the instance here once and export
 * the resulting `rpc` object for use across the app.
 *
 * DO NOT call Electroview.defineRPC() in individual components - it produces a
 * dead transport that cannot send or receive messages.
 */
const rpcDescriptor = Electroview.defineRPC<MainRPC>({
	handlers: {
		requests: {},
		messages: {},
	},
});

// Instantiate Electroview once — this wires up the WebSocket transport
const electroview = new Electroview({ rpc: rpcDescriptor });

// Export the live RPC object for use in all components and routes
export const rpc = electroview.rpc!;
