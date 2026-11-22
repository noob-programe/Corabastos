// =====================================================
// LEDGERA · Ventas (Dueño y Vendedor)
// =====================================================
const API = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';
const PAGINA_DASHBOARD = '/ledgera/dashboard.html';
const PAGINA_CAMBIAR_CLAVE = '/ledgera/cambiar-clave.html';
const PAGINA_ADMIN = '/ledgera/dashboardAdmin.html';

// ==================== ESTADO ====================
let catalogo = [];
let producto = null;
let calidad = null;
let pago = null;
let canal = 'Mostrador';
let cliente = null;          // cliente existente elegido
let creandoCliente = false;  // true si se está creando uno nuevo
let plazoNuevo = 15;         // plazo por defecto de un cliente nuevo
let enviando = false;
let temporizadorBusqueda = null;

// ==================== UTILIDADES ====================
const $ = (id) => document.getElementById(id);

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

function fechaCorta(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function sumarDias(dias) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

async function api(ruta, opciones = {}) {
    const r = await fetch(API + ruta, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...opciones
    });
    const data = await r.json().catch(() => ({ ok: false, mensaje: 'El servidor respondió algo inesperado.' }));
    if (r.status === 401) { window.location.href = PAGINA_LOGIN; throw new Error('sin sesion'); }
    if (data.cambiar_clave) { window.location.href = PAGINA_CAMBIAR_CLAVE; throw new Error('sin sesion'); }
    return data;
}

function mostrarMsg(texto) {
    const el = $('msgForm');
    el.textContent = texto;
    el.hidden = !texto;
}

// ==================== SESIÓN ====================
async function verificarSesion() {
    try {
        const r = await fetch(`${API}/me.php`, { credentials: 'same-origin' });
        const data = await r.json();
        if (!data.ok) { window.location.href = PAGINA_LOGIN; return false; }
        if (data.usuario.cambiar_clave) { window.location.href = PAGINA_CAMBIAR_CLAVE; return false; }
        if (data.usuario.rol === 'Administrador') { window.location.href = PAGINA_ADMIN; return false; }
        $('headerUserName').textContent = data.usuario.nombre || '';
        return true;
    } catch (_) {
        window.location.href = PAGINA_LOGIN;
        return false;
    }
}

// ==================== CATÁLOGO ====================
async function cargarCatalogo() {
    try {
        const data = await api('/ventas.php?accion=catalogo');
        if (!data.ok) { mostrarMsg(data.mensaje); return; }
        catalogo = data.productos;
        renderProductos();
    } catch (e) {
        if (e.message !== 'sin sesion') mostrarMsg('No hay conexión con el servidor. Revisa tu internet.');
    }
}

function renderProductos() {
    const q = $('buscarProducto').value.trim().toLowerCase();
    const lista = catalogo.filter((p) => p.nombre.toLowerCase().includes(q));
    const cont = $('listaProductos');

    if (catalogo.length === 0) {
        cont.innerHTML = '<p class="vacio">No hay productos registrados. Registra una entrada de mercancía primero.</p>';
        return;
    }
    if (lista.length === 0) { cont.innerHTML = '<p class="vacio">Ningún producto coincide.</p>'; return; }

    cont.innerHTML = lista.map((p) => {
        const hay = p.calidades.some((c) => c.stock > 0);
        const activo = producto && producto.id === p.id;
        return `<button type="button" class="ficha ${activo ? 'activo' : ''} ${hay ? '' : 'agotado'}" data-id="${p.id}">
                    ${esc(p.nombre)}<small>${hay ? p.calidades.length + ' calidad(es)' : 'Sin stock'}</small>
                </button>`;
    }).join('');
}

function seleccionarProducto(id) {
    producto = catalogo.find((p) => p.id === id) || null;
    calidad = null;
    renderProductos();
    if (!producto) return;

    $('nombreProducto').textContent = producto.nombre;
    $('bloqueCalidades').hidden = false;
    $('listaCalidades').innerHTML = producto.calidades.map((c) => {
        const bajo = c.stock > 0 && c.stock <= c.minimo;
        return `<button type="button" class="calidad ${bajo ? 'bajo' : ''}" data-id="${c.id}" ${c.stock <= 0 ? 'disabled' : ''}>
                    <strong>${esc(c.nombre)}</strong>
                    <span class="stock">${c.stock <= 0 ? 'Sin stock' : (bajo ? 'Poco stock: ' : 'Hay ') + c.stock}</span>
                    <span class="precio">${c.precio > 0 ? dinero(c.precio) : 'Sin precio'}</span>
                </button>`;
    }).join('');

    // Si solo hay una calidad con stock, se elige sola (un toque menos)
    const disponibles = producto.calidades.filter((c) => c.stock > 0);
    if (disponibles.length === 1) seleccionarCalidad(disponibles[0].id);
    else refrescar();
}

