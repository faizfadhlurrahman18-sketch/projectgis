// Kredensial: kasdesa/kasdesa123 | dadan/dadan123
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnLogin');
  const err = document.getElementById('loginError');
  const passInput = document.getElementById('pass');
  const userInput = document.getElementById('user');
  const togglePass = document.getElementById('togglePass');
  const remember = document.getElementById('rememberUser');

  const ACCOUNTS = {
    kasdesa: { kasdesa: 'kasdesa123' },
    dadan:   { dadan: 'dadan123' }
  };

  function validate(u,p) {
    const mode = window.selectedMode;
    if (!mode) return { ok:false, msg:'Pilih kategori dulu.' };
    const m = ACCOUNTS[mode] || {};
    if (!m[u]) return { ok:false, msg:'User tidak terdaftar.' };
    if (m[u] !== p) return { ok:false, msg:'Password salah.' };
    return { ok:true };
  }

  function setLoading(st){ btn.disabled = st; btn.classList.toggle('loading', st); }

  function doLogin() {
    err.textContent = '';
    const u = userInput.value.trim();
    const p = passInput.value.trim();
    if (!u || !p) { err.textContent='Isi username dan password.'; return; }
    const res = validate(u,p);
    if (!res.ok) { err.textContent = res.msg; passInput.select(); return; }

    setLoading(true);
    setTimeout(() => {
      if (remember.checked) {
        localStorage.setItem('webgis_user', u);
        localStorage.setItem('webgis_pass', p);
      } else {
        localStorage.removeItem('webgis_user');
        localStorage.removeItem('webgis_pass');
      }
      document.getElementById('loginOverlay').style.display = 'none';
      const mapDiv = document.getElementById('map');
      mapDiv.style.display = 'block';
      if (typeof initMap === 'function') initMap(window.selectedMode);
      setTimeout(()=>{ if (window.map && map.invalidateSize) map.invalidateSize(); },200);
      setLoading(false);
    }, 400);
  }

  btn.addEventListener('click', doLogin);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  userInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });
  togglePass.addEventListener('click', () => {
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
    togglePass.textContent = passInput.type === 'password' ? '👁️' : '🙈';
  });
});
