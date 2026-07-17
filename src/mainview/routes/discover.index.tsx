import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from "react";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
	HardDrive,
	AlertCircle,
	Loader2,
	Info,
	Database,
	Compass,
	Search,
	Image as ImageIcon,
	Film as FilmIcon,
	Folder,
	RefreshCw,
	ChevronLeft,
	ChevronRight
} from "lucide-react";

export const Route = createFileRoute('/discover/')({
	component: DiscoverComponent,
})

function formatBytes(bytes: number) {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function DiscoverComponent() {
	const { selectedDrive, fetchDrives } = useDriveStore();
	const [scaffolding, setScaffolding] = useState(false);
	const [scaffoldResult, setScaffoldResult] = useState<{ success: boolean; error?: string } | null>(null);

	// Scanning states
	const [scanPath, setScanPath] = useState("");
	const [scanningError, setScanningError] = useState<string | null>(null);
	const [scanInitiated, setScanInitiated] = useState(false);
	const [scanStatus, setScanStatus] = useState<{
		scanning: boolean;
		scannedCount: number;
		foundCount: number;
		folderPath: string;
	} | null>(null);

	// Media items grid states
	const [mediaItems, setMediaItems] = useState<any[]>([]);
	const [totalItems, setTotalItems] = useState(0);
	const [page, setPage] = useState(0);
	const [itemsLoaded, setItemsLoaded] = useState(false);
	const itemsPerPage = 8;

	const runScaffolding = async (drivePath: string, maxAttempts = 5) => {
		setScaffolding(true);
		// Keep any prior successful result on screen while we (re)connect so a
		// transient RPC timeout doesn't blank the whole view.
		setScaffoldResult((prev) => (prev?.success ? prev : null));

		let lastError = "Failed to trigger native scaffolding";
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				console.log(`Scaffolding drive library at: ${drivePath} (attempt ${attempt}/${maxAttempts})`);
				const res = await rpc.request.scaffoldLibrary({ drivePath });
				if (res.success) {
					setScaffoldResult({ success: true });
					setScaffolding(false);
					return;
				}
				lastError = res.error || "Unknown filesystem error";
			} catch (err: any) {
				// The main process may be busy servicing the active scan; back off
				// briefly and retry instead of surfacing the timeout immediately.
				lastError = err.message || "Failed to trigger native scaffolding";
				console.warn(`Scaffolding attempt ${attempt} failed: ${lastError}`);
			}

			if (attempt < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
			}
		}

		setScaffoldResult({ success: false, error: lastError });
		setScaffolding(false);
	};

	const startScanning = async () => {
		if (!selectedDrive) return;
		setScanningError(null);
		
		const targetPath = scanPath.trim() || selectedDrive.path;
		try {
			const res = await rpc.request.startScan({
				drivePath: selectedDrive.path,
				folderPath: targetPath
			});
			if (res.success) {
				// Instantly update local scanning state for immediate UI response
				setScanStatus((prev) => ({
					scanning: true,
					scannedCount: prev?.scannedCount || 0,
					foundCount: prev?.foundCount || 0,
					folderPath: targetPath,
				}));
				setScanInitiated(true);
			} else {
				setScanningError(res.error || "Failed to start scanning folder");
			}
		} catch (err: any) {
			setScanningError(err.message || "RPC connection error starting scan");
		}
	};

	const fetchMediaItems = async (drivePath: string, currentPage: number) => {
		try {
			const res = await rpc.request.getMediaItems({
				drivePath,
				limit: itemsPerPage,
				offset: currentPage * itemsPerPage
			});
			if (res.items) {
				setMediaItems(res.items);
				setTotalItems(res.total);
			}
		} catch (err) {
			console.error("Failed to load indexed media items from SQLite:", err);
		} finally {
			setItemsLoaded(true);
		}
	};

	// 1. Scaffold drive when drive selection changes
	useEffect(() => {
		if (selectedDrive?.path) {
			runScaffolding(selectedDrive.path);
			setScanPath(selectedDrive.path);
			setPage(0);
			setScanInitiated(false);
			setItemsLoaded(false);
		} else {
			setScaffoldResult(null);
			setMediaItems([]);
			setTotalItems(0);
			setItemsLoaded(false);
		}
	}, [selectedDrive]);

	// 2. Poll scanner status and load DB results on completion
	useEffect(() => {
		if (!selectedDrive?.path || scaffolding || !scaffoldResult?.success) return;

		const checkStatus = async () => {
			try {
				const status = await rpc.request.getScanStatus({ drivePath: selectedDrive.path });
				setScanStatus(status);
				if (status.scanning) {
					setScanInitiated(true);
				}
				return status.scanning;
			} catch (err) {
				console.error("Failed to poll scan status:", err);
				return false;
			}
		};

		// Initial check
		checkStatus().then(() => {
			fetchMediaItems(selectedDrive.path, page);
		});

		const interval = setInterval(async () => {
			await checkStatus();
			// Always keep media list updated with what we found so far
			fetchMediaItems(selectedDrive.path, page);
		}, 1500);

		return () => clearInterval(interval);
	}, [selectedDrive, scaffolding, scaffoldResult, page]);

	// Case 1: No drive is selected
	if (!selectedDrive) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
				<div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
					<div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
					<Compass className="w-10 h-10 text-slate-500 group-hover:text-primary transition-colors duration-300" />
				</div>
				<h3 className="text-2xl font-black text-white mb-2">No Drive Selected</h3>
				<p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
					Please select a connected drive or storage volume from the sidebar to inspect files and configure folder structures.
				</p>
				<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-900 text-[10px] text-slate-500 font-medium">
					<Info className="w-3.5 h-3.5" />
					Compatible with NTFS, exFAT, ext4, and APFS drives.
				</div>
			</div>
		);
	}

	// Case 1.5: Selected drive is unmounted
	if (selectedDrive.status === "unmounted") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
				<div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
					<div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-100 transition-opacity duration-300"></div>
					<HardDrive className="w-10 h-10 text-slate-500 group-hover:text-amber-400 transition-colors duration-300 animate-pulse" />
				</div>
				<h3 className="text-2xl font-black text-white mb-2">{selectedDrive.name} is Unmounted</h3>
				<p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
					This storage device needs to be mounted before you can view, scan, or organize files on it.
				</p>
				
				<button 
					onClick={async () => {
						try {
							const res = await rpc.request.mountBlockDevice({ deviceId: selectedDrive.id });
							if (res.success && res.mountPath) {
								await fetchDrives();
							} else {
								alert(`Failed to mount: ${res.error}`);
							}
						} catch (err: any) {
							console.error(err);
						}
					}}
					className="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
				>
					Mount Drive
				</button>
			</div>
		);
	}

	// Case 1.7: Scaffolded but scan status or items not retrieved yet -> Show loading
	if (scaffoldResult?.success && (scanStatus === null || !itemsLoaded)) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[50vh]">
				<Loader2 className="w-8 h-8 text-primary animate-spin" />
				<p className="text-slate-500 text-xs mt-3">Connecting to media catalog...</p>
			</div>
		);
	}

	// Case 2: Scaffolded but database is empty and user hasn't started scan yet -> Show Discover CTA
	if (scaffoldResult?.success && totalItems === 0 && !scanStatus?.scanning && !scanInitiated) {
		return (
			<div className="space-y-6 max-w-5xl">
				{/* Drive Header Summary Card */}
				<div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
							<HardDrive className="w-6 h-6 text-white" />
						</div>
						<div>
							<h2 className="text-xl font-black text-white leading-tight">{selectedDrive.name}</h2>
							<span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">{selectedDrive.size} · {selectedDrive.type}</span>
						</div>
					</div>
					<div className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-400 select-all">
						{selectedDrive.path}
					</div>
				</div>

				{/* Discover CTA Card */}
				<div className="p-8 sm:p-12 rounded-3xl bg-slate-900/30 border border-slate-900 flex flex-col items-center text-center space-y-6 shadow-2xl relative overflow-hidden">
					<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
					
					<div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary/10 to-secondary/10 border border-primary/20 flex items-center justify-center shadow-xl shadow-primary/5 group">
						<Compass className="w-10 h-10 text-primary animate-pulse group-hover:scale-110 transition-transform duration-300" />
					</div>

					<div className="space-y-2 max-w-md">
						<h3 className="text-2xl font-black text-white tracking-tight">Discover Media Catalog</h3>
						<p className="text-slate-400 text-sm leading-relaxed">
							Scan this storage device to build a catalog of photos and videos. Your media will be indexed locally on the drive.
						</p>
					</div>

					<div className="w-full max-w-md p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-4 text-left">
						<div className="form-control w-full">
							<label className="label py-1">
								<span className="label-text text-[10px] text-slate-500 font-bold uppercase">Folder Path to Discover</span>
							</label>
							<input 
								type="text" 
								placeholder={selectedDrive.path} 
								value={scanPath}
								onChange={(e) => setScanPath(e.target.value)}
								className="input input-bordered input-sm w-full bg-slate-900 border-slate-800 text-xs focus:border-primary text-white"
							/>
						</div>
					</div>

					<button
						onClick={() => {
							setScanInitiated(true);
							startScanning();
						}}
						className="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
					>
						Discover Drive
					</button>
				</div>
			</div>
		);
	}

	// Case 3: Drive selected
	return (
		<div className="space-y-8 max-w-5xl">
			{/* Drive Header Summary Card */}
			<div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
				<div className="flex items-center gap-4">
					<div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
						<HardDrive className="w-6 h-6 text-white" />
					</div>
					<div>
						<h2 className="text-xl font-black text-white leading-tight">{selectedDrive.name}</h2>
						<span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">{selectedDrive.size} · {selectedDrive.type}</span>
					</div>
				</div>
				<div className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-400 select-all">
					{selectedDrive.path}
				</div>
			</div>

			{/* Health checks/Scaffolding state */}
			{scaffolding ? (
				<div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-900/80 flex items-center gap-4">
					<Loader2 className="w-5 h-5 text-primary animate-spin" />
					<div>
						<h4 className="font-bold text-white text-sm">Verifying Directory Structure</h4>
						<p className="text-slate-500 text-xs mt-0.5">Scaffolding library database and album folders on drive...</p>
					</div>
				</div>
			) : !scaffoldResult?.success ? (
				<div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-900/80 space-y-4">
					<div className="flex items-start gap-4 p-5 rounded-xl bg-error/10 border border-error/20 text-error">
						<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
						<div>
							<h4 className="font-bold text-white text-sm">Failed to Scaffold Library</h4>
							<p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{scaffoldResult?.error || "Unknown filesystem error"}</p>
						</div>
					</div>
					<button 
						onClick={() => runScaffolding(selectedDrive.path)} 
						className="btn btn-outline btn-error btn-sm font-bold"
					>
						Retry Scaffolding
					</button>
				</div>
			) : (
				<>
					{/* Scanner Configuration Panel */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{/* Path Selection and Start */}
						<div className="md:col-span-2 p-6 rounded-2xl bg-slate-900/40 border border-slate-900/80 space-y-4">
							<h3 className="text-sm font-black tracking-wider text-slate-400 uppercase flex items-center gap-2">
								<Search className="w-4 h-4 text-primary" /> Scan Folder for Media
							</h3>
							
							<div className="space-y-3">
								<div className="form-control w-full">
									<label className="label py-1">
										<span className="label-text text-[10px] text-slate-500 font-bold uppercase">Folder Path to Traverse</span>
									</label>
									<div className="flex gap-2">
										<input 
											type="text" 
											placeholder={selectedDrive.path} 
											value={scanPath}
											onChange={(e) => setScanPath(e.target.value)}
											disabled={scanStatus?.scanning}
											className="input input-bordered input-sm flex-grow bg-slate-950 border-slate-800 text-xs focus:border-primary text-white"
										/>
										<button 
											onClick={startScanning}
											disabled={scanStatus?.scanning}
											className="btn btn-primary btn-sm px-5 font-bold flex items-center gap-1.5"
										>
											{scanStatus?.scanning ? (
												<>
													<Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning
												</>
											) : (
												"Start Scan"
											)}
										</button>
									</div>
									<span className="text-[10px] text-slate-500 mt-1.5 leading-normal">
										The scanner runs recursively in the background, indexing files straight into SQLite. Subfolders named <code>albums/</code>, <code>node_modules/</code>, or hidden files are automatically skipped.
									</span>
								</div>

								{scanningError && (
									<div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
										<AlertCircle className="w-4 h-4" /> {scanningError}
									</div>
								)}
							</div>
						</div>

						{/* Scanning Status widget */}
						<div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900/80 flex flex-col justify-between gap-4">
							<div>
								<h3 className="text-sm font-black tracking-wider text-slate-400 uppercase">Scanner Status</h3>
								<div className="mt-4 space-y-3">
									<div className="flex justify-between text-xs border-b border-slate-900 pb-2">
										<span className="text-slate-500">State:</span>
										<span className={`font-bold uppercase ${scanStatus?.scanning ? "text-primary animate-pulse" : "text-slate-400"}`}>
											{scanStatus?.scanning ? "Scanning" : "Idle"}
										</span>
									</div>
									<div className="flex justify-between text-xs border-b border-slate-900 pb-2">
										<span className="text-slate-500">Checked Files:</span>
										<span className="font-mono text-white">{scanStatus?.scannedCount || 0}</span>
									</div>
									<div className="flex justify-between text-xs">
										<span className="text-slate-500">SQLite Cataloged:</span>
										<span className="font-mono text-emerald-400 font-bold">{scanStatus?.foundCount || 0}</span>
									</div>
								</div>
							</div>
							
							{scanStatus?.scanning && (
								<div className="w-full space-y-3">
									<div className="w-full space-y-1">
										<div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
											<div className="h-full bg-primary animate-progress w-2/3 rounded-full"></div>
										</div>
										<span className="text-[8px] text-slate-600 block text-right font-mono truncate">Traversing subdirectories...</span>
									</div>
									<button 
										onClick={async () => {
											try {
												await rpc.request.stopScan({ drivePath: selectedDrive.path });
												// Immediately update UI to stop scanning
												setScanStatus((prev) => prev ? { ...prev, scanning: false } : null);
											} catch (err) {
												console.error("Failed to stop scan:", err);
											}
										}}
										className="btn btn-outline btn-error btn-xs w-full font-bold flex items-center justify-center gap-1.5"
									>
										🛑 Stop Scan
									</button>
								</div>
							)}
						</div>
					</div>

					{/* Catalog Grid View */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<h3 className="text-sm font-black tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
									<Database className="w-4 h-4 text-emerald-400" /> Cataloged Media Library
								</h3>
								<span className="badge badge-sm badge-outline border-slate-800 text-slate-400 font-bold px-2 py-0.5">{totalItems} items</span>
							</div>
							
							<button 
								onClick={() => fetchMediaItems(selectedDrive.path, page)}
								className="btn btn-ghost btn-xs text-slate-500 hover:text-white flex items-center gap-1"
								title="Force refresh database view"
							>
								<RefreshCw className="w-3 h-3" /> Refresh View
							</button>
						</div>

						{mediaItems.length === 0 ? (
							<div className="p-12 text-center rounded-2xl bg-slate-900/10 border border-slate-900 border-dashed text-slate-500">
								<Folder className="w-12 h-12 text-slate-700 mx-auto mb-3" />
								<h4 className="font-bold text-slate-400 text-sm">SQLite Database Empty</h4>
								<p className="text-xs text-slate-600 max-w-xs mx-auto mt-1 leading-normal">
									No media files found in the database. Specify a folder and run a scan to register items.
								</p>
							</div>
						) : (
							<div className="space-y-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
									{mediaItems.map((item) => {
										const isVideo = item.mime_type.startsWith("video");
										const name = item.original_relative_path.split("/").pop();
										return (
											<div 
												key={item.id}
												className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-900 hover:border-slate-800/80 transition-all duration-150 flex items-start gap-3.5"
											>
												<div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow ${
													isVideo 
														? "bg-blue-500/10 text-blue-400" 
														: "bg-purple-500/10 text-purple-400"
												}`}>
													{isVideo ? <FilmIcon className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
												</div>
												<div className="min-w-0 flex-grow">
													<h4 className="font-bold text-white text-xs truncate leading-snug" title={name}>
														{name}
													</h4>
													<p className="text-[9px] text-slate-500 truncate mt-0.5" title={item.original_relative_path}>
														{item.original_relative_path}
													</p>
													<div className="flex items-center gap-2 mt-2">
														<span className="text-[8px] font-mono bg-slate-900 border border-slate-850 px-1 rounded text-slate-400 leading-none py-0.5">
															{formatBytes(item.file_size)}
														</span>
														<span className="text-[8px] font-semibold uppercase text-slate-500 leading-none">
															{item.mime_type.split("/")[1]}
														</span>
													</div>
												</div>
											</div>
										);
									})}
								</div>

								{/* Pagination */}
								{totalItems > itemsPerPage && (
									<div className="flex items-center justify-between border-t border-slate-900 pt-4">
										<span className="text-[10px] text-slate-500 font-medium">
											Showing {page * itemsPerPage + 1} - {Math.min((page + 1) * itemsPerPage, totalItems)} of {totalItems} items
										</span>
										<div className="flex items-center gap-1">
											<button 
												disabled={page === 0}
												onClick={() => setPage(p => Math.max(0, p - 1))}
												className="btn btn-square btn-outline btn-xs border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white"
											>
												<ChevronLeft className="w-3.5 h-3.5" />
											</button>
											<span className="text-[10px] font-bold text-white px-2">
												Page {page + 1}
											</span>
											<button 
												disabled={(page + 1) * itemsPerPage >= totalItems}
												onClick={() => setPage(p => p + 1)}
												className="btn btn-square btn-outline btn-xs border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white"
											>
												<ChevronRight className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
