// Worker que hospeda o motor do jogo (WASM Runtime)
'use strict';
let started = false;
self.onmessage = (ev) => {
	if (started) return;
	started = true;
	const m = ev.data;
	if (m.cores) Object.defineProperty(navigator, 'hardwareConcurrency', { value: m.cores });
	
	const gq = new URLSearchParams();
	if (m.slots) gq.set('slots', m.slots);
	if (m.syncPipelines) gq.set('syncpipelines', '1');
	if (m.remoteLog) gq.set('log', '1');
	if (m.lowMemory) gq.set('low', '1');
	if (m.noPack) gq.set('nopack', '1');
	if (m.shotRt) gq.set('shotrt', '1');
	if (m.gpuLimits) gq.set('limits', m.gpuLimits);
	
	// LINK CORRETO DO BACKUP DE 700MB DO INTERNET ARCHIVE
	const B = 'https://archive.org';
	
	const gpu = new Worker(B + '/wgpu_worker.js' + (gq.toString() ? '?' + gq : ''));
	const io = new Worker(B + '/io_worker.js');
	io.postMessage({ init: true, base: B + '/data/', noStore: !!m.noStore, record: !!m.record, trace: !!m.trace, log: !!m.remoteLog, noHints: !!m.noHints, bootset: m.lowMemory ? 'bootset_low.json' : 'bootset.json' });
	
	let loaded = 0;
	io.onmessage = (e) => { if (e.data.loaded && ++loaded === 2) start(); };
	gpu.onmessage = (e) => { if (e.data.loaded && ++loaded === 2) start(); };

	const fetchWasm = async () => {
		for (let attempt = 0; ; attempt++) {
			let res = null, err = null;
			try { res = await fetch(B + '/game.wasm'); } catch (e) { err = e; }
			if (res && res.ok) return res;
			if (attempt >= 7) { if (res) throw new Error('HTTP ' + res.status + ' for game.wasm'); throw err; }
			bc0.postMessage({ label: 'Servidor ocupado, tentando novamente (' + (attempt + 1) + ')' });
			await new Promise((r) => setTimeout(r, Math.min(5000, 300 * 2 ** attempt) * (0.5 + Math.random())));
		}
	};
	const bc0 = new BroadcastChannel('game-progress');
	const start = () => {
		const bc = new BroadcastChannel('game-progress');
		self.Module = {
			instantiateWasm: (imports, done) => {
				const streaming = async () => {
					const res = await fetchWasm();
					const total = +(res.headers.get('X-Uncompressed-Length') || res.headers.get('Content-Length')) || 0;
					const counter = res.clone().body.getReader();
					(async () => {
						let got = 0;
						for (;;) {
							const { done: end, value } = await counter.read();
							if (end) break;
							got += value.length;
							bc.postMessage({ pct: total ? 20 * got / total : 0, label: 'Baixando o motor do jogo (' + (got / 1048576 | 0) + ' MB)' });
						}
					})();
					return WebAssembly.instantiateStreaming(res, imports);
				};
				streaming().then((ret) => done(ret.instance)).catch((err) => {
					console.error('Erro no streaming, tentando download completo:', err);
				});
			}
		};
		importScripts(B + '/game.js');
	};
};
