import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/counter")({
	component: Counter,
});

function Counter() {
	const [count, setCount] = useState(0);
	const [history, setHistory] = useState<number[]>([]);

	const handleIncrement = () => {
		setCount((c) => {
			const next = c + 1;
			setHistory((h) => [next, ...h.slice(0, 4)]);
			return next;
		});
	};

	const handleDecrement = () => {
		setCount((c) => {
			const next = c - 1;
			setHistory((h) => [next, ...h.slice(0, 4)]);
			return next;
		});
	};

	const handleReset = () => {
		setCount(0);
		setHistory((h) => [0, ...h.slice(0, 4)]);
	};

	return (
		<div className="max-w-xl mx-auto space-y-8">
			{/* Hero Title */}
			<div className="text-center space-y-2">
				<h2 className="text-3xl font-extrabold text-white">Interactive Counter</h2>
				<p className="text-slate-400 text-sm">
					Testing React local state persistence across route transitions.
				</p>
			</div>

			{/* Counter Module Card */}
			<div className="relative p-8 rounded-3xl bg-slate-900/40 border border-slate-800 shadow-2xl backdrop-blur-sm overflow-hidden flex flex-col items-center">
				<div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
				<div className="absolute -bottom-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>

				{/* Huge Count Display */}
				<div className="h-44 w-44 rounded-full border-4 border-indigo-500/30 bg-slate-950 flex items-center justify-center shadow-inner mb-8 transition-transform duration-300 hover:scale-105">
					<span className="text-6xl font-black text-indigo-400 tracking-tighter select-none">
						{count}
					</span>
				</div>

				{/* Controls */}
				<div className="flex items-center gap-3 w-full sm:w-auto">
					<button
						onClick={handleDecrement}
						className="flex-1 sm:flex-none px-6 py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-indigo-400 font-extrabold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
					>
						- Decrement
					</button>
					<button
						onClick={handleIncrement}
						className="flex-1 sm:flex-none px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 hover:scale-105 active:scale-95"
					>
						+ Increment
					</button>
					<button
						onClick={handleReset}
						className="px-5 py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
					>
						Reset
					</button>
				</div>
			</div>

			{/* State Transition History */}
			<div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-900/80 space-y-4">
				<h3 className="text-sm font-bold text-slate-400 tracking-wider">STATE LOGS</h3>
				{history.length === 0 ? (
					<p className="text-slate-600 text-xs italic">No actions recorded in this session yet.</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{history.map((h, i) => (
							<span
								key={i}
								className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all duration-300 ${
									i === 0
										? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 font-bold"
										: "bg-slate-950/40 border-slate-900 text-slate-500"
								}`}
							>
								{i === 0 ? "Latest: " : ""}
								{h}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
