// ==================== CONFIGURACIÓN ====================
const API = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';
const PAGINA_DASHBOARD = '/ledgera/dashboardAdmin.html';

// ==================== ESTADO LOCAL ====================
let usuarios = [];
let puestos = [];

// ==================== ELEMENTOS DOM ====================
const $ = (id) => document.getElementById(id);
const tbody = $('usersTableBody');
const emptyState = $('emptyState');
const createModal = $('createModal');
const editModal = $('editModal');
const claveModal = $('claveModal');
const createForm = $('createUserForm');
const editForm = $('editUserForm');

// ==================== UTILIDADES ====================
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showMessage(elementId, message, type) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.className = type === 'error' ? 'error-message' : 'success-message';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

const openModal = (m) => m.classList.add('open');
const closeModal = (m) => m.classList.remove('open');
const closeAllDropdowns = () =>
    document.querySelectorAll('.dropdown-menu.open').forEach((m) => m.classList.remove('open'));

const ROL_TEXTO = { Administrador: 'Administrador', Dueno: 'Dueño', Vendedor: 'Vendedor' };

// Llamada a la API con la cookie de sesión. Si la sesión se cayó, vuelve al login.
async function api(ruta, opciones = {}) {
    const r = await fetch(API + ruta, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...opciones
    });
    if (r.status === 401) { window.location.href = PAGINA_LOGIN; throw new Error('sin sesion'); }
    return r.json().catch(() => ({ ok: false, mensaje: 'El servidor respondió algo inesperado.' }));
}

const enviar = (cuerpo) => api('/usuarios.php', { method: 'POST', body: JSON.stringify(cuerpo) });

function mostrarClave(clave) {
    $('claveGenerada').value = clave;
    openModal(claveModal);
}

// ==================== SESIÓN ====================
async function verificarSesion() {
    try {
        const r = await fetch(`${API}/me.php`, { credentials: 'same-origin' });
        const data = await r.json();
        if (!data.ok || data.usuario.rol !== 'Administrador') {
            window.location.href = PAGINA_LOGIN;
            return false;
        }
        $('headerUserName').textContent = data.usuario.nombre || 'Admin';
        return true;
    } catch (_) {
        window.location.href = PAGINA_LOGIN;
        return false;
    }
}

// ==================== PUESTOS (selects) ====================
function llenarSelectPuestos(select) {
    select.innerHTML = '<option value="">Elige un puesto</option>' +
        puestos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
}

function ajustarPuestoSegunRol(rol, fila, select) {
    const sinPuesto = rol === 'Administrador';
    fila.style.display = sinPuesto ? 'none' : '';
    select.required = !sinPuesto;
    if (sinPuesto) select.value = '';
}

