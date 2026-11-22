// ==================== CONFIGURACIÓN ====================
const API_URL = '/ledgera/api';
const PAGINA_CAMBIAR_CLAVE = '/ledgera/cambiar-clave.html';

// Ajusta a tus páginas reales
const DESTINO_POR_ROL = {
    Administrador: '/ledgera/dashboardAdmin.html',
    Dueno: '/ledgera/dashboard.html',
    Vendedor: '/ledgera/dashboard.html'
};

// ==================== ELEMENTOS DEL DOM ====================
const loginForm = document.getElementById('loginForm');

// ==================== FUNCIONES AUXILIARES ====================
function showMessage(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => { element.style.display = 'none'; }, 5000);
}

function redirigir(rol) {
    window.location.href = DESTINO_POR_ROL[rol] || '/ledgera/dashboard.html';
}

// ==================== LOGIN ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!usuario) return showMessage('loginError', 'Por favor ingresa tu usuario');
    if (!password) return showMessage('loginError', 'Por favor ingresa tu contraseña');

    try {
        const response = await fetch(`${API_URL}/login.php`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
        });
        const data = await response.json();

        if (data.ok) {
            // Clave temporal: primero debe cambiarla
            if (data.cambiar_clave) {
                showMessage('loginSuccess', 'Debes crear una clave propia...');
                setTimeout(() => { window.location.href = PAGINA_CAMBIAR_CLAVE; }, 800);
                return;
            }
            showMessage('loginSuccess', '¡Acceso correcto! Redirigiendo...');
            setTimeout(() => redirigir(data.usuario.rol), 800);
        } else {
            showMessage('loginError', data.mensaje || 'Usuario o contraseña incorrectos');
        }
    } catch (error) {
        showMessage('loginError', 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
        console.error('Error:', error);
    }
});

// ==================== SESIÓN ACTIVA ====================
window.addEventListener('load', async () => {
    try {
        const r = await fetch(`${API_URL}/me.php`, { credentials: 'same-origin' });
        const data = await r.json();
        if (!data.ok) return;
        if (data.usuario.cambiar_clave) window.location.href = PAGINA_CAMBIAR_CLAVE;
        else redirigir(data.usuario.rol);
    } catch (_) { /* sin sesión: se queda en el login */ }
});