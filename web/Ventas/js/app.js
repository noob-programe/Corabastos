/* LEDGERA · app.js · Núcleo, navegación y módulo de ventas (RF-010 y RF-011)
   100 % en línea: no hay cola local ni almacenamiento en el navegador. */

/* ---------- Utilidades compartidas por todos los módulos ---------- */
const $ = (selector) => document.querySelector(selector);
const formatoCOP = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const soloNumero = (texto) => parseInt(String(texto).replace(/\D/g, ''), 10) || 0;
// Evita que un texto escrito por el usuario se interprete como HTML
const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Estado de la aplicación (vive en memoria) ---------- */
const estado = {
  usuario: null,
  jornada: null,
  inventario: [],
  clientes: [],
  ventas: [],
  carrito: [],           // cada línea: { id, cantidad, precio }
  canal: 'Mostrador',
  pagoManual: false      // false = el efectivo se completa solo con el total
};

/* Registro de módulos: cada archivo agrega su vista aquí con un método abrir() */
const VISTAS = {};

/* ---------- Navegación ---------- */
function mostrarPantalla(id) {
  ['pantalla-login', 'pantalla-apertura', 'pantalla-app'].forEach((p) => {
    $('#' + p).hidden = p !== id;
  });
}

async function navegar(vista) {
  document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== 'vista-' + vista; });
  document.querySelectorAll('.menu-item[data-vista]').forEach((m) => {
    m.classList.toggle('activo', m.dataset.vista === vista);
  });
  try {
    if (VISTAS[vista]) await VISTAS[vista].abrir();
  } catch (error) {
    avisar(error.message, true);
  }
}

$('.lateral-menu').addEventListener('click', (evento) => {
  const item = evento.target.closest('[data-vista]');
  if (!item || item.classList.contains('deshabilitado')) return;
  navegar(item.dataset.vista);
});

function avisar(mensaje, esError = false) {
  const aviso = $('#aviso');
  aviso.textContent = mensaje;
  aviso.className = 'aviso visible' + (esError ? ' error' : '');
  clearTimeout(avisar.temporizador);
  avisar.temporizador = setTimeout(() => { aviso.className = 'aviso'; }, 2800);
}

/* ---------- Regla de stock (RF-010) ----------
   Sin stock: bloquea. Faltante = (pedido - stock) / stock.
   Menor a 20 %: advierte y deja continuar. 20 % o más: bloquea. */
function evaluarStock(linea) {
  const item = estado.inventario.find((i) => i.id === linea.id);
  if (item.stock <= 0) return { nivel: 'bloqueo', mensaje: 'Sin stock: no se puede vender.' };
  if (linea.cantidad <= item.stock) return { nivel: 'ok', mensaje: '' };

  const faltante = (linea.cantidad - item.stock) / item.stock;
  const porcentaje = Math.round(faltante * 100);
  if (faltante >= 0.2) {
    return { nivel: 'bloqueo', mensaje: `Faltante de ${porcentaje} %: venta bloqueada.` };
  }
  return { nivel: 'advertencia', mensaje: `Supera el stock (${item.stock}) en ${porcentaje} %. Puedes continuar.` };
}

const calcularTotal = () => estado.carrito.reduce((suma, l) => suma + l.cantidad * l.precio, 0);

function leerPagos() {
  return {
    efectivo: soloNumero($('#pago-efectivo').value),
    digital: soloNumero($('#pago-digital').value),
    fiado: soloNumero($('#pago-fiado').value),
    medio: $('#pago-medio').value,
    cliente: $('#pago-cliente').value
  };
}

/* ---------- Dibujo de listas de ventas ---------- */
function dibujarCatalogo() {
  const filtro = $('#buscador').value.trim().toLowerCase();
  const visibles = estado.inventario.filter((i) =>
    (i.producto + ' ' + i.calidad).toLowerCase().includes(filtro));

  $('#catalogo').innerHTML = visibles.length ? visibles.map((i) => {
    const clase = i.stock <= 0 ? 'sin-stock' : (i.stock <= i.minimo ? 'stock-bajo' : '');
    return `
      <button type="button" class="tarjeta-producto ${clase}" data-id="${i.id}">
        <strong>${esc(i.producto)}</strong>
        <span>Calidad ${esc(i.calidad)}</span>
        <span>Stock: ${i.stock}${i.stock <= i.minimo ? ' ⚠ bajo' : ''}</span>
        <span class="precio">${formatoCOP(i.precio)}</span>
      </button>`;
  }).join('') : '<p class="texto-suave">Ningún producto coincide con la búsqueda.</p>';
}

