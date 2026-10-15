/* LEDGERA · inventario.js · Existencias, precios y ajustes (RF-007, RF-008, RF-009) */
(function () {
  const datos = { inventario: [], movimientos: [], cambios: [] };

  async function cargar() {
    [datos.inventario, datos.movimientos, datos.cambios] = await Promise.all([
      API.obtenerInventario(), API.obtenerMovimientos(), API.obtenerCambiosPrecio()
    ]);
    dibujar();
  }

  function etiquetaStock(i) {
    if (i.stock < 0) return '<span class="etq etq-error">Negativo</span>';
    if (i.stock <= i.minimo) return '<span class="etq etq-alerta">Stock bajo</span>';
    return '<span class="etq etq-ok">Normal</span>';
  }

  function dibujar() {
    $('#tabla-inventario').innerHTML = datos.inventario.map((i) => `
      <tr>
        <td>${esc(i.producto)}</td>
        <td>${esc(i.calidad)}</td>
        <td class="derecha ${i.stock < 0 ? 'cifra-negativa' : ''}"><strong>${i.stock}</strong></td>
        <td class="derecha">${i.minimo}</td>
        <td>${etiquetaStock(i)}</td>
        <td><div class="celda-precio">
          <input class="campo-tabla" type="text" inputmode="numeric" value="${i.precio}" data-precio="${i.id}">
          <button type="button" class="boton-texto" data-guardar="${i.id}">Guardar</button>
        </div></td>
      </tr>`).join('');

    const elegido = $('#ajuste-item').value;
    $('#ajuste-item').innerHTML = datos.inventario.map((i) =>
      `<option value="${i.id}">${esc(i.producto)} · ${esc(i.calidad)} (stock ${i.stock})</option>`).join('');
    if (elegido) $('#ajuste-item').value = elegido;

    $('#tabla-movimientos').innerHTML = datos.movimientos.length ? datos.movimientos.map((m) => `
      <tr>
        <td>${m.hora}</td><td>${esc(m.tipo)}</td><td>${esc(m.producto)}</td>
        <td class="derecha"><strong>${m.cantidad > 0 ? '+' : ''}${m.cantidad}</strong></td>
        <td>${esc(m.usuario)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="celda-vacia">Aún no hay movimientos en esta jornada.</td></tr>';

    $('#tabla-cambios').innerHTML = datos.cambios.length ? [...datos.cambios].reverse().map((c) => {
      const item = datos.inventario.find((i) => i.id === c.id);
      return `<tr>
        <td>${c.hora}</td><td>${esc(item.producto)} · ${esc(item.calidad)}</td>
        <td class="derecha">${formatoCOP(c.anterior)}</td>
        <td class="derecha"><strong>${formatoCOP(c.nuevo)}</strong></td>
        <td><span class="etq ${c.origen === 'Entrada' ? 'etq-info' : 'etq-neutro'}">${c.origen}</span></td>
        <td>${esc(c.usuario)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="celda-vacia">Aún no hay cambios de precio.</td></tr>';
  }

  // RF-007: cambiar precio sin entrada de mercancía
  $('#tabla-inventario').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-guardar]');
    if (!boton) return;
    const id = Number(boton.dataset.guardar);
    const nuevo = soloNumero($(`[data-precio="${id}"]`).value);
    if (nuevo === datos.inventario.find((i) => i.id === id).precio) { avisar('El precio no cambió.', true); return; }
    if (!navigator.onLine) { avisar('Sin conexión: el precio no se actualizó.', true); return; }
    try {
      await API.actualizarPrecio(id, nuevo);
      avisar('Precio actualizado ✔');
      await cargar();
    } catch (error) { avisar(error.message, true); }
  });

  // RF-008: la etiqueta cambia según el tipo de ajuste
  $('#ajuste-tipo').addEventListener('change', () => {
    $('#ajuste-etiqueta').textContent =
      $('#ajuste-tipo').value === 'Merma' ? 'Unidades perdidas' : 'Cantidad contada (total físico)';
  });

  $('#form-ajuste').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!navigator.onLine) { avisar('Sin conexión: el ajuste no se registró.', true); return; }
    try {
      await API.ajustarInventario({
        id: Number($('#ajuste-item').value), tipo: $('#ajuste-tipo').value,
        cantidad: soloNumero($('#ajuste-cantidad').value), motivo: $('#ajuste-motivo').value
      });
      avisar('Ajuste registrado ✔');
      $('#form-ajuste').reset();
      await cargar();
    } catch (error) { avisar(error.message, true); }
  });

  $('#form-nuevo-item').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      await API.crearItemInventario({
        producto: $('#nuevo-producto').value, calidad: $('#nuevo-calidad').value,
        minimo: soloNumero($('#nuevo-minimo').value), precio: soloNumero($('#nuevo-precio').value)
      });
      avisar('Producto creado ✔');
      $('#form-nuevo-item').reset();
      await cargar();
    } catch (error) { avisar(error.message, true); }
  });

  VISTAS.inventario = { abrir: cargar };
})();