function seleccionarCalidad(id) {
    calidad = producto.calidades.find((c) => c.id === id) || null;
    document.querySelectorAll('.calidad').forEach((b) => b.classList.toggle('activo', Number(b.dataset.id) === id));
    if (!calidad) return;
    $('cantidad').value = 1;
    $('precio').value = calidad.precio > 0 ? calidad.precio : '';
    refrescar();
}

// ==================== CÁLCULOS ====================
const cantidad = () => parseInt($('cantidad').value, 10) || 0;
const precio = () => Number($('precio').value) || 0;
const total = () => Math.round(cantidad() * precio() * 100) / 100;
const efectivoMixto = () => Number($('montoEfectivo').value) || 0;

// Regla del 20 % (RF-004)
function estadoStock() {
    if (!calidad) return { nivel: 'ok', texto: '' };
    const s = calidad.stock;
    const c = cantidad();
    if (c <= s) {
        const bajo = s <= calidad.minimo;
        return { nivel: bajo ? 'aviso' : 'ok', texto: `Disponible: ${s} unidades${bajo ? ' (poco stock)' : ''}` };
    }
    if (s <= 0 || (c - s) * 5 >= s) {
        return { nivel: 'bloqueo', texto: `No se puede: solo hay ${s} y esa cantidad supera el stock en un 20 % o más. Corrige el inventario.` };
    }
    return { nivel: 'aviso', texto: `Stock insuficiente en el sistema (hay ${s}). Puedes vender, pero corrige el inventario.` };
}

// ==================== PANTALLA ====================
function refrescar() {
    const t = total();
    $('totalVenta').textContent = dinero(t);
    if (!enviando) $('btnRegistrar').textContent = t > 0 ? `Registrar venta ${dinero(t)}` : 'Registrar venta';

    const est = estadoStock();
    const nota = $('notaStock');
    nota.textContent = est.texto;
    nota.className = 'nota' + (est.nivel === 'aviso' ? ' aviso' : est.nivel === 'bloqueo' ? ' bloqueo' : '');

    $('bloqueMixto').hidden = pago !== 'Mixto';
    $('bloqueCliente').hidden = !(pago === 'Fiado' || pago === 'Mixto');
    if (pago === 'Mixto') $('restoFiado').textContent = dinero(Math.max(0, t - efectivoMixto()));

    const plazo = cliente ? cliente.plazo : (creandoCliente ? plazoNuevo : null);
    $('notaVencimiento').textContent = plazo
        ? `Plazo de ${plazo} días. Vence el ${fechaCorta(sumarDias(plazo))}.` : '';
}

function validar() {
    if (!producto || !calidad) return 'Elige el producto y su calidad.';
    if (cantidad() < 1) return 'La cantidad debe ser al menos 1.';
    if (precio() <= 0) return 'Escribe el precio de venta.';
    const est = estadoStock();
    if (est.nivel === 'bloqueo') return est.texto;
    if (!pago) return 'Elige la forma de pago.';
    if (pago === 'Mixto') {
        const e = efectivoMixto();
        if (e <= 0 || e >= total()) return 'En pago mixto, el efectivo debe ser mayor a 0 y menor al total.';
    }
    if (pago === 'Fiado' || pago === 'Mixto') {
        if (!cliente && !creandoCliente) return 'Elige el cliente o crea uno nuevo.';
        if (creandoCliente) {
            if ($('nuevoNombre').value.trim().length < 3) return 'Escribe el nombre completo del cliente.';
            const tel = $('nuevoTelefono').value.replace(/\D/g, '');
            if (tel.length < 7 || tel.length > 15) return 'El teléfono debe tener entre 7 y 15 números.';
            if (!$('nuevoConsentimiento').checked) return 'El cliente debe autorizar el uso de sus datos.';
        }
    }
    return null;
}