function dibujarCarrito() {
  const contenedor = $('#carrito');
  if (!estado.carrito.length) {
    contenedor.innerHTML = `
      <div class="vacio">
        <span class="vacio-icono">🛒</span>
        <strong>Aún no hay productos</strong>
        <p>Haz clic en un producto del catálogo para agregarlo a la venta.</p>
      </div>`;
    return;
  }
  contenedor.innerHTML = estado.carrito.map((linea, n) => {
    const item = estado.inventario.find((i) => i.id === linea.id);
    return `
      <article class="linea-carrito">
        <div>
          <strong>${esc(item.producto)}</strong> <span class="etiqueta">${esc(item.calidad)}</span>
          <p class="aviso-stock" data-aviso="${n}"></p>
        </div>
        <strong data-subtotal="${n}"></strong>
        <div class="linea-controles">
          <button type="button" class="boton-cantidad" data-accion="menos" data-n="${n}">−</button>
          <input class="campo-cantidad" type="text" inputmode="numeric" data-campo="cantidad" data-n="${n}" value="${linea.cantidad}">
          <button type="button" class="boton-cantidad" data-accion="mas" data-n="${n}">+</button>
          <input class="campo-precio" type="text" inputmode="numeric" data-campo="precio" data-n="${n}" value="${linea.precio}" title="Precio unitario">
          <button type="button" class="boton-cantidad" data-accion="quitar" data-n="${n}">✕</button>
        </div>
      </article>`;
  }).join('');
  refrescarLineas();
}

/* Actualiza subtotales y avisos SIN redibujar los inputs (así no se pierde el foco al teclear) */
function refrescarLineas() {
  estado.carrito.forEach((linea, n) => {
    const evaluacion = evaluarStock(linea);
    const aviso = $(`[data-aviso="${n}"]`);
    if (!aviso) return;
    aviso.textContent = evaluacion.mensaje;
    aviso.className = 'aviso-stock ' +
      (evaluacion.nivel === 'bloqueo' ? 'texto-error' : evaluacion.nivel === 'advertencia' ? 'texto-alerta' : '');
    $(`[data-subtotal="${n}"]`).textContent = formatoCOP(linea.cantidad * linea.precio);
  });
}

function dibujarClientes() {
  const elegido = $('#pago-cliente').value;
  $('#pago-cliente').innerHTML = '<option value="">— Seleccionar —</option>' +
    estado.clientes.filter((c) => c.estado === 'Activo')
      .map((c) => `<option value="${c.id}">${esc(c.nombre)} · ${c.plazo} días</option>`).join('');
  $('#pago-cliente').value = elegido;
}

function dibujarHistorial() {
  const cuerpo = $('#historial');
  if (!estado.ventas.length) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="celda-vacia">Aún no hay ventas en esta jornada.</td></tr>';
    return;
  }
  cuerpo.innerHTML = estado.ventas.map((v) => {
    const pagos = [];
    if (v.efectivo) pagos.push('Efectivo');
    if (v.digital) pagos.push(esc(v.medio));
    if (v.fiado) pagos.push('<span class="etiqueta etiqueta-fiado">Fiado</span>');
    return `<tr>
      <td>${v.id}</td>
      <td>${v.hora}</td>
      <td>${esc(v.cliente) || 'Ocasional'}</td>
      <td>${v.canal}</td>
      <td>${pagos.join(' + ')}</td>
      <td class="derecha"><strong>${formatoCOP(v.total)}</strong></td>
    </tr>`;
  }).join('');
}

