// ==================== CONFIGURACIÓN ====================
const API_URL = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';

// Ajusta a tus páginas reales (las mismas de auth.js)
const DESTINO_POR_ROL = {
    Administrador: '/ledgera/dashboardAdmin.html',
    Dueno: '/ledgera/dashboard.html',
    Vendedor: '/ledgera/dashboard.html'
};

let obligatorio = false;
let rolActual = null;

const $ = (id) => document.getElementById(id);

// ==================== UTILIDADES ====================
function showMessage(elementId, message) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function marcar(idRegla, cumple) {
    const li = $(idRegla);
    li.classList.toggle('ok', cumple);
    li.querySelector('i').className = cumple ? 'fas fa-circle-check' : 'far fa-circle';
}

// Revisa las reglas en vivo y dice si se cumplen todas
function evaluar() {
    const a = $('claveActual').value;
    const n = $('claveNueva').value;
    const c = $('claveConfirmar').value;
    const reglas = {
        regLen: n.length >= 8,
        regMix: /[A-Za-z]/.test(n) && /[0-9]/.test(n),
        regDist: n !== '' && n !== a,
        regIgual: n !== '' && n === c
    };
    Object.entries(reglas).forEach(([id, ok]) => marcar(id, ok));
    return Object.values(reglas).every(Boolean);
}

async function cerrarSesion() {
    try { await fetch(`${API_URL}/logout.php`, { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
    window.location.href = PAGINA_LOGIN;
}

// ==================== SESIÓN ====================
async function iniciar() {
    try {
        const r = await fetch(`${API_URL}/me.php`, { credentials: 'same-origin' });
        const data = await r.json();
        if (!data.ok) { window.location.href = PAGINA_LOGIN; return; }

        rolActual = data.usuario.rol;
        obligatorio = data.usuario.cambiar_clave;

        if (obligatorio) {
            $('avisoTemporal').style.display = 'block';
            $('claveActual').placeholder = 'Clave temporal';
            $('btnSalir').style.display = 'inline-block';   // sin "Cancelar": no puede saltarse el cambio
        } else {
            $('btnCancelar').style.display = 'inline-block';
        }
    } catch (_) {
        window.location.href = PAGINA_LOGIN;
    }
}

// ==================== EVENTOS ====================
['claveActual', 'claveNueva', 'claveConfirmar'].forEach((id) => $(id).addEventListener('input', evaluar));

document.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const input = $(btn.dataset.ver);
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        btn.querySelector('i').className = mostrar ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
});

$('btnSalir').addEventListener('click', cerrarSesion);
$('btnCancelar').addEventListener('click', () => {
    window.location.href = DESTINO_POR_ROL[rolActual] || PAGINA_LOGIN;
});

$('claveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!evaluar()) return showMessage('claveError', 'Revisa las reglas de la clave nueva.');

    try {
        const r = await fetch(`${API_URL}/cambiar_clave.php`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actual: $('claveActual').value,
                nueva: $('claveNueva').value,
                confirmar: $('claveConfirmar').value
            })
        });
        const data = await r.json();

        if (data.ok) {
            showMessage('claveSuccess', '¡Clave cambiada! Redirigiendo...');
            setTimeout(() => { window.location.href = DESTINO_POR_ROL[data.rol] || PAGINA_LOGIN; }, 900);
        } else {
            showMessage('claveError', data.mensaje || 'No se pudo cambiar la clave.');
            if (data.cerrar) setTimeout(() => { window.location.href = PAGINA_LOGIN; }, 2500);
        }
    } catch (err) {
        showMessage('claveError', 'No hay conexión con el servidor. Intenta de nuevo.');
        console.error(err);
    }
});

iniciar();