// ==================== CLIENTES ====================
async function buscarClientes() {
    const q = $('buscarCliente').value.trim();
    const cont = $('resultadosCliente');
    if (q.length < 2) { cont.innerHTML = ''; return; }
    try {
        const data = await api('/ventas.php?accion=clientes&q=' + encodeURIComponent(q));
        if (!data.ok) { cont.innerHTML = `<p class="vacio">${esc(data.mensaje)}</p>`; return; }
        window._clientesFound = data.clientes;
        cont.innerHTML = data.clientes.length === 0
            ? '<p class="vacio">No se encontró. Puedes crear un cliente nuevo.</p>'
            : data.clientes.map((c) => `
                <button type="button" class="cliente-op" data-id="${c.id}">
                    <strong>${esc(c.nombre)}</strong>
                    <span>${esc(c.telefono)}${Number(c.deuda) > 0 ? ' · <span class="debe">Debe ' + dinero(c.deuda) + '</span>' : ''}</span>
                </button>`).join('');
    } catch (e) {
        if (e.message !== 'sin sesion') cont.innerHTML = '<p class="vacio">Sin conexión para buscar.</p>';
    }
}

function elegirCliente(c) {
    cliente = { id: Number(c.id), nombre: c.nombre, telefono: c.telefono, plazo: Number(c.plazo), deuda: Number(c.deuda) };
    creandoCliente = false;
    $('clienteNombre').textContent = cliente.nombre;
    $('clienteDetalle').textContent = cliente.telefono + (cliente.deuda > 0 ? ' · Debe ' + dinero(cliente.deuda) : '');
    $('clienteElegido').hidden = false;
    $('clienteBuscar').hidden = true;
    $('clienteNuevo').hidden = true;
    refrescar();
}

function mostrarBusquedaCliente() {
    cliente = null;
    creandoCliente = false;
    $('clienteElegido').hidden = true;
    $('clienteBuscar').hidden = false;
    $('clienteNuevo').hidden = true;
    refrescar();
}

// ==================== REGISTRAR ====================
async function registrar() {
    if (enviando) return;
    mostrarMsg('');
    const error = validar();
    if (error) { mostrarMsg(error); return; }
    if (!navigator.onLine) { mostrarMsg('Sin conexión. No se envió nada. Revisa tu internet e inténtalo de nuevo.'); return; }

    const cuerpo = { accion: 'registrar', id_inventario: calidad.id, cantidad: cantidad(), precio: precio(), pago, canal };
    if (pago === 'Mixto') cuerpo.efectivo = efectivoMixto();
    if (pago === 'Fiado' || pago === 'Mixto') {
        if (cliente) cuerpo.id_cliente = cliente.id;
        else cuerpo.cliente_nuevo = {
            nombre: $('nuevoNombre').value.trim(),
            telefono: $('nuevoTelefono').value.trim(),
            consentimiento: true
        };
    }

    enviando = true;                       // evita registrar dos veces con doble toque
    $('btnRegistrar').disabled = true;
    $('btnRegistrar').textContent = 'Registrando...';

    try {
        const data = await api('/ventas.php', { method: 'POST', body: JSON.stringify(cuerpo) });
        if (data.ok) { mostrarExito(data.venta); }
        else { mostrarMsg(data.mensaje || 'No se pudo registrar la venta.'); cargarCatalogo(); }
    } catch (e) {
        if (e.message !== 'sin sesion') {
            mostrarMsg('No se pudo confirmar la venta. Antes de repetirla, revisa si quedó registrada para no duplicarla.');
        }
    } finally {
        enviando = false;
        $('btnRegistrar').disabled = false;
        refrescar();
    }
}

function mostrarExito(v) {
    const filas = [
        `<div class="fila"><span>${esc(v.producto)} · ${esc(v.calidad)}</span><span>x ${v.cantidad}</span></div>`,
        `<div class="fila"><span>Canal</span><span>${esc(canal)}</span></div>`
    ];
    if (v.efectivo > 0) filas.push(`<div class="fila"><span>Efectivo</span><span>${dinero(v.efectivo)}</span></div>`);
    if (v.digital > 0) filas.push(`<div class="fila"><span>${esc(v.medio)}</span><span>${dinero(v.digital)}</span></div>`);
    if (v.credito > 0) {
        filas.push(`<div class="fila"><span>Fiado a ${esc(v.cliente)}</span><span>${dinero(v.credito)}</span></div>`);
        filas.push(`<div class="fila"><span>Vence</span><span>${fechaCorta(v.vencimiento)}</span></div>`);
    }
    filas.push(`<div class="fila total"><span>Total</span><span>${dinero(v.total)}</span></div>`);
    $('exitoDetalle').innerHTML = filas.join('');

    $('exitoAdvertencia').hidden = !v.advertencia;
    $('exitoAdvertencia').textContent = v.advertencia || '';

    $('pantallaVenta').hidden = true;
    $('barraCobro').hidden = true;
    $('pantallaExito').hidden = false;
    window.scrollTo(0, 0);
}

