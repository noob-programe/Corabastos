/* LEDGERA · egresos.js · Egresos de caja y pago a proveedores (RF-014) */
(function () {
  const datos = { entradas: [], egresos: [] };
  const nombreCategoria = { Pago_proveedor: 'Pago a proveedor', Gasto_urgencia: 'Gasto de urgencia', Otros: 'Otros' };

  const pendientes = () => datos.entradas.filter((e) => e.saldo > 0);

  async function cargar() {
    [datos.entradas, datos.egresos] = await Promise.all([API.obtenerEntradas(), API.obtenerEgresos()]);
    dibujar();
  }

  function dibujar() {
    const esPago = $('#egreso-categoria').value === 'Pago_proveedor';
    $('#egreso-bloque-factura').hidden = !esPago;
    $('#egreso-bloque-nota').hidden = esPago;

    const elegida = $('#egreso-factura').value;
    const lista = pendientes();
    $('#egreso-factura').innerHTML = lista.length
      ? lista.map((e) => `<option value="${e.id}">${esc(e.proveedor)} · ${esc(e.documento)} · debe ${formatoCOP(e.saldo)}</option>`).join('')
      : '<option value="">No hay facturas pendientes</option>';
    if (elegida) $('#egreso-factura').value = elegida;
    sugerirMonto(false);

    $('#tabla-egresos').innerHTML = datos.egresos.length ? datos.egresos.map((e) => `
      <tr>
        <td>${e.hora}</td>
        <td>${nombreCategoria[e.categoria]}</td>
        <td>${esc(e.detalle)}</td>
        <td><span class="etq ${e.medio === 'Efectivo' ? 'etq-alerta' : 'etq-info'}">${e.medio}</span></td>
        <td class="derecha"><strong>${formatoCOP(e.monto)}</strong></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="celda-vacia">Aún no hay egresos en esta jornada.</td></tr>';
  }

  // Sugiere el saldo de la factura elegida; el usuario puede editarlo (RF-014)
  function sugerirMonto(forzar) {
    const entrada = datos.entradas.find((e) => String($('#egreso-factura').value) === String(e.id));
    const esPago = $('#egreso-categoria').value === 'Pago_proveedor';
    $('#egreso-ayuda').textContent = esPago && entrada
      ? `Saldo de la factura: ${formatoCOP(entrada.saldo)}. No puedes pagar más que eso.` : '';
    if (esPago && entrada && (forzar || !$('#egreso-monto').value)) $('#egreso-monto').value = entrada.saldo;
  }

  $('#egreso-categoria').addEventListener('change', () => { $('#egreso-monto').value = ''; dibujar(); sugerirMonto(true); });
  $('#egreso-factura').addEventListener('change', () => sugerirMonto(true));

  $('#form-egreso').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!navigator.onLine) { avisar('Sin conexión: el egreso no se registró.', true); return; }
    const categoria = $('#egreso-categoria').value;
    try {
      await API.crearEgreso({
        categoria,
        medio: $('#egreso-medio').value,
        monto: soloNumero($('#egreso-monto').value),
        nota: $('#egreso-nota').value,
        idEntrada: categoria === 'Pago_proveedor' ? Number($('#egreso-factura').value) : null
      });
      avisar('Egreso registrado ✔');
      $('#form-egreso').reset();
      await cargar();
    } catch (error) {
      avisar(error.message, true);
    }
  });

  VISTAS.egresos = { abrir: cargar };
})();