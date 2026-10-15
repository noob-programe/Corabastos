/* LEDGERA · clientes.js · Clientes, cartera y abonos (RF-005, RF-012, RF-013) */
(function () {
  const datos = { clientes: [], creditos: [], abonos: [] };

  async function cargar() {
    [datos.clientes, datos.creditos, datos.abonos] = await Promise.all([
      API.obtenerClientes(), API.obtenerCreditos(), API.obtenerAbonosHoy()
    ]);
    datos.creditos.sort((a, b) => b.mora - a.mora);       // los más morosos primero
    dibujar();
  }

  const saldoDe = (idCliente) =>
    datos.creditos.filter((c) => c.idCliente === idCliente).reduce((t, c) => t + c.saldo, 0);

  function dibujar() {
    // Resumen de cartera (RF-013: la mora se calcula por cada deuda)
    const total = datos.creditos.reduce((t, c) => t + c.saldo, 0);
    const vencida = datos.creditos.filter((c) => c.mora > 0).reduce((t, c) => t + c.saldo, 0);
    $('#cartera-total').textContent = formatoCOP(total);
    $('#cartera-vencida').textContent = formatoCOP(vencida);

    $('#tabla-cartera').innerHTML = datos.creditos.length ? datos.creditos.map((c) => `
      <tr>
        <td>${esc(c.cliente)}<br><small class="texto-suave">Venta #${c.idVenta}</small></td>
        <td>${esc(c.telefono)}</td>
        <td>${esc(c.vence)}</td>
        <td>${c.mora > 0 ? `<span class="etq etq-error">${c.mora} días de mora</span>` : '<span class="etq etq-ok">Al día</span>'}</td>
        <td class="derecha"><strong>${formatoCOP(c.saldo)}</strong></td>
        <td><button type="button" class="boton-texto" data-abonar="${c.id}">Abonar</button></td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="celda-vacia">No hay deudas pendientes.</td></tr>';

    // Selector de deuda para abonar
    const elegido = $('#abono-credito').value;
    $('#abono-credito').innerHTML = datos.creditos.length
      ? datos.creditos.map((c) =>
          `<option value="${c.id}">${esc(c.cliente)} · venta #${c.idVenta} · debe ${formatoCOP(c.saldo)}</option>`).join('')
      : '<option value="">No hay deudas pendientes</option>';
    if (elegido) $('#abono-credito').value = elegido;
    if (!$('#abono-credito').value && datos.creditos.length) $('#abono-credito').selectedIndex = 0;
    ayuda();

    $('#tabla-abonos').innerHTML = datos.abonos.length ? datos.abonos.map((a) => `
      <tr>
        <td>${a.hora}</td><td>${esc(a.cliente)}</td>
        <td><span class="etq ${a.medio === 'Efectivo' ? 'etq-alerta' : 'etq-info'}">${a.medio}</span></td>
        <td class="derecha">${formatoCOP(a.recibido)}</td>
        <td class="derecha"><strong>${formatoCOP(a.aplicado)}</strong></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="celda-vacia">Aún no hay abonos en esta jornada.</td></tr>';

    $('#tabla-clientes').innerHTML = datos.clientes.map((c) => `
      <tr>
        <td>${esc(c.nombre)}</td><td>${esc(c.telefono)}</td>
        <td class="derecha">${c.plazo} días</td>
        <td class="derecha">${saldoDe(c.id) > 0 ? `<strong>${formatoCOP(saldoDe(c.id))}</strong>` : '$0'}</td>
      </tr>`).join('');
  }

  function ayuda() {
    const c = datos.creditos.find((x) => String($('#abono-credito').value) === String(x.id));
    $('#abono-ayuda').textContent = c
      ? `Saldo de esta deuda: ${formatoCOP(c.saldo)}. Si el abono la supera, el excedente se registra aparte.` : '';
  }

  $('#abono-credito').addEventListener('change', ayuda);

  // Botón "Abonar" de la tabla: preselecciona la deuda y lleva el foco al monto
  $('#tabla-cartera').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-abonar]');
    if (!boton) return;
    $('#abono-credito').value = boton.dataset.abonar;
    ayuda();
    $('#abono-monto').focus();
  });

  $('#form-abono').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!navigator.onLine) { avisar('Sin conexión: el abono no se registró.', true); return; }
    try {
      const abono = await API.registrarAbono({
        idCredito: Number($('#abono-credito').value),
        medio: $('#abono-medio').value,
        monto: soloNumero($('#abono-monto').value)
      });
      avisar(abono.excedente > 0
        ? `Abono registrado ✔ Excedente de ${formatoCOP(abono.excedente)} pendiente de definir.`
        : 'Abono registrado ✔');
      $('#form-abono').reset();
      await cargar();
    } catch (error) { avisar(error.message, true); }
  });

  $('#form-cliente').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      await API.crearCliente({
        nombre: $('#cli-nombre').value, telefono: $('#cli-telefono').value,
        plazo: soloNumero($('#cli-plazo').value)
      });
      avisar('Cliente creado ✔');
      $('#form-cliente').reset();
      $('#cli-plazo').value = 15;
      await cargar();
    } catch (error) { avisar(error.message, true); }
  });

  VISTAS.clientes = { abrir: cargar };
})();