function nuevaVenta() {
    producto = null; calidad = null; pago = null; canal = 'Mostrador';
    cliente = null; creandoCliente = false;
    $('buscarProducto').value = '';
    $('cantidad').value = 1;
    $('precio').value = '';
    $('montoEfectivo').value = '';
    $('buscarCliente').value = '';
    $('resultadosCliente').innerHTML = '';
    $('nuevoNombre').value = '';
    $('nuevoTelefono').value = '';
    $('nuevoConsentimiento').checked = false;
    $('bloqueCalidades').hidden = true;
    document.querySelectorAll('.pago').forEach((b) => b.classList.remove('activo'));
    document.querySelectorAll('.canal-op').forEach((b) => b.classList.toggle('activo', b.dataset.canal === 'Mostrador'));
    mostrarBusquedaCliente();
    mostrarMsg('');

    $('pantallaExito').hidden = true;
    $('pantallaVenta').hidden = false;
    $('barraCobro').hidden = false;
    window.scrollTo(0, 0);
    cargarCatalogo();   // el stock cambió con la venta
    refrescar();
}

// ==================== EVENTOS ====================
$('listaProductos').addEventListener('click', (e) => {
    const b = e.target.closest('.ficha');
    if (b) seleccionarProducto(Number(b.dataset.id));
});
$('listaCalidades').addEventListener('click', (e) => {
    const b = e.target.closest('.calidad');
    if (b && !b.disabled) seleccionarCalidad(Number(b.dataset.id));
});
$('buscarProducto').addEventListener('input', renderProductos);

$('btnMas').addEventListener('click', () => { $('cantidad').value = cantidad() + 1; refrescar(); });
$('btnMenos').addEventListener('click', () => { if (cantidad() > 1) $('cantidad').value = cantidad() - 1; refrescar(); });
$('cantidad').addEventListener('input', refrescar);
$('precio').addEventListener('input', refrescar);
$('montoEfectivo').addEventListener('input', refrescar);

$('listaPagos').addEventListener('click', (e) => {
    const b = e.target.closest('.pago');
    if (!b) return;
    pago = b.dataset.pago;
    document.querySelectorAll('.pago').forEach((x) => x.classList.toggle('activo', x === b));
    refrescar();
});

$('listaCanal').addEventListener('click', (e) => {
    const b = e.target.closest('.canal-op');
    if (!b) return;
    canal = b.dataset.canal;
    document.querySelectorAll('.canal-op').forEach((x) => x.classList.toggle('activo', x === b));
});

$('buscarCliente').addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(buscarClientes, 250);
});
$('resultadosCliente').addEventListener('click', (e) => {
    const b = e.target.closest('.cliente-op');
    if (!b) return;
    const c = (window._clientesFound || []).find((x) => String(x.id) === b.dataset.id);
    if (c) elegirCliente(c);
});
$('btnCambiarCliente').addEventListener('click', mostrarBusquedaCliente);
$('btnNuevoCliente').addEventListener('click', () => {
    creandoCliente = true;
    cliente = null;
    $('clienteBuscar').hidden = true;
    $('clienteNuevo').hidden = false;
    refrescar();
});
$('btnCancelarNuevo').addEventListener('click', mostrarBusquedaCliente);

$('btnRegistrar').addEventListener('click', registrar);
$('btnNuevaVenta').addEventListener('click', nuevaVenta);
$('btnInicio').addEventListener('click', () => { window.location.href = PAGINA_DASHBOARD; });
$('btnBack').addEventListener('click', () => { window.location.href = PAGINA_DASHBOARD; });

function actualizarRed() { $('avisoRed').hidden = navigator.onLine; }
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);

// ==================== INICIAR ====================
(async () => {
    actualizarRed();
    if (!(await verificarSesion())) return;
    refrescar();
    cargarCatalogo();
})();