/* ---------- Validación y resumen en vivo ---------- */
function validar() {
  const errores = [];
  const total = calcularTotal();
  const pagos = leerPagos();

  if (!navigator.onLine) errores.push('Sin conexión: no se puede registrar la venta.');
  if (!estado.carrito.length) errores.push('Agrega al menos un producto.');
  if (estado.carrito.some((l) => evaluarStock(l).nivel === 'bloqueo')) {
    errores.push('Hay productos bloqueados por stock.');
  }
  if (estado.carrito.some((l) => l.cantidad < 1 || l.precio < 1)) {
    errores.push('Cantidad y precio deben ser mayores a cero.');
  }

  const sumaPagos = pagos.efectivo + pagos.digital + pagos.fiado;
  if (estado.carrito.length && sumaPagos !== total) {
    errores.push(`Los pagos suman ${formatoCOP(sumaPagos)} y deben sumar ${formatoCOP(total)}.`);
  }
  if (pagos.fiado > 0 && !pagos.cliente) errores.push('Elige el cliente del fiado.');
  return errores;
}

function actualizarResumen() {
  const total = calcularTotal();

  // Mientras la persona no toque los campos de pago, todo se asume en efectivo
  if (!estado.pagoManual) {
    $('#pago-efectivo').value = total;
    $('#pago-digital').value = 0;
    $('#pago-fiado').value = 0;
  }

  const pagos = leerPagos();
  $('#bloque-cliente').hidden = pagos.fiado === 0;

  const cliente = estado.clientes.find((c) => String(c.id) === pagos.cliente);
  $('#resumen-total').textContent = formatoCOP(total);
  $('#resumen-vence').textContent =
    pagos.fiado > 0 && cliente ? `El fiado vence en ${cliente.plazo} días.` : '';

  const errores = validar();
  $('#resumen-errores').innerHTML = errores.map((e) => `<p class="texto-error">${e}</p>`).join('');
  $('#btn-confirmar').disabled = errores.length > 0;
}

/* ---------- Vista de ventas: se recarga cada vez que se abre ---------- */
VISTAS.ventas = {
  async abrir() {
    [estado.inventario, estado.clientes, estado.ventas] = await Promise.all([
      API.obtenerInventario(), API.obtenerClientes(), API.obtenerVentasHoy()
    ]);
    // Una compra o ajuste pudo cambiar el stock mientras la venta seguía armada
    estado.carrito = estado.carrito.filter((l) => estado.inventario.some((i) => i.id === l.id));
    dibujarCatalogo();
    dibujarClientes();
    dibujarCarrito();
    dibujarHistorial();
    actualizarResumen();
  }
};

/* ---------- Flujo: login → apertura de caja → aplicación ---------- */
$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  $('#login-error').textContent = '';
  try {
    estado.usuario = await API.login($('#login-usuario').value.trim(), $('#login-clave').value);
    estado.jornada = await API.obtenerJornada();
    if (estado.jornada) await entrarApp(); else await mostrarApertura();
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
});

async function mostrarApertura() {
  const sugerido = await API.obtenerBaseSugerida();
  $('#apertura-saludo').textContent = `Hola ${estado.usuario.nombre}. ¿Con cuánto efectivo inicias hoy?`;
  $('#apertura-base').value = sugerido;
  $('#apertura-sugerido').textContent = `Sugerido por el último cierre: ${formatoCOP(sugerido)}. Puedes cambiarlo.`;
  $('#apertura-error').textContent = '';
  mostrarPantalla('pantalla-apertura');
}

$('#form-apertura').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  try {
    estado.jornada = await API.abrirJornada(soloNumero($('#apertura-base').value), estado.usuario);
    await entrarApp();
  } catch (error) {
    $('#apertura-error').textContent = error.message;
  }
});

async function entrarApp() {
  $('#barra-usuario').textContent = `${estado.usuario.nombre} · ${estado.usuario.rol}`;
  $('#barra-base').textContent = `Base ${formatoCOP(estado.jornada.base)}`;
  mostrarPantalla('pantalla-app');
  await navegar('ventas');
}

$('#btn-salir').addEventListener('click', () => {
  estado.usuario = null;
  estado.jornada = null;
  estado.carrito = [];
  estado.pagoManual = false;
  $('#form-login').reset();
  mostrarPantalla('pantalla-login');
});

/* ---------- Eventos de la vista de ventas ---------- */
$('#buscador').addEventListener('input', dibujarCatalogo);

