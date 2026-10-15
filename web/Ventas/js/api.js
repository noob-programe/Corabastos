/* LEDGERA · api.js (versión completa)
   Simula el backend con los datos del seed del SQL. Cada función devuelve una
   promesa, igual que fetch('/api/...'). Al conectar Node solo se reemplaza el
   cuerpo de cada función; los demás archivos no cambian.
   El front NO es la validación final: el servidor debe repetir estas reglas. */

/* ---------- Utilidades internas ---------- */
const esperar = (valor) =>
  new Promise((resolver) => setTimeout(() => resolver(structuredClone(valor)), 150));
const exigir = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje); };
const exigirJornada = () => exigir(bd.jornada, 'No hay jornada abierta. Abre la caja primero.');
const horaActual = () => new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const fechaLocal = (desplazarDias = 0) => {
  const f = new Date();
  f.setDate(f.getDate() + desplazarDias);
  return f.toLocaleDateString('en-CA');          // formato AAAA-MM-DD en hora local
};
const mismoTexto = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const suma = (lista, campo) => lista.reduce((t, x) => t + x[campo], 0);
const estadoPago = (e) => (e.saldo === 0 ? 'Pagado' : e.saldo === e.total ? 'Pendiente' : 'Parcial');
const entero = (n) => Number.isInteger(n) && n > 0;

/* ---------- Datos iniciales (seed del SQL) ---------- */
const bd = {
  sesion: null,
  usuarios: [
    { id: 1, usuario: 'cmendoza', nombre: 'Carlos Mendoza', rol: 'Dueño', puesto: 1 },
    { id: 3, usuario: 'afelipe', nombre: 'Andrés Felipe', rol: 'Vendedor', puesto: 1 },
    { id: 5, usuario: 'aprendiz', nombre: 'Aprendiz SENA', rol: 'Dueño', puesto: 1 }
  ],
  inventario: [
    { id: 1, producto: 'Papa pastusa',  calidad: 'Extra',   stock: 78, minimo: 20, precio: 95000 },
    { id: 2, producto: 'Papa pastusa',  calidad: 'Primera', stock: 33, minimo: 15, precio: 85000 },
    { id: 3, producto: 'Tomate chonto', calidad: 'Extra',   stock: 43, minimo: 10, precio: 65000 },
    { id: 4, producto: 'Cebolla larga', calidad: 'Primera', stock: 30, minimo: 10, precio: 40000 }
  ],
  clientes: [
    { id: 1, nombre: 'Don Juan', telefono: '3201112233', plazo: 15, estado: 'Activo' },
    { id: 2, nombre: 'María Rodríguez (Fruver Suba)', telefono: '3154445566', plazo: 10, estado: 'Activo' },
    { id: 3, nombre: 'Héctor Gómez', telefono: '3187776655', plazo: 15, estado: 'Activo' }
  ],
  proveedores: [
    { id: 1, nombre: 'Don Pedro - Finca El Salitre', telefono: '3109876543', estado: 'Activo' },
    { id: 2, nombre: 'AgroInversiones del Oriente S.A.S.', telefono: '3112345678', estado: 'Activo' }
  ],
  entradas: [
    { id: 1, idProveedor: 1, documento: 'REM-2026-001', total: 1800000, saldo: 1600000, fecha: 'Seed' }
  ],
  // Deudas de fiado (Don Juan en mora para poder probar la alerta de cartera vencida)
  creditos: [
    { id: 1, idVenta: 2, idCliente: 1, original: 340000, saldo: 240000, plazo: 15, vence: fechaLocal(-5), estado: 'Pendiente' },
    { id: 2, idVenta: 4, idCliente: 2, original: 200000, saldo: 200000, plazo: 10, vence: fechaLocal(10), estado: 'Pendiente' }
  ],
  jornada: null,
  ventas: [], abonos: [], egresos: [], movimientos: [], cambiosPrecio: [], cierres: [],
  sigVenta: 5, sigCredito: 3, sigEntrada: 2, sigProveedor: 3, sigItem: 5, sigCliente: 4,
  sigAbono: 1, sigEgreso: 1,
  efectivoUltimoCierre: 200000,
  umbralDescuadre: 1000
};

const mover = (item, tipo, cantidad) =>
  bd.movimientos.unshift({ hora: horaActual(), tipo, producto: `${item.producto} ${item.calidad}`, cantidad, usuario: bd.sesion.nombre });

