'use strict';
document.addEventListener('DOMContentLoaded', () => {
	const sel = document.getElementById('modeSelection');
	if (!sel) return;
	sel.addEventListener('click', e => {
		const btn = e.target.closest('[data-mode]');
		if (!btn) return;
		const mode = btn.dataset.mode;
		window.selectedMode = mode;
		const title = mode === 'kasdesa' ? 'Tanah Kas Desa' : 'Tanah Dadan';
		const loginTitle = document.getElementById('loginTitle');
		const loginSub = document.getElementById('loginSub');
		if (loginTitle) loginTitle.textContent = 'Login - ' + title;
		if (loginSub) loginSub.textContent = 'Masuk untuk akses data ' + title;
		sel.classList.add('hide');
		setTimeout(()=>{
			sel.style.display='none';
			const overlay = document.getElementById('loginOverlay');
			overlay.style.display='flex';
			document.getElementById('user')?.focus();
		},350);
	});
});
