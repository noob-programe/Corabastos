/* LEDGERA · compras.js · Compras y proveedores (RF-004 y RF-006) */
(function () {
  const datos = { proveedores: [], entradas: [], inventario: [], lineas: [] };

  const claseEstado = { Pendiente: 'etq-alerta', Parcial: 'etq-info', Pagado: 'etq-ok' };

  async function cargar() {
    [datos.proveedores, datos.entradas, datos.inventario] = await Promise.all([
      API.obtenerProveedores(), API.obtenerEntradas(), API.obtenerInventario()
    ]);
    dibujarSelectores();
    dibujarProveedores();
    dibujarEntradas();
    dibujarLineas();
  }

  function dibujarSelectores() {
    const elegido = $('#compra-proveedor').value;
    $('#compra-proveedor').innerHTML = '<option value="">— Seleccionar proveedor —</option>' +
      datos.proveedores.filter((p) => p.estado === 'Activo')
        .map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('#compra-proveedor').value = elegido;

    const producto = $('#compra-producto').value;
    $('#compra-producto').innerHTML = datos.inventario
      .map((i) => `<option value="${i.id}">${esc(i.producto)} · ${esc(i.calidad)} (stock ${i.stock})</option>`).join('');
    if (producto) $('#compra-producto').value = producto;
  }

  function dibujarProveedores() {
    const esDueno = estado.usuario.rol === 'Dueño';
    $('#tabla-proveedores').innerHTML = datos.proveedores.map((p) => `
      <tr>
        <td>${esc(p.nombre)}</td>
        <td>${esc(p.telefono) || '—'}</td>
        <td class="derecha">${p.saldo > 0 ? `<strong>${formatoCOP(p.saldo)}</strong>` : '$0'}</td>
        <td><span class="etq ${p.estado === 'Activo' ? 'etq-ok' : 'etq-neutro'}">${p.estado}</span></td>
        <td>${esDueno ? `<button class="boton-texto" data-estado="${p.id}">${p.estado === 'Activo' ? 'Desactivar' : 'Activar'}</button>` : ''}</td>
      </tr>`).join('');
  }

  function dibujarEntradas() {
    $('#tabla-entradas').innerHTML = datos.entradas.length ? datos.entradas.map((e) => `
      <tr>
        <td>${e.id}</td>
        <td>${esc(e.proveedor)}</td>
        <td>${esc(e.documento)}</td>
        <td class="derecha">${formatoCOP(e.total)}</td>
        <td class="derecha">${formatoCOP(e.saldo)}</td>
        <td><span class="etq ${claseEstado[e.estado]}">${e.estado}</span></td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="celda-vacia">Aún no hay entradas.</td></tr>';
  }

  function dibujarLineas() {
    const total = datos.lineas.reduce((t, l) => t + l.cantidad * l.costo, 0);
    $('#compra-lineas').innerHTML = datos.lineas.length ? datos.lineas.map((l, n) => {
      const item = datos.inventario.find((i) => i.id === l.id);
      return `
        <tr>
          <td>${esc(item.producto)} · ${esc(item.calidad)}</td>
          <td class="derecha">${l.cantidad}</td>
          <td class="derecha">${formatoCOP(l.costo)}</td>
          <td class="derecha"><strong>${formatoCOP(l.cantidad * l.costo)}</strong></td>
          <td><button class="boton-texto" data-quitar="${n}">Quitar</button></td>
        </tr>`;
    }).join('') : '<tr><td colspan="5" class="celda-vacia">Agrega los productos que llegaron.</td></tr>';
    $('#compra-total').textContent = formatoCOP(total);
    $('#btn-confirmar-entrada').disabled = datos.lineas.length === 0;
  }

  /* ---------- Eventos ---------- */

  // Mostrar u ocultar el alta de proveedor dentro del mismo flujo
  $('#btn-nuevo-proveedor').addEventListener('click', () => {
    $('#form-proveedor').hidden = !$('#form-proveedor').hidden;
  });

  $('#form-proveedor').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      const nuevo = await API.crearProveedor({
        nombre: $('#prov-nombre').value, telefono: $('#prov-telefono').value
      });
      await cargar();
      $('#compra-proveedor').value = nuevo.id;       // queda seleccionado (RF-004)
      $('#form-proveedor').reset();
      $('#form-proveedor').hidden = true;
      avisar('Proveedor creado ✔');
    } catch (error) {
      avisar(error.message, true);
    }
  });

  $('#btn-agregar-linea').addEventListener('click', () => {
    const cantidad = soloNumero($('#compra-cantidad').value);
    const costo = soloNumero($('#compra-costo').value);
    if (cantidad < 1 || costo < 1) {
      avisar('Cantidad y costo unitario deben ser mayores a cero.', true);
      return;
    }
    datos.lineas.push({ id: Number($('#compra-producto').value), cantidad, costo });
    $('#compra-cantidad').value = '';
    $('#compra-costo').value = '';
    dibujarLineas();
  });

  $('#compra-lineas').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-quitar]');
    if (!boton) return;
    datos.lineas.splice(Number(boton.dataset.quitar), 1);
    dibujarLineas();
  });

  $('#tabla-proveedores').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-estado]');
    if (!boton) return;
    try {
      await API.cambiarEstadoProveedor(Number(boton.dataset.estado));
      await cargar();
    } catch (error) {
      avisar(error.message, true);
    }
  });

  $('#btn-confirmar-entrada').addEventListener('click', async () => {
    if (!navigator.onLine) { avisar('Sin conexión: la entrada no se registró.', true); return; }
    const idProveedor = Number($('#compra-proveedor').value);
    if (!idProveedor) { avisar('Selecciona un proveedor.', true); return; }
    try {
      await API.crearEntrada({
        idProveedor, documento: $('#compra-documento').value, lineas: datos.lineas
      });
      avisar('Entrada registrada ✔ El inventario y la deuda se actualizaron.');
      datos.lineas = [];
      $('#compra-documento').value = '';
      await cargar();
    } catch (error) {
      avisar(error.message, true);
    }
  });

  VISTAS.compras = { abrir: cargar };
})();