// ==================== RENDER TABLA ====================
function renderTabla() {
    tbody.innerHTML = '';
    if (usuarios.length === 0) { emptyState.style.display = 'block'; return; }
    emptyState.style.display = 'none';

    usuarios.forEach((u) => {
        const activo = u.estado === 'Activo';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                ${esc(u.usuario)}
                <span class="badge ${activo ? 'active' : 'inactive'}">${activo ? 'Activo' : 'Inactivo'}</span>
            </td>
            <td>${esc(u.nombre)}</td>
            <td>${esc(u.cedula)}</td>
            <td>${esc(ROL_TEXTO[u.rol] || u.rol)}</td>
            <td>${esc(u.puesto || '—')}</td>
            <td class="col-actions">
                <div class="menu-container">
                    <button class="btn-dots" data-id="${u.id}" title="Opciones">
                        <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                    <div class="dropdown-menu" data-menu-id="${u.id}">
                        <button class="dropdown-item" data-action="editar" data-id="${u.id}">
                            <i class="fas fa-pen"></i> Editar
                        </button>
                        <button class="dropdown-item" data-action="restablecer" data-id="${u.id}">
                            <i class="fas fa-key"></i> Restablecer clave
                        </button>
                        <button class="dropdown-item ${activo ? 'danger' : ''}" data-action="toggle" data-id="${u.id}">
                            <i class="fas fa-${activo ? 'ban' : 'check'}"></i> ${activo ? 'Desactivar' : 'Activar'}
                        </button>
                    </div>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ==================== CARGAR ====================
async function cargarUsuarios() {
    const data = await api('/usuarios.php');
    if (!data.ok) { alert(data.mensaje || 'No se pudo cargar la lista.'); return; }
    usuarios = data.usuarios;
    puestos = data.puestos;
    llenarSelectPuestos($('newPuesto'));
    llenarSelectPuestos($('editPuesto'));
    renderTabla();
}

// ==================== EVENTOS: DELEGACIÓN ====================
document.addEventListener('click', async (e) => {
    const dotsBtn = e.target.closest('.btn-dots');
    if (dotsBtn) {
        e.stopPropagation();
        const menu = document.querySelector(`.dropdown-menu[data-menu-id="${dotsBtn.dataset.id}"]`);
        const estabaAbierto = menu.classList.contains('open');
        closeAllDropdowns();
        if (!estabaAbierto) menu.classList.add('open');
        return;
    }
    if (!e.target.closest('.menu-container')) closeAllDropdowns();

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
        const idNum = parseInt(actionBtn.dataset.id, 10);
        const u = usuarios.find((x) => x.id === idNum);
        closeAllDropdowns();
        if (!u) return;
        if (actionBtn.dataset.action === 'editar') abrirEditar(u);
        if (actionBtn.dataset.action === 'restablecer') restablecerClave(u);
        if (actionBtn.dataset.action === 'toggle') toggleActivo(u);
    }

    const cerrar = e.target.closest('[data-close]');
    if (cerrar) closeModal($(cerrar.dataset.close));
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target);
});

// ==================== CREAR ====================
$('btnCreate').addEventListener('click', () => {
    createForm.reset();
    ajustarPuestoSegunRol($('newRol').value, $('rowNewPuesto'), $('newPuesto'));
    openModal(createModal);
});

$('newRol').addEventListener('change', () =>
    ajustarPuestoSegunRol($('newRol').value, $('rowNewPuesto'), $('newPuesto')));

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = await enviar({
        accion: 'crear',
        usuario: $('newUsuario').value.trim(),
        nombre: $('newNombre').value.trim(),
        cedula: $('newCedula').value.trim(),
        rol: $('newRol').value,
        id_puesto: $('newPuesto').value || null
    });
    if (!data.ok) return showMessage('createError', data.mensaje, 'error');

    closeModal(createModal);
    await cargarUsuarios();
    mostrarClave(data.clave);
});

// ==================== EDITAR ====================
function abrirEditar(u) {
    $('editId').value = u.id;
    $('editUsuario').value = u.usuario;
    $('editNombre').value = u.nombre;
    $('editCedula').value = u.cedula;
    $('editPuesto').value = u.id_puesto || '';
    ajustarPuestoSegunRol(u.rol, $('rowEditPuesto'), $('editPuesto'));
    $('editPuesto').value = u.id_puesto || '';
    openModal(editModal);
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = await enviar({
        accion: 'editar',
        id: parseInt($('editId').value, 10),
        usuario: $('editUsuario').value.trim(),
        nombre: $('editNombre').value.trim(),
        cedula: $('editCedula').value.trim(),
        id_puesto: $('editPuesto').value || null
    });
    if (!data.ok) return showMessage('editError', data.mensaje, 'error');

    showMessage('editSuccess', 'Cambios guardados', 'success');
    await cargarUsuarios();
    setTimeout(() => closeModal(editModal), 700);
});

// ==================== RESTABLECER CLAVE ====================
async function restablecerClave(u) {
    if (!confirm(`¿Restablecer la clave de ${u.nombre}?\nSe generará una clave temporal nueva.`)) return;
    const data = await enviar({ accion: 'restablecer', id: u.id });
    if (!data.ok) return alert(data.mensaje);
    mostrarClave(data.clave);
}

$('btnCopiarClave').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('claveGenerada').value); } catch (_) { $('claveGenerada').select(); }
    $('btnCopiarClave').textContent = 'Copiada';
});

// ==================== ACTIVAR / DESACTIVAR ====================
async function toggleActivo(u) {
    const activo = u.estado === 'Activo';
    if (!confirm(`¿Seguro que quieres ${activo ? 'desactivar' : 'activar'} a ${u.nombre}?`)) return;
    const data = await enviar({ accion: 'estado', id: u.id, activo: !activo });
    if (!data.ok) return alert(data.mensaje);
    await cargarUsuarios();
}

// ==================== HEADER ====================
$('btnBack').addEventListener('click', () => { window.location.href = PAGINA_DASHBOARD; });

// ==================== INICIALIZAR ====================
(async () => {
    if (await verificarSesion()) cargarUsuarios();
})();