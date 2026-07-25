import type { RpcHandlers } from "./types";
import { driveHandlers } from "./drives";
import { scanHandlers } from "./scan";
import { mediaHandlers } from "./media";
import { albumHandlers } from "./albums";
import { backupHandlers } from "./backup";
import { miscHandlers } from "./misc";

// Exhaustive map of every RPC request handler, assembled from the per-domain
// groups. Typed as RpcHandlers so a missing or mistyped handler is a compile
// error here rather than surfacing at runtime.
export const requestHandlers: RpcHandlers = {
	...driveHandlers,
	...scanHandlers,
	...mediaHandlers,
	...albumHandlers,
	...backupHandlers,
	...miscHandlers,
};
