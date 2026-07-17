import { useEffect, useState, useCallback } from "react";
import { rpc } from "@/lib/rpc";
import { MediaItem } from "@/components/MediaCard";

export function useMediaCatalog(
	drivePath: string | undefined | null,
	page: number,
	itemsPerPage: number,
	search?: string,
	filter?: "all" | "images" | "videos"
) {
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const [totalItems, setTotalItems] = useState(0);
	const [loading, setLoading] = useState(false);
	const [scanStatus, setScanStatus] = useState<{
		scanning: boolean;
		scannedCount: number;
		foundCount: number;
	} | null>(null);

	const fetchMedia = useCallback(
		async (
			path: string, 
			currentPage: number, 
			currentSearch?: string, 
			currentFilter?: "all" | "images" | "videos"
		) => {
			try {
				const res = await rpc.request.getMediaItems({
					drivePath: path,
					limit: itemsPerPage,
					offset: currentPage * itemsPerPage,
					search: currentSearch || undefined,
					filter: currentFilter || undefined,
				});
				// Only commit results from a genuinely successful read. On a
				// transient DB lock the backend returns { items: [], error },
				// and blindly applying that empty array would flash
				// "No Media Found" over already-loaded results.
				if (!res.error && res.items) {
					setMediaItems(res.items as MediaItem[]);
					setTotalItems(res.total);
				}
			} catch (err) {
				console.error("Failed to load media items:", err);
			}
		},
		[itemsPerPage]
	);

	const refresh = useCallback(async () => {
		if (drivePath) {
			await fetchMedia(drivePath, page, search, filter);
		}
	}, [drivePath, page, search, filter, fetchMedia]);

	// 1. Initial Load & Pagination Handler
	useEffect(() => {
		if (drivePath) {
			setLoading(true);
			fetchMedia(drivePath, page, search, filter).finally(() => setLoading(false));
		} else {
			setMediaItems([]);
			setTotalItems(0);
		}
	}, [drivePath, page, search, filter, fetchMedia]);

	// 2. Asynchronous Scanning Polling
	useEffect(() => {
		if (!drivePath) {
			setScanStatus(null);
			return;
		}

		const checkStatusAndRefresh = async () => {
			try {
				const status = await rpc.request.getScanStatus({ drivePath });
				setScanStatus(status);

				// Automatically refresh current page list if scanning is active
				if (status.scanning) {
					fetchMedia(drivePath, page, search, filter);
				}
				return status.scanning;
			} catch (err) {
				console.error("Failed to get scan status:", err);
				return false;
			}
		};

		// Initial check
		checkStatusAndRefresh();

		// Set up polling interval
		const interval = setInterval(async () => {
			const active = await checkStatusAndRefresh();
			if (!active) {
				// Stop polling once scan is done
				clearInterval(interval);
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [drivePath, page, search, filter, fetchMedia]);

	return {
		mediaItems,
		totalItems,
		loading,
		scanStatus,
		refresh,
	};
}