// Catálogo: agregar producto al carrito
$('#catalogo').addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-id]');
  if (!boton) return;
  const id = Number(boton.dataset.id);
  const existente = estado.carrito.find((l) => l.id === id);
  if (existente) {
    existente.cantidad++;
  } else {
    estado.carrito.push({ id, cantidad: 1, precio: estado.inventario.find((i) => i.id === id).precio });
  }
  dibujarCarrito();
  actualizarResumen();
});

// Carrito: botones +, − y quitar
$('#carrito').addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) return;
  const n = Number(boton.dataset.n);
  if (boton.dataset.accion === 'mas') estado.carrito[n].cantidad++;
  if (boton.dataset.accion === 'menos' && --estado.carrito[n].cantidad < 1) estado.carrito.splice(n, 1);
  if (boton.dataset.accion === 'quitar') estado.carrito.splice(n, 1);
  dibujarCarrito();
  actualizarResumen();
});

// Carrito: escribir cantidad o precio (no redibuja, para conservar el foco)
$('#carrito').addEventListener('input', (evento) => {
  const campo = evento.target.dataset.campo;
  if (!campo) return;
  estado.carrito[Number(evento.target.dataset.n)][campo] = soloNumero(evento.target.value);
  refrescarLineas();
  actualizarResumen();
});

// Al salir de un campo, las líneas con cantidad 0 se eliminan
$('#carrito').addEventListener('change', () => {
  if (estado.carrito.some((l) => l.cantidad < 1)) {
    estado.carrito = estado.carrito.filter((l) => l.cantidad >= 1);
    dibujarCarrito();
    actualizarResumen();
  }
});

// Canal de venta
document.querySelectorAll('.opcion-canal').forEach((boton) => {
  boton.addEventListener('click', () => {
    estado.canal = boton.dataset.canal;
    document.querySelectorAll('.opcion-canal').forEach((b) => b.classList.toggle('activa', b === boton));
  });
});

// Atajos "todo efectivo / digital / fiado"
document.querySelectorAll('[data-todo]').forEach((boton) => {
  boton.addEventListener('click', () => {
    const total = calcularTotal();
    estado.pagoManual = true;
    $('#pago-efectivo').value = boton.dataset.todo === 'efectivo' ? total : 0;
    $('#pago-digital').value = boton.dataset.todo === 'digital' ? total : 0;
    $('#pago-fiado').value = boton.dataset.todo === 'fiado' ? total : 0;
    actualizarResumen();
  });
});

// Edición manual de los campos de pago
$('#bloque-pagos').addEventListener('input', () => {
  estado.pagoManual = true;
  actualizarResumen();
});

/* ---------- Confirmar venta (siempre contra el servidor) ---------- */
$('#btn-confirmar').addEventListener('click', async () => {
  if (!navigator.onLine) {
    avisar('Sin conexión: la venta no se registró.', true);
    return;
  }

  const hayAdvertencia = estado.carrito.some((l) => evaluarStock(l).nivel === 'advertencia');
  if (hayAdvertencia && !confirm('Algún producto supera el stock disponible. ¿Continuar?')) return;

  const pagos = leerPagos();
  const venta = {
    lineas: estado.carrito.map((l) => ({ id: l.id, cantidad: l.cantidad, precio: l.precio })),
    canal: estado.canal,
    efectivo: pagos.efectivo,
    digital: pagos.digital,
    medio: pagos.digital > 0 ? pagos.medio : null,
    fiado: pagos.fiado,
    idCliente: pagos.fiado > 0 ? Number(pagos.cliente) : null
  };

  $('#btn-confirmar').disabled = true;
  try {
    await API.crearVenta(venta);
    avisar('Venta registrada ✔');
    estado.carrito = [];
    estado.pagoManual = false;
    $('#pago-cliente').value = '';
    await VISTAS.ventas.abrir();
  } catch (error) {
    avisar(error.message, true);
    actualizarResumen();
  }
});

/* ---------- Conectividad: sin red se bloquea, no se encola ---------- */
function revisarConexion() {
  $('#banner-conexion').hidden = navigator.onLine;
  if (!$('#pantalla-app').hidden && !$('#vista-ventas').hidden) actualizarResumen();
}
window.addEventListener('online', revisarConexion);
window.addEventListener('offline', revisarConexion);
revisarConexion();