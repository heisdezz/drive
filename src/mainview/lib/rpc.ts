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
	// Electrobun defaults to a 1s request timeout, which is far too short for
	// slow disk operations (e.g. moving files across the USB drive, where the
	// backend may fall back to copy+delete). The move actually succeeds, but the
	// client would reject with "RPC request timed out." before the response
	// arrives. Use a generous timeout so long-running requests aren't killed.
	maxRequestTime: 5 * 60 * 1000,
	handlers: {
		requests: {},
		messages: {},
	},
});

// Instantiate Electroview once — this wires up the WebSocket transport
const electroview = new Electroview({ rpc: rpcDescriptor });

// Export the live RPC object for use in all components and routes
export const rpc = electroview.rpc!;