/* ---------- API ---------- */
const API = {

  /* ===== Acceso y jornada (RF-001, RF-020) ===== */
  async login(usuario, clave) {
    const u = bd.usuarios.find((x) => x.usuario === usuario);
    if (!u || clave !== 'LEDGERA') throw new Error('Usuario o contraseña incorrectos.');
    bd.sesion = u;
    return esperar(u);
  },
  obtenerJornada: () => esperar(bd.jornada),
  obtenerBaseSugerida: () => esperar(bd.efectivoUltimoCierre),
  async abrirJornada(base, usuario) {
    exigir(!bd.jornada, 'Ya hay una jornada abierta.');
    exigir(base >= 0, 'La base debe ser un número mayor o igual a cero.');
    bd.jornada = { base, usuario: usuario.id, apertura: new Date().toISOString() };
    return esperar(bd.jornada);
  },

  /* ===== Inventario (RF-007, RF-008, RF-009) ===== */
  obtenerInventario: () => esperar(bd.inventario),
  obtenerMovimientos: () => esperar(bd.movimientos),
  obtenerCambiosPrecio: () => esperar(bd.cambiosPrecio),

  async crearItemInventario({ producto, calidad, minimo, precio }) {
    exigirJornada();
    exigir(producto.trim() && calidad.trim(), 'Producto y calidad son obligatorios.');
    exigir(!bd.inventario.some((i) => mismoTexto(i.producto, producto) && mismoTexto(i.calidad, calidad)),
      'Ya existe ese producto con esa calidad.');
    const item = { id: bd.sigItem++, producto: producto.trim(), calidad: calidad.trim(), stock: 0, minimo, precio };
    bd.inventario.push(item);
    return esperar(item);
  },

  async actualizarPrecio(id, precio) {
    exigirJornada();
    exigir(entero(precio), 'El precio debe ser mayor a cero.');
    const item = bd.inventario.find((i) => i.id === id);
    bd.cambiosPrecio.push({ id, anterior: item.precio, nuevo: precio, origen: 'Manual', usuario: bd.sesion.nombre, hora: horaActual() });
    item.precio = precio;
    return esperar(item);
  },

  async ajustarInventario({ id, tipo, cantidad, motivo }) {
    exigirJornada();
    exigir(motivo.trim(), 'El motivo es obligatorio.');
    const item = bd.inventario.find((i) => i.id === id);
    if (tipo === 'Merma') {
      exigir(entero(cantidad), 'La merma debe ser mayor a cero.');
      exigir(cantidad <= item.stock, `No puedes dar de baja más de lo que hay (${item.stock}).`);
      item.stock -= cantidad;
      mover(item, 'Merma', -cantidad);
    } else {
      exigir(cantidad >= 0, 'La cantidad contada debe ser cero o mayor.');
      const diferencia = cantidad - item.stock;
      item.stock = cantidad;
      mover(item, 'Corrección por conteo', diferencia);
    }
    return esperar(item);
  },

  /* ===== Proveedores y compras (RF-004, RF-006) ===== */
  async obtenerProveedores() {
    return esperar(bd.proveedores.map((p) => ({
      ...p,
      saldo: suma(bd.entradas.filter((e) => e.idProveedor === p.id), 'saldo')
    })));
  },

  async crearProveedor({ nombre, telefono }) {
    exigirJornada();
    exigir(nombre.trim(), 'El nombre del proveedor es obligatorio.');
    exigir(!bd.proveedores.some((p) => mismoTexto(p.nombre, nombre)), 'Ya existe un proveedor con ese nombre.');
    const proveedor = { id: bd.sigProveedor++, nombre: nombre.trim(), telefono: telefono.trim(), estado: 'Activo' };
    bd.proveedores.push(proveedor);
    return esperar(proveedor);
  },

  async cambiarEstadoProveedor(id) {
    exigir(bd.sesion.rol === 'Dueño', 'Solo el Dueño puede activar o desactivar proveedores.');
    const p = bd.proveedores.find((x) => x.id === id);
    p.estado = p.estado === 'Activo' ? 'Inactivo' : 'Activo';
    return esperar(p);
  },

  async obtenerEntradas() {
    return esperar(bd.entradas.map((e) => ({
      ...e,
      proveedor: bd.proveedores.find((p) => p.id === e.idProveedor).nombre,
      estado: estadoPago(e)
    })).reverse());
  },

  /* Equivale a entradas_mercancia + detalle_entrada + trigger trg_entrada_mercancia */
  async crearEntrada({ idProveedor, documento, lineas }) {
    exigirJornada();
    const proveedor = bd.proveedores.find((p) => p.id === idProveedor);
    exigir(proveedor && proveedor.estado === 'Activo', 'Selecciona un proveedor activo.');
    exigir(lineas.length > 0, 'Agrega al menos un producto a la entrada.');
    exigir(lineas.every((l) => entero(l.cantidad) && entero(l.costo)), 'Cantidad y costo deben ser mayores a cero.');

    const doc = documento.trim() || `INT-${bd.sigEntrada}`;
    exigir(!bd.entradas.some((e) => e.idProveedor === idProveedor && mismoTexto(e.documento, doc)),
      'Ese proveedor ya tiene una entrada con ese documento.');

    const total = lineas.reduce((t, l) => t + l.cantidad * l.costo, 0);
    lineas.forEach((l) => {
      const item = bd.inventario.find((i) => i.id === l.id);
      item.stock += l.cantidad;
      mover(item, 'Entrada', l.cantidad);
    });
    const entrada = { id: bd.sigEntrada++, idProveedor, documento: doc, total, saldo: total, fecha: horaActual() };
    bd.entradas.push(entrada);
    return esperar(entrada);
  },

  /* ===== Clientes (RF-005) ===== */
  obtenerClientes: () => esperar(bd.clientes),

  async crearCliente({ nombre, telefono, plazo }) {
    exigirJornada();
    exigir(nombre.trim() && telefono.trim(), 'Nombre y teléfono son obligatorios.');
    exigir(!bd.clientes.some((c) => c.telefono === telefono.trim()), 'Ya existe un cliente con ese teléfono.');
    exigir(entero(plazo), 'El plazo debe ser un número de días mayor a cero.');
    const cliente = { id: bd.sigCliente++, nombre: nombre.trim(), telefono: telefono.trim(), plazo, estado: 'Activo' };
    bd.clientes.push(cliente);
    return esperar(cliente);
  },

  /* ===== Ventas (RF-010, RF-011) ===== */
  obtenerVentasHoy: () => esperar(bd.ventas),

  async crearVenta(venta) {
    exigirJornada();
    exigir(venta.lineas.length > 0, 'Agrega al menos un producto.');
    const total = venta.lineas.reduce((t, l) => t + l.cantidad * l.precio, 0);
    exigir(venta.efectivo + venta.digital + venta.fiado === total, 'Efectivo + digital + fiado deben sumar el total.');
    exigir(!(venta.fiado > 0 && !venta.idCliente), 'Una venta a fiado necesita un cliente.');

    for (const l of venta.lineas) {
      const item = bd.inventario.find((i) => i.id === l.id);
      exigir(item.stock > 0, `${item.producto} ${item.calidad}: sin stock.`);
      exigir((l.cantidad - item.stock) / item.stock < 0.2, `${item.producto} ${item.calidad}: faltante de 20 % o más.`);
    }
    venta.lineas.forEach((l) => {
      const item = bd.inventario.find((i) => i.id === l.id);
      item.stock -= l.cantidad;
      mover(item, 'Venta', -l.cantidad);
    });

    const cliente = bd.clientes.find((c) => c.id === venta.idCliente);
    const registrada = {
      ...venta, id: bd.sigVenta++, total,
      cliente: cliente ? cliente.nombre : null, hora: horaActual(), estado: 'Confirmada'
    };
    bd.ventas.unshift(registrada);

    // Equivale al trigger trg_crear_credito
    if (venta.fiado > 0) {
      bd.creditos.push({
        id: bd.sigCredito++, idVenta: registrada.id, idCliente: cliente.id,
        original: venta.fiado, saldo: venta.fiado, plazo: cliente.plazo,
        vence: fechaLocal(cliente.plazo), estado: 'Pendiente'
      });
    }
    return esperar(registrada);
  },

  /* ===== Cartera y abonos (RF-012, RF-013) ===== */
  async obtenerCreditos() {
    const hoy = new Date(fechaLocal());
    return esperar(bd.creditos.filter((c) => c.estado === 'Pendiente').map((c) => {
      const cli = bd.clientes.find((x) => x.id === c.idCliente);
      const mora = Math.max(0, Math.floor((hoy - new Date(c.vence)) / 86400000));
      return { ...c, cliente: cli.nombre, telefono: cli.telefono, mora };
    }));
  },

  /* Equivale a sp_registrar_abono: aplica hasta el saldo; el resto queda como excedente */
  async registrarAbono({ idCredito, medio, monto }) {
    exigirJornada();
    const credito = bd.creditos.find((c) => c.id === idCredito && c.estado === 'Pendiente');
    exigir(credito, 'Esa deuda no existe o ya está pagada.');
    exigir(entero(monto), 'El abono debe ser mayor a cero.');
    const aplicado = Math.min(monto, credito.saldo);
    credito.saldo -= aplicado;
    if (credito.saldo === 0) credito.estado = 'Pagado';
    const abono = {
      id: bd.sigAbono++, idCredito, medio, recibido: monto, aplicado,
      cliente: bd.clientes.find((c) => c.id === credito.idCliente).nombre,
      excedente: monto - aplicado, hora: horaActual(), usuario: bd.sesion.nombre
    };
    bd.abonos.unshift(abono);
    return esperar(abono);
  },
  obtenerAbonosHoy: () => esperar(bd.abonos),

  /* ===== Egresos (RF-014) ===== */
  obtenerEgresos: () => esperar(bd.egresos),

  /* Equivale a egresos_caja + trigger trg_validar_pago_proveedor */
  async crearEgreso({ categoria, medio, monto, nota, idEntrada }) {
    exigirJornada();
    exigir(entero(monto), 'El monto debe ser mayor a cero.');
    let detalle = nota.trim();
    if (categoria === 'Pago_proveedor') {
      const entrada = bd.entradas.find((e) => e.id === idEntrada);
      exigir(entrada, 'Selecciona la factura que estás pagando.');
      exigir(monto <= entrada.saldo, 'El pago supera lo que se le debe al proveedor en esa factura.');
      entrada.saldo -= monto;
      const prov = bd.proveedores.find((p) => p.id === entrada.idProveedor);
      detalle = `${prov.nombre} · ${entrada.documento}`;
    } else {
      exigir(detalle, 'Los gastos de urgencia y otros necesitan una nota explicativa.');
    }
    const egreso = { id: bd.sigEgreso++, categoria, medio, monto, detalle, hora: horaActual(), usuario: bd.sesion.nombre };
    bd.egresos.unshift(egreso);
    return esperar(egreso);
  },

  /* ===== Cierre de caja (RF-015, RF-018) ===== */
  async resumenCaja() {
    exigirJornada();
    const ef = (lista, campo, filtro) => suma(lista.filter(filtro), campo);
    const ventasEfectivo = suma(bd.ventas, 'efectivo');
    const abonosEfectivo = ef(bd.abonos, 'recibido', (a) => a.medio === 'Efectivo');
    const egresosEfectivo = ef(bd.egresos, 'monto', (e) => e.medio === 'Efectivo');
    return esperar({
      base: bd.jornada.base, ventasEfectivo, abonosEfectivo, egresosEfectivo,
      esperado: bd.jornada.base + ventasEfectivo + abonosEfectivo - egresosEfectivo,
      ventasDigital: suma(bd.ventas, 'digital'),
      abonosDigital: ef(bd.abonos, 'recibido', (a) => a.medio !== 'Efectivo'),
      egresosDigital: ef(bd.egresos, 'monto', (e) => e.medio !== 'Efectivo'),
      fiadoDelDia: suma(bd.ventas, 'fiado'),
      cantidadVentas: bd.ventas.length,
      umbral: bd.umbralDescuadre
    });
  },

  /* Equivale a sp_cerrar_caja */
  async cerrarCaja({ contado, explicacion }) {
    const r = await API.resumenCaja();
    exigir(contado >= 0, 'El efectivo contado debe ser cero o mayor.');
    const diferencia = contado - r.esperado;
    exigir(!(Math.abs(diferencia) > r.umbral && !explicacion.trim()),
      'La diferencia supera el límite permitido. Escribe una explicación para cerrar.');
    const cierre = {
      fecha: fechaLocal(), hora: horaActual(), base: r.base, esperado: r.esperado, contado, diferencia,
      explicacion: explicacion.trim(), umbral: r.umbral,
      estado: Math.abs(diferencia) > r.umbral ? 'Con_descuadre' : 'Cerrado', usuario: bd.sesion.nombre
    };
    bd.cierres.unshift(cierre);
    bd.efectivoUltimoCierre = contado;
    bd.jornada = null;                    // la jornada termina: hay que abrir caja de nuevo
    bd.ventas = []; bd.abonos = []; bd.egresos = []; bd.movimientos = [];
    return esperar(cierre);
  },
  obtenerCierres: () => esperar(bd.cierres)
};