// ==================== CONFIGURACIÓN ====================
const API = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';
const PAGINA_DASHBOARD = '/ledgera/dashboardAdmin.html';

// ==================== ESTADO LOCAL ====================
let puestos = [];
let duenos = [];

// ==================== ELEMENTOS DOM ====================
const $ = (id) => document.getElementById(id);
const tbody = $('puestosTableBody');
const emptyState = $('emptyState');
const createModal = $('createModal');
const editModal = $('editModal');
const ownerModal = $('ownerModal');
const createForm = $('createPuestoForm');
const editForm = $('editPuestoForm');
const ownerForm = $('ownerForm');

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

// Para comparar duplicados sin mayúsculas ni tildes (el servidor también lo valida)
function normalizar(texto) {
    return texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function api(ruta, opciones = {}) {
    const r = await fetch(API + ruta, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...opciones
    });
    if (r.status === 401) { window.location.href = PAGINA_LOGIN; throw new Error('sin sesion'); }
    return r.json().catch(() => ({ ok: false, mensaje: 'El servidor respondió algo inesperado.' }));
}

const enviar = (cuerpo) => api('/puestos.php', { method: 'POST', body: JSON.stringify(cuerpo) });

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

// ==================== RENDER TABLA ====================
function renderTabla() {
    tbody.innerHTML = '';
    if (puestos.length === 0) { emptyState.style.display = 'block'; return; }
    emptyState.style.display = 'none';

    puestos.forEach((p) => {
        const activo = p.estado === 'Activo';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${esc(p.nombre)}</td>
            <td>${esc(p.bodega)}</td>
            <td>${p.dueno ? esc(p.dueno) : '<span class="sin-dueno">Sin asignar</span>'}</td>
            <td><span class="badge ${activo ? 'active' : 'inactive'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
            <td class="col-actions">
                <div class="menu-container">
                    <button class="btn-dots" data-id="${p.id}" title="Opciones">
                        <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                    <div class="dropdown-menu" data-menu-id="${p.id}">
                        <button class="dropdown-item" data-action="editar" data-id="${p.id}">
                            <i class="fas fa-pen"></i> Editar
                        </button>
                        <button class="dropdown-item" data-action="dueno" data-id="${p.id}">
                            <i class="fas fa-user-tag"></i> Cambiar dueño
                        </button>
                        <button class="dropdown-item ${activo ? 'danger' : ''}" data-action="toggle" data-id="${p.id}">
                            <i class="fas fa-${activo ? 'ban' : 'check'}"></i> ${activo ? 'Desactivar' : 'Activar'}
                        </button>
                    </div>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ==================== CARGAR ====================
async function cargarPuestos() {
    const data = await api('/puestos.php');
    if (!data.ok) { alert(data.mensaje || 'No se pudo cargar la lista.'); return; }
    puestos = data.puestos;
    duenos = data.duenos;
    renderTabla();
}

// ==================== EVENTOS: DELEGACIÓN ====================
document.addEventListener('click', (e) => {
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
        const p = puestos.find((x) => x.id === idNum);
        closeAllDropdowns();
        if (!p) return;
        if (actionBtn.dataset.action === 'editar') abrirEditar(p);
        if (actionBtn.dataset.action === 'dueno') abrirCambiarDueno(p);
        if (actionBtn.dataset.action === 'toggle') toggleActivo(p);
    }

    const cerrar = e.target.closest('[data-close]');
    if (cerrar) closeModal($(cerrar.dataset.close));
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target);
});

// ==================== CREAR ====================
$('btnCreate').addEventListener('click', () => { createForm.reset(); openModal(createModal); });

createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('newNombre').value.trim();
    const bodega = $('newBodega').value.trim();
    if (!nombre || !bodega) return showMessage('createError', 'Completa todos los campos', 'error');

    const existe = puestos.some((p) =>
        normalizar(p.nombre) === normalizar(nombre) && normalizar(p.bodega) === normalizar(bodega));
    if (existe) return showMessage('createError', 'Este puesto ya existe', 'error');

    const data = await enviar({ accion: 'crear', nombre, bodega });
    if (!data.ok) return showMessage('createError', data.mensaje, 'error');

    showMessage('createSuccess', 'Puesto creado correctamente', 'success');
    await cargarPuestos();
    setTimeout(() => closeModal(createModal), 700);
});

// ==================== EDITAR ====================
function abrirEditar(p) {
    $('editId').value = p.id;
    $('editNombre').value = p.nombre;
    $('editBodega').value = p.bodega;
    openModal(editModal);
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt($('editId').value, 10);
    const nombre = $('editNombre').value.trim();
    const bodega = $('editBodega').value.trim();
    if (!nombre || !bodega) return showMessage('editError', 'Completa todos los campos', 'error');

    const existe = puestos.some((p) => p.id !== id &&
        normalizar(p.nombre) === normalizar(nombre) && normalizar(p.bodega) === normalizar(bodega));
    if (existe) return showMessage('editError', 'Este puesto ya existe', 'error');

    const data = await enviar({ accion: 'editar', id, nombre, bodega });
    if (!data.ok) return showMessage('editError', data.mensaje, 'error');

    showMessage('editSuccess', 'Cambios guardados', 'success');
    await cargarPuestos();
    setTimeout(() => closeModal(editModal), 700);
});

// ==================== CAMBIAR DUEÑO ====================
function abrirCambiarDueno(p) {
    $('ownerPuestoId').value = p.id;
    $('ownerPuestoNombre').value = p.nombre;

    const select = $('ownerSelect');
    select.innerHTML = '<option value="">-- Selecciona un dueño --</option>';
    duenos.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        // Si ya dirige otro puesto, se avisa (ese puesto se quedará sin Dueño)
        opt.textContent = d.id_puesto && d.id_puesto !== p.id ? `${d.nombre} (hoy en ${d.puesto})` : d.nombre;
        select.appendChild(opt);
    });
    openModal(ownerModal);
}

ownerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt($('ownerPuestoId').value, 10);
    const duenoId = parseInt($('ownerSelect').value, 10);
    if (!duenoId) return showMessage('ownerError', 'Selecciona un dueño', 'error');

    const d = duenos.find((x) => x.id === duenoId);
    if (d && d.id_puesto && d.id_puesto !== id &&
        !confirm(`${d.nombre} hoy es Dueño de "${d.puesto}". Ese puesto se quedará sin Dueño. ¿Continuar?`)) return;

    const data = await enviar({ accion: 'dueno', id, dueno_id: duenoId });
    if (!data.ok) return showMessage('ownerError', data.mensaje, 'error');

    showMessage('ownerSuccess', 'Dueño asignado', 'success');
    await cargarPuestos();
    setTimeout(() => closeModal(ownerModal), 700);
});

// ==================== ACTIVAR / DESACTIVAR ====================
async function toggleActivo(p) {
    const activo = p.estado === 'Activo';
    const aviso = activo ? '\nSus usuarios no podrán iniciar sesión.' : '';
    if (!confirm(`¿Seguro que quieres ${activo ? 'desactivar' : 'activar'} el puesto "${p.nombre}"?${aviso}`)) return;

    const data = await enviar({ accion: 'estado', id: p.id, activo: !activo });
    if (!data.ok) return alert(data.mensaje);
    await cargarPuestos();
}

// ==================== HEADER ====================
$('btnBack').addEventListener('click', () => { window.location.href = PAGINA_DASHBOARD; });

// ==================== INICIALIZAR ====================
(async () => {
    if (await verificarSesion()) cargarPuestos();
})();