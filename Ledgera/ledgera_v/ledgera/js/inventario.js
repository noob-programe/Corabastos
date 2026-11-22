// =====================================================
// LEDGERA · Inventario (Existencias, Entradas y Ajustes)
// =====================================================
const API = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';
const PAGINA_DASHBOARD = '/ledgera/dashboard.html';
const PAGINA_CAMBIAR_CLAVE = '/ledgera/cambiar-clave.html';
const PAGINA_ADMIN = '/ledgera/dashboardAdmin.html';

const TIPOS = { Merma: 'Merma', Devolucion: 'Devolución', Correccion_conteo: 'Corrección de conteo' };
const TEXTO_TIPO = {
    Merma: { etiqueta: 'Unidades perdidas', nota: 'Resta unidades del inventario (producto dañado, vencido o perdido).' },
    Devolucion: { etiqueta: 'Unidades devueltas', nota: 'Suma unidades al inventario (un cliente devolvió producto).' },
    Correccion_conteo: { etiqueta: 'Unidades contadas', nota: 'El stock quedará exactamente en el número que escribas.' }
};

// ==================== ESTADO ====================
let esDueno = false;
let productos = [];
let proveedores = [];
let ultimoProveedor = null;
let lineas = [nuevaLinea()];
let tipoAjuste = 'Merma';
let editando = null;
let enviando = false;
let soloBajo = false;

// ==================== UTILIDADES ====================
const $ = (id) => document.getElementById(id);

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

function fechaHora(texto) {
    const d = new Date(String(texto).replace(' ', 'T'));
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function msg(id, texto, tipo = 'error') {
    const el = $(id);
    el.textContent = texto || '';
    el.className = 'msg ' + (tipo === 'ok' ? 'ok' : tipo === 'aviso' ? 'aviso' : 'error');
    el.hidden = !texto;
}

function falloRed(e) {
    if (e.message !== 'sin sesion') msg('msgGlobal', 'No hay conexión con el servidor. Revisa tu internet.');
}

// ==================== SESIÓN ====================
async function verificarSesion() {
    try {
        const r = await fetch(`${API}/me.php`, { credentials: 'same-origin' });
        const data = await r.json();
        if (!data.ok) { window.location.href = PAGINA_LOGIN; return false; }
        if (data.usuario.cambiar_clave) { window.location.href = PAGINA_CAMBIAR_CLAVE; return false; }
        if (data.usuario.rol === 'Administrador') { window.location.href = PAGINA_ADMIN; return false; }
        esDueno = data.usuario.rol === 'Dueno';
        $('headerUserName').textContent = data.usuario.nombre || '';
        // Solo estética: el PHP es quien realmente restringe
        document.querySelectorAll('[data-solo="Dueno"]').forEach((el) => { el.hidden = !esDueno; });
        return true;
    } catch (_) {
        window.location.href = PAGINA_LOGIN;
        return false;
    }
}

// ==================== TABS ====================
function irTab(nombre) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activo', t.dataset.tab === nombre));
    ['existencias', 'entradas', 'ajustes'].forEach((t) => { $('tab-' + t).hidden = t !== nombre; });
    msg('msgGlobal', '');
    window.scrollTo(0, 0);
    if (nombre === 'existencias') cargarExistencias();
    if (nombre === 'entradas') { cargarProveedores(); cargarEntradas(); }
    if (nombre === 'ajustes') cargarAjustes();
}

// ==================== EXISTENCIAS ====================
async function cargarExistencias() {
    try {
        const d = await api('/inventario.php?accion=existencias');
        if (!d.ok) return msg('msgGlobal', d.mensaje);
        productos = d.productos;
        renderExistencias();
        llenarDatalist();
        llenarSelectAjuste();
    } catch (e) { falloRed(e); }
}

function renderExistencias() {
    const q = $('buscarProducto').value.trim().toLowerCase();
    const cont = $('listaExistencias');

    if (productos.length === 0) {
        cont.innerHTML = '<p class="vacio">Aún no hay productos. Registra una entrada en la pestaña Entradas.</p>';
        $('resumenStock').textContent = '';
        return;
    }

    let alertas = 0;
    productos.forEach((p) => p.calidades.forEach((c) => { if (c.stock <= c.minimo) alertas++; }));
    $('resumenStock').textContent = alertas ? `${alertas} con poco stock` : 'Todo con buen stock';

    const lista = productos
        .map((p) => ({ ...p, calidades: p.calidades.filter((c) => !soloBajo || c.stock <= c.minimo) }))
        .filter((p) => p.calidades.length && p.nombre.toLowerCase().includes(q));

    if (lista.length === 0) { cont.innerHTML = '<p class="vacio">No hay resultados.</p>'; return; }

    cont.innerHTML = lista.map((p) => `
        <div class="card-prod">
            <h3>${esc(p.nombre)}</h3>
            ${p.calidades.map((c) => {
                const agotado = c.stock <= 0;
                const bajo = !agotado && c.stock <= c.minimo;
                const marca = agotado ? '<span class="etiqueta-estado agotado">' + (c.stock < 0 ? 'Revisar: negativo' : 'Agotado') + '</span>'
                            : bajo ? '<span class="etiqueta-estado bajo">Poco stock</span>' : '';
                return `<div class="fila-cal ${agotado ? 'agotado' : bajo ? 'bajo' : ''}">
                    <div class="cal">${esc(c.nombre)}${marca ? '<br>' + marca : ''}</div>
                    <div class="stock"><strong>${c.stock}</strong> u.<small>mínimo ${c.minimo}</small></div>
                    <div class="precio">${c.precio > 0 ? dinero(c.precio) : 'Sin precio'}</div>
                    ${esDueno ? `<div class="acciones">
                        <button type="button" class="mini" data-editar="minimo" data-id="${c.id}">Cambiar mínimo</button>
                        <button type="button" class="mini" data-editar="precio" data-id="${c.id}">Cambiar precio</button>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>`).join('');
}

function buscarCalidad(id) {
    for (const p of productos) {
        const c = p.calidades.find((x) => x.id === id);
        if (c) return { producto: p, calidad: c };
    }
    return null;
}

function abrirModal(tipo, id) {
    const r = buscarCalidad(id);
    if (!r) return;
    editando = { tipo, id };
    $('modalTitulo').textContent = tipo === 'minimo' ? 'Stock mínimo' : 'Precio del día';
    $('modalSub').textContent = `${r.producto.nombre} · ${r.calidad.nombre}`;
    $('modalValor').value = tipo === 'minimo' ? r.calidad.minimo : (r.calidad.precio || '');
    $('modalValor').step = tipo === 'precio' ? '100' : '1';
    $('modalMsg').hidden = true;
    $('modalEditar').hidden = false;
    setTimeout(() => $('modalValor').focus(), 50);
}

async function guardarModal() {
    if (!editando || enviando) return;
    enviando = true;
    try {
        const d = await api('/inventario.php', { method: 'POST', body: JSON.stringify({
            accion: editando.tipo, id_inventario: editando.id, valor: Number($('modalValor').value)
        }) });
        if (!d.ok) { $('modalMsg').textContent = d.mensaje; $('modalMsg').hidden = false; return; }
        $('modalEditar').hidden = true;
        await cargarExistencias();
    } catch (e) {
        if (e.message !== 'sin sesion') { $('modalMsg').textContent = 'No hay conexión con el servidor.'; $('modalMsg').hidden = false; }
    } finally { enviando = false; }
}

// ==================== ENTRADAS ====================
function nuevaLinea() { return { producto: '', calidad: '', cantidad: '', costo: '', precio: '' }; }

function llenarDatalist() {
    $('dlProductos').innerHTML = productos.map((p) => `<option value="${esc(p.nombre)}">`).join('');
}

async function cargarProveedores() {
    try {
        const d = await api('/inventario.php?accion=proveedores');
        if (!d.ok) return msg('msgGlobal', d.mensaje);
        proveedores = d.proveedores;
        ultimoProveedor = d.ultimo;
        const sel = $('selProveedor');
        const actual = sel.value;
        sel.innerHTML = proveedores.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')
            + '<option value="__nuevo__">+ Crear proveedor nuevo</option>';
        if (actual && [...sel.options].some((o) => o.value === actual)) sel.value = actual;
        else if (ultimoProveedor && proveedores.some((p) => p.id === ultimoProveedor)) sel.value = String(ultimoProveedor);
        else if (proveedores.length === 0) sel.value = '__nuevo__';
        $('proveedorNuevo').hidden = sel.value !== '__nuevo__';
    } catch (e) { falloRed(e); }
}

function precioActual(nombre, calidad) {
    const p = productos.find((x) => x.nombre.toLowerCase() === nombre.trim().toLowerCase());
    const c = p && p.calidades.find((x) => x.nombre.toLowerCase() === calidad.trim().toLowerCase());
    return c && c.precio > 0 ? c.precio : '';
}

// Calidades sugeridas: las del producto si ya existe; si es nuevo, todas las que usa el puesto
function sugerenciasCalidad(nombre) {
    const p = productos.find((x) => x.nombre.toLowerCase() === nombre.trim().toLowerCase());
    const base = p ? p.calidades.map((c) => c.nombre)
                   : [...new Set(productos.flatMap((x) => x.calidades.map((c) => c.nombre)))];
    if (!base.some((c) => c.toLowerCase() === 'única')) base.push('Única');
    return base;
}

function chipsHTML(l) {
    const actual = l.calidad.trim().toLowerCase();
    return sugerenciasCalidad(l.producto).map((c) =>
        `<button type="button" class="chip ${actual === c.toLowerCase() ? 'activo' : ''}" data-calidad="${esc(c)}">${esc(c)}</button>`).join('');
}

function marcarChips(caja, l) {
    const actual = l.calidad.trim().toLowerCase();
    caja.querySelectorAll('[data-calidad]').forEach((b) => b.classList.toggle('activo', b.dataset.calidad.toLowerCase() === actual));
}

function prefillPrecio(caja, l) {
    if (l.calidad.trim() && !l.precio) {
        const pr = precioActual(l.producto, l.calidad);
        if (pr) { l.precio = pr; caja.querySelector('[data-campo="precio"]').value = pr; }
    }
}

function renderLineas() {
    $('lineas').innerHTML = lineas.map((l, i) => `
        <div class="linea" data-i="${i}">
            <div class="linea-cab">
                <strong>Producto ${i + 1}</strong>
                ${lineas.length > 1 ? `<button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar producto"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <label class="etiqueta">Producto</label>
            <input class="campo" list="dlProductos" data-campo="producto" value="${esc(l.producto)}" placeholder="Ej: Papa pastusa" autocomplete="off">
            <label class="etiqueta">Calidad</label>
            <input class="campo" data-campo="calidad" value="${esc(l.calidad)}" maxlength="50" autocomplete="off" placeholder="Ej: Extra, Primera, Grande... o Única">
            <div class="calidad-chips">${chipsHTML(l)}</div>
            <div class="fila-3">
                <div><label class="etiqueta">Cantidad</label>
                    <input class="campo" type="number" min="1" inputmode="numeric" data-campo="cantidad" value="${esc(l.cantidad)}"></div>
                <div><label class="etiqueta">Costo por unidad</label>
                    <input class="campo" type="number" min="0" step="100" inputmode="numeric" data-campo="costo" value="${esc(l.costo)}"></div>
                <div><label class="etiqueta">Precio de venta hoy</label>
                    <input class="campo" type="number" min="0" step="100" inputmode="numeric" data-campo="precio" value="${esc(l.precio)}"></div>
            </div>
            <p class="subtotal">Subtotal: <strong>${dinero(subtotal(l))}</strong></p>
        </div>`).join('');
    actualizarTotal();
}

const subtotal = (l) => Math.round((Number(l.cantidad) || 0) * (Number(l.costo) || 0) * 100) / 100;
const totalFactura = () => lineas.reduce((s, l) => s + subtotal(l), 0);
function actualizarTotal() { $('totalFactura').textContent = dinero(totalFactura()); }

$('lineas').addEventListener('input', (e) => {
    const campo = e.target.dataset.campo;
    const caja = e.target.closest('.linea');
    if (!campo || !caja) return;
    const l = lineas[Number(caja.dataset.i)];
    l[campo] = e.target.value;
    if (campo === 'calidad') marcarChips(caja, l);
    caja.querySelector('.subtotal strong').textContent = dinero(subtotal(l));
    actualizarTotal();
});

// Al terminar de escribir el producto se actualizan las calidades sugeridas y el precio de hoy
$('lineas').addEventListener('change', (e) => {
    const campo = e.target.dataset.campo;
    const caja = e.target.closest('.linea');
    if (!caja || (campo !== 'producto' && campo !== 'calidad')) return;
    const l = lineas[Number(caja.dataset.i)];
    if (campo === 'producto') caja.querySelector('.calidad-chips').innerHTML = chipsHTML(l);
    prefillPrecio(caja, l);
});

$('lineas').addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) { lineas.splice(Number(quitar.dataset.quitar), 1); renderLineas(); return; }
    const chip = e.target.closest('[data-calidad]');
    if (chip) {
        const caja = chip.closest('.linea');
        const l = lineas[Number(caja.dataset.i)];
        l.calidad = chip.dataset.calidad;
        caja.querySelector('[data-campo="calidad"]').value = l.calidad;
        marcarChips(caja, l);
        prefillPrecio(caja, l);
    }
});

$('btnAgregarLinea').addEventListener('click', () => { lineas.push(nuevaLinea()); renderLineas(); });
$('selProveedor').addEventListener('change', () => { $('proveedorNuevo').hidden = $('selProveedor').value !== '__nuevo__'; });

function validarEntrada() {
    if ($('selProveedor').value === '__nuevo__' && $('provNombre').value.trim().length < 2) return 'Escribe el nombre del proveedor.';
    if (!$('documento').value.trim()) return 'Escribe el número de factura.';
    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i], n = i + 1;
        if (l.producto.trim().length < 2) return `Producto ${n}: escribe el nombre.`;
        if (!l.calidad.trim()) return `Producto ${n}: escribe o elige la calidad.`;
        if (!(parseInt(l.cantidad, 10) >= 1)) return `Producto ${n}: escribe la cantidad.`;
        if (!(Number(l.costo) > 0)) return `Producto ${n}: escribe el costo por unidad.`;
        if (!(Number(l.precio) > 0)) return `Producto ${n}: escribe el precio de venta de hoy.`;
    }
    return null;
}

async function registrarEntrada() {
    if (enviando) return;
    msg('msgEntrada', '');
    const error = validarEntrada();
    if (error) return msg('msgEntrada', error);

    const perdida = lineas.find((l) => Number(l.precio) < Number(l.costo));
    if (perdida && !confirm(`El precio de venta de "${perdida.producto}" es menor que su costo. ¿Registrar de todos modos?`)) return;
    if (!navigator.onLine) return msg('msgEntrada', 'Sin conexión. No se envió nada. Revisa tu internet e inténtalo de nuevo.');

    const cuerpo = {
        accion: 'entrada',
        documento: $('documento').value.trim(),
        lineas: lineas.map((l) => ({ producto: l.producto.trim(), calidad: l.calidad.trim(), cantidad: parseInt(l.cantidad, 10), costo: Number(l.costo), precio: Number(l.precio) }))
    };
    if ($('selProveedor').value === '__nuevo__') cuerpo.proveedor_nuevo = { nombre: $('provNombre').value.trim(), telefono: $('provTelefono').value.trim() };
    else cuerpo.proveedor_id = Number($('selProveedor').value);

    enviando = true;                       // evita registrar dos veces con doble toque
    $('btnEntrada').disabled = true;
    try {
        const d = await api('/inventario.php', { method: 'POST', body: JSON.stringify(cuerpo) });
        if (!d.ok) return msg('msgEntrada', d.mensaje || 'No se pudo registrar la entrada.');
        msg('msgEntrada', `Entrada registrada. Total de la factura: ${dinero(d.total)}`, 'ok');
        lineas = [nuevaLinea()];
        $('documento').value = '';
        $('provNombre').value = '';
        $('provTelefono').value = '';
        renderLineas();
        cargarProveedores(); cargarEntradas(); cargarExistencias();
    } catch (e) {
        if (e.message !== 'sin sesion') msg('msgEntrada', 'No se pudo confirmar la entrada. Revisa la lista de entradas recientes antes de repetirla.');
    } finally {
        enviando = false;
        $('btnEntrada').disabled = false;
    }
}

async function cargarEntradas() {
    try {
        const d = await api('/inventario.php?accion=entradas');
        if (!d.ok) return msg('msgGlobal', d.mensaje);
        $('listaEntradas').innerHTML = d.entradas.length === 0
            ? '<p class="vacio">Todavía no hay entradas registradas.</p>'
            : d.entradas.map((e) => `
                <div class="item">
                    <div class="item-cab">
                        <div><strong>${esc(e.proveedor)}</strong><br><span class="fecha">Factura ${esc(e.documento)} · ${fechaHora(e.fecha)}</span></div>
                        ${esDueno && e.estado ? `<span class="badge ${esc(e.estado)}">${esc(e.estado)}</span>` : ''}
                    </div>
                    <p class="detalle">${esc(e.resumen || '')}</p>
                    ${esDueno && e.total !== undefined ? `<p class="detalle">Total ${dinero(e.total)}${Number(e.saldo) > 0 ? ' · Debes ' + dinero(e.saldo) : ''}</p>` : ''}
                </div>`).join('');
    } catch (e) { falloRed(e); }
}

// ==================== AJUSTES ====================
function llenarSelectAjuste() {
    const sel = $('selAjuste');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Elige el producto y su calidad</option>' + productos.map((p) =>
        `<optgroup label="${esc(p.nombre)}">${p.calidades.map((c) =>
            `<option value="${c.id}">${esc(p.nombre)} · ${esc(c.nombre)} (hay ${c.stock})</option>`).join('')}</optgroup>`).join('');
    if (actual) sel.value = actual;
}

function aplicarTipo() {
    $('lblAjusteCantidad').textContent = TEXTO_TIPO[tipoAjuste].etiqueta;
    $('notaTipo').textContent = TEXTO_TIPO[tipoAjuste].nota;
    $('ajusteCantidad').min = tipoAjuste === 'Correccion_conteo' ? '0' : '1';
    document.querySelectorAll('.seg-op').forEach((b) => b.classList.toggle('activo', b.dataset.tipo === tipoAjuste));
}

async function registrarAjuste() {
    if (enviando) return;
    msg('msgAjuste', '');
    const idInv = Number($('selAjuste').value);
    const cant = parseInt($('ajusteCantidad').value, 10);
    const motivo = $('ajusteMotivo').value.trim();
    if (!idInv) return msg('msgAjuste', 'Elige el producto y su calidad.');
    if (isNaN(cant) || cant < (tipoAjuste === 'Correccion_conteo' ? 0 : 1)) return msg('msgAjuste', 'Escribe una cantidad válida.');
    if (motivo.length < 3) return msg('msgAjuste', 'Escribe el motivo del ajuste.');
    if (!navigator.onLine) return msg('msgAjuste', 'Sin conexión. No se envió nada.');

    enviando = true;
    $('btnAjuste').disabled = true;
    try {
        const d = await api('/inventario.php', { method: 'POST', body: JSON.stringify({
            accion: 'ajuste', tipo: tipoAjuste, id_inventario: idInv, cantidad: cant, motivo
        }) });
        if (!d.ok) return msg('msgAjuste', d.mensaje || 'No se pudo registrar el ajuste.');
        msg('msgAjuste', `Ajuste registrado. Stock actual: ${d.stock}.${d.advertencia ? ' ' + d.advertencia : ''}`, d.advertencia ? 'aviso' : 'ok');
        $('ajusteCantidad').value = '';
        $('ajusteMotivo').value = '';
        cargarAjustes(); cargarExistencias();
    } catch (e) {
        if (e.message !== 'sin sesion') msg('msgAjuste', 'No se pudo confirmar. Revisa la lista de ajustes antes de repetirlo.');
    } finally {
        enviando = false;
        $('btnAjuste').disabled = false;
    }
}

async function cargarAjustes() {
    try {
        const d = await api('/inventario.php?accion=ajustes');
        if (!d.ok) return msg('msgGlobal', d.mensaje);
        $('listaAjustes').innerHTML = d.ajustes.length === 0
            ? '<p class="vacio">Todavía no hay ajustes registrados.</p>'
            : d.ajustes.map((a) => `
                <div class="item">
                    <div class="item-cab">
                        <div><strong>${esc(a.producto)} · ${esc(a.calidad)}</strong><br><span class="fecha">${fechaHora(a.fecha)} · ${esc(a.usuario)}</span></div>
                        <span class="badge ${esc(a.tipo)}">${esc(TIPOS[a.tipo] || a.tipo)}</span>
                    </div>
                    <p class="detalle">${a.tipo === 'Correccion_conteo' ? 'Conteo' : (a.tipo === 'Merma' ? '-' : '+')} ${a.cantidad} unidades</p>
                    <p class="motivo">${esc(a.motivo)}</p>
                </div>`).join('');
    } catch (e) { falloRed(e); }
}

// ==================== EVENTOS ====================
$('tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) irTab(t.dataset.tab); });
$('buscarProducto').addEventListener('input', renderExistencias);
$('btnSoloBajo').addEventListener('click', () => { soloBajo = !soloBajo; $('btnSoloBajo').classList.toggle('activo', soloBajo); renderExistencias(); });
$('listaExistencias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar]');
    if (b) abrirModal(b.dataset.editar, Number(b.dataset.id));
});
$('modalGuardar').addEventListener('click', guardarModal);
$('modalCancelar').addEventListener('click', () => { $('modalEditar').hidden = true; });
$('modalEditar').addEventListener('click', (e) => { if (e.target.id === 'modalEditar') $('modalEditar').hidden = true; });

$('btnEntrada').addEventListener('click', registrarEntrada);
$('tipoAjuste').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-op');
    if (b) { tipoAjuste = b.dataset.tipo; aplicarTipo(); }
});
$('btnAjuste').addEventListener('click', registrarAjuste);
$('btnBack').addEventListener('click', () => { window.location.href = PAGINA_DASHBOARD; });

function actualizarRed() { $('avisoRed').hidden = navigator.onLine; }
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);

// ==================== INICIAR ====================
(async () => {
    actualizarRed();
    if (!(await verificarSesion())) return;
    aplicarTipo();
    renderLineas();
    cargarExistencias();
})();