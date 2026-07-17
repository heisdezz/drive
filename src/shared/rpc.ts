import type { ElectrobunRPCSchema } from "electrobun";

export interface MainRPC extends ElectrobunRPCSchema {
	bun: {
		requests: {
			getDrives: {
				params: undefined;
				response: {
					id: string;
					name: string;
					type: "internal" | "external" | "network";
					size: string;
					usedPercentage: number;
					status: "mounted" | "unmounted" | "syncing" | "unmounting";
					path: string;
				}[];
			};
			mountDrive: {
				params: undefined;
				response: {
					success: boolean;
					drive?: {
						id: string;
						name: string;
						type: "internal" | "external" | "network";
						size: string;
						usedPercentage: number;
						status: "mounted" | "unmounted" | "syncing" | "unmounting";
						path: string;
					};
					error?: string;
				};
			};
			mountBlockDevice: {
				params: { deviceId: string };
				response: {
					success: boolean;
					mountPath?: string;
					error?: string;
				};
			};
			scaffoldLibrary: {
				params: { drivePath: string };
				response: { success: boolean; error?: string };
			};
			startScan: {
				params: { drivePath: string; folderPath: string };
				response: { success: boolean; error?: string };
			};
			stopScan: {
				params: { drivePath: string };
				response: { success: boolean };
			};
			getScanStatus: {
				params: { drivePath: string };
				response: {
					scanning: boolean;
					scannedCount: number;
					foundCount: number;
					folderPath: string;
				};
			};
			getMediaItems: {
				params: { 
					drivePath: string; 
					limit: number; 
					offset: number;
					search?: string;
					filter?: "all" | "images" | "videos";
				};
				response: {
					items: {
						id: number;
						file_hash: string;
						original_relative_path: string;
						current_relative_path: string;
						file_size: number;
						mime_type: string;
						created_at: string;
					}[];
					total: number;
					error?: string;
				};
			};
			getMediaItem: {
				params: { drivePath: string; itemId: number; albumId?: number };
				response: {
					item?: {
						id: number;
						file_hash: string;
						original_relative_path: string;
						current_relative_path: string;
						file_size: number;
						mime_type: string;
						created_at: string;
					};
					nextId?: number | null;
					prevId?: number | null;
					error?: string;
				};
			};
			backupDatabase: {
				params: { drivePath: string };
				response: { success: boolean; backupPath?: string; error?: string };
			};
			listBackups: {
				params: { drivePath: string };
				response: {
					backups: { name: string; size: number; createdAt: string }[];
					error?: string;
				};
			};
			getRelatedMedia: {
				params: { drivePath: string; itemId: number; limit: number };
				response: {
					items: {
						id: number;
						file_hash: string;
						original_relative_path: string;
						current_relative_path: string;
						file_size: number;
						mime_type: string;
						created_at: string;
					}[];
					error?: string;
				};
			};
			getThumbnail: {
				params: {
					mediaId: number;
					relativePath: string;
					drivePath: string;
					fileHash: string;
				};
				response: {
					success: boolean;
					url?: string;
					error?: string;
				};
			};
			openExternal: {
				params: { drivePath: string; relativePath: string };
				response: { success: boolean; error?: string };
			};
			getLogs: {
				params: undefined;
				response: {
					logs: {
						timestamp: string;
						level: "info" | "warn" | "error" | "failure";
						message: string;
						context?: string;
					}[];
				};
			};
			getAlbums: {
				params: { drivePath: string };
				response: {
					albums: {
						id: number;
						name: string;
						relative_path: string;
						description: string | null;
						created_at: string;
						media_count: number;
						preview_item?: {
							id: number;
							file_hash: string;
							original_relative_path: string;
							current_relative_path: string;
							mime_type: string;
						};
					}[];
					error?: string;
				};
			};
			getAlbum: {
				params: { drivePath: string; albumId: number };
				response: {
					album?: {
						id: number;
						name: string;
						relative_path: string;
						description: string | null;
						created_at: string;
					};
					error?: string;
				};
			};
			getAlbumMedia: {
				params: { drivePath: string; albumId: number; limit: number; offset: number; search?: string };
				response: {
					items: {
						id: number;
						file_hash: string;
						original_relative_path: string;
						current_relative_path: string;
						file_size: number;
						mime_type: string;
						created_at: string;
					}[];
					total: number;
					error?: string;
				};
			};
			moveMediaItemsToAlbum: {
				params: {
					drivePath: string;
					mediaIds: number[];
					targetAlbumId: number;
				};
				response: {
					success: boolean;
					movedCount: number;
					error?: string;
				};
			};
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
}
