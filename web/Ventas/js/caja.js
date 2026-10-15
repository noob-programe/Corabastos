/* LEDGERA · caja.js · Cierre de caja diario e historial (RF-015, RF-018) */
(function () {
  let resumen = null;

  const conSigno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + formatoCOP(Math.abs(n));
  const fila = (texto, valor, fuerte) =>
    `<tr><td>${texto}</td><td class="derecha">${fuerte ? `<strong>${valor}</strong>` : valor}</td></tr>`;

  async function cargar() {
    const [r, cierres] = await Promise.all([API.resumenCaja(), API.obtenerCierres()]);
    resumen = r;
    $('#caja-detalle').innerHTML =
      fila('Base inicial', formatoCOP(r.base)) +
      fila(`Ventas en efectivo (${r.cantidadVentas} ventas)`, '+ ' + formatoCOP(r.ventasEfectivo)) +
      fila('Abonos en efectivo', '+ ' + formatoCOP(r.abonosEfectivo)) +
      fila('Egresos en efectivo', '− ' + formatoCOP(r.egresosEfectivo));
    $('#caja-esperado').textContent = formatoCOP(r.esperado);
    $('#caja-digital').innerHTML =
      fila('Ventas digitales', formatoCOP(r.ventasDigital)) +
      fila('Abonos digitales', formatoCOP(r.abonosDigital)) +
      fila('Egresos digitales', formatoCOP(r.egresosDigital)) +
      fila('Fiado otorgado hoy', formatoCOP(r.fiadoDelDia));

    $('#caja-historial').innerHTML = cierres.length ? cierres.map((c) => `
      <tr>
        <td>${c.fecha} ${c.hora}</td>
        <td class="derecha">${formatoCOP(c.esperado)}</td>
        <td class="derecha">${formatoCOP(c.contado)}</td>
        <td class="derecha">${conSigno(c.diferencia)}</td>
        <td><span class="etq ${c.estado === 'Cerrado' ? 'etq-ok' : 'etq-alerta'}">${c.estado === 'Cerrado' ? 'Cerrado' : 'Con descuadre'}</span></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="celda-vacia">Aún no hay cierres.</td></tr>';
    evaluar();
  }

  // Recalcula diferencia y exige explicación solo si supera el umbral del puesto
  function evaluar() {
    const hayConteo = $('#caja-contado').value.trim() !== '';
    const dif = soloNumero($('#caja-contado').value) - resumen.esperado;
    const supera = hayConteo && Math.abs(dif) > resumen.umbral;
    $('#caja-diferencia').textContent = hayConteo ? conSigno(dif) : '—';
    $('#caja-bloque-explicacion').hidden = !supera;
    $('#caja-mensaje').textContent = !hayConteo ? ''
      : supera ? `La diferencia supera el umbral (${formatoCOP(resumen.umbral)}). Escribe una explicación.`
      : 'Dentro del umbral: cierre normal.';
    const falta = supera && !$('#caja-explicacion').value.trim();
    $('#btn-cerrar-caja').disabled = !hayConteo || falta;
  }

  $('#caja-contado').addEventListener('input', evaluar);
  $('#caja-explicacion').addEventListener('input', evaluar);

  $('#btn-cerrar-caja').addEventListener('click', async () => {
    if (!navigator.onLine) { avisar('Sin conexión: el cierre no se registró.', true); return; }
    if (!confirm('El cierre confirmado no se puede editar. ¿Cerrar la caja?')) return;
    try {
      const cierre = await API.cerrarCaja({
        contado: soloNumero($('#caja-contado').value),
        explicacion: $('#caja-explicacion').value
      });
      avisar(`Caja cerrada ✔ Diferencia: ${conSigno(cierre.diferencia)}`);
      $('#caja-contado').value = '';
      $('#caja-explicacion').value = '';
      estado.jornada = null;
      estado.carrito = [];
      await mostrarApertura();       // sin jornada abierta no se opera (RF-020)
    } catch (error) {
      avisar(error.message, true);
    }
  });

  VISTAS.caja = { abrir: cargar };
})();