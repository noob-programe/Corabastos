// =====================================================
// LEDGERA · Dashboard del Dueño y del Vendedor
// =====================================================
const API_URL = '/ledgera/api';
const PAGINA_LOGIN = '/ledgera/index.html';
const PAGINA_CAMBIAR_CLAVE = '/ledgera/cambiar-clave.html';
const PAGINA_ADMIN = '/ledgera/dashboardAdmin.html';

// Páginas de cada módulo. Mientras una no exista, déjala en null:
// se muestra "pronto" en vez de un 404. Cuando la crees, pon su ruta.
const PAGINAS_MODULO = {
  ventas:        '/ledgera/ventas.html',
  inventario:    '/ledgera/inventario.html',
  fiado:         null,   // '/ledgera/fiado.html'
  egresos:       null,   // '/ledgera/egresos.html'
  exportaciones: null,   // '/ledgera/exportaciones.html'  (solo Dueño)
  equipo:        null,   // '/ledgera/equipo.html'  (solo Dueño, desde el menú del perfil)
  cierre:        null    // '/ledgera/cierre-caja.html'
};

let sesion = null;

const FRASES = [
  `Hola, <span class="acento">{nombre}</span> `,
  `¿Listo para vender, <span class="acento">{nombre}</span>? `,
  `Buen día, <span class="acento">{nombre}</span>. A darle con todo `,
  `¿Qué vendemos hoy, <span class="acento">{nombre}</span>? `,
  `Las cuentas claras, <span class="acento">{nombre}</span> `,
  `¡Vamos con toda, <span class="acento">{nombre}</span>! `
];

// -----------------------------------------------------
// Utilidades
// -----------------------------------------------------
function obtenerIniciales(nombreCompleto) {
  if (!nombreCompleto) return "?";
  const partes = nombreCompleto.trim().split(/\s+/);
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function obtenerPrimerNombre(nombreCompleto) {
  return nombreCompleto ? nombreCompleto.trim().split(/\s+/)[0] : "";
}

function avisar(texto) {
  let t = document.getElementById("toastAviso");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastAviso";
    t.style.cssText = "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);" +
      "background:#1a3d1a;color:#fff;padding:14px 22px;border-radius:10px;font:600 15px Inter,sans-serif;" +
      "z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3);";
    document.body.appendChild(t);
  }
  t.textContent = texto;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = "none"; }, 2500);
}

function irAModulo(modulo) {
  const destino = PAGINAS_MODULO[modulo];
  if (destino) window.location.href = destino;
  else avisar("Este módulo estará disponible pronto.");
}

// -----------------------------------------------------
// Sesión (la valida el servidor, no el navegador)
// -----------------------------------------------------
async function cargarSesion() {
  try {
    const r = await fetch(`${API_URL}/me.php`, { credentials: "same-origin" });
    const data = await r.json();

    if (!data.ok) { window.location.href = PAGINA_LOGIN; return false; }
    if (data.usuario.cambiar_clave) { window.location.href = PAGINA_CAMBIAR_CLAVE; return false; }
    if (data.usuario.rol === "Administrador") { window.location.href = PAGINA_ADMIN; return false; }

    sesion = { nombre: data.usuario.nombre, rol: data.usuario.rol };
    return true;
  } catch (_) {
    window.location.href = PAGINA_LOGIN;
    return false;
  }
}

async function cerrarSesion() {
  try { await fetch(`${API_URL}/logout.php`, { method: "POST", credentials: "same-origin" }); } catch (_) {}
  window.location.href = PAGINA_LOGIN;
}

// -----------------------------------------------------
// Pintar la pantalla
// -----------------------------------------------------
function renderizarUsuario() {
  document.getElementById("nombreUsuario").textContent = sesion.nombre;
  document.getElementById("avatarUsuario").textContent = obtenerIniciales(sesion.nombre);
}

function mostrarSaludoAleatorio() {
  const saludoEl = document.getElementById("saludo");
  const frase = FRASES[Math.floor(Math.random() * FRASES.length)];
  saludoEl.innerHTML = frase.replace("{nombre}", obtenerPrimerNombre(sesion.nombre));
}

// Oculta lo que no corresponde al rol (solo estética: el PHP es quien protege)
function aplicarRol() {
  document.querySelectorAll("[data-solo]").forEach((el) => {
    if (el.dataset.solo !== sesion.rol) el.style.display = "none";
  });
}

// -----------------------------------------------------
// Eventos
// -----------------------------------------------------
function initDropdown() {
  const perfilBtn = document.getElementById("perfilBtn");
  const dropdown = document.getElementById("dropdown");
  if (!perfilBtn || !dropdown) return;

  perfilBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const activo = dropdown.classList.toggle("activo");
    perfilBtn.setAttribute("aria-expanded", activo);
  });
  document.addEventListener("click", () => {
    dropdown.classList.remove("activo");
    perfilBtn.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dropdown.classList.remove("activo");
      perfilBtn.setAttribute("aria-expanded", "false");
    }
  });

  dropdown.querySelectorAll("[data-menu-modulo]").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); irAModulo(a.dataset.menuModulo); });
  });

  const cerrar = dropdown.querySelector(".cerrar");
  if (cerrar) cerrar.addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
}

function initCards() {
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => irAModulo(card.dataset.modulo));
  });
  const btnCierre = document.getElementById("btnCierre");
  if (btnCierre) btnCierre.addEventListener("click", () => irAModulo("cierre"));
}

// -----------------------------------------------------
// Init
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  if (!(await cargarSesion())) return;
  renderizarUsuario();
  mostrarSaludoAleatorio();
  aplicarRol();
  initDropdown();
  initCards();
});