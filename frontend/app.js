"use strict";

// Se usa una ruta relativa para que el navegador contacte al mismo origen que sirve
// el frontend. Así Nginx puede dirigir la petición al backend sin exponer ni fijar
// direcciones IP, dominios o puertos en el código del cliente.
const API_URL = "/api/visitantes";

const form = document.querySelector("#visitor-form");
const nameInput = document.querySelector("#nombre");
const emailInput = document.querySelector("#correo");
const categoryInput = document.querySelector("#categoria_entrada");
const submitButton = document.querySelector("#submit-button");
const clearButton = document.querySelector("#clear-button");
const refreshButton = document.querySelector("#refresh-button");
const tableBody = document.querySelector("#visitors-table-body");
const tableWrapper = document.querySelector("#table-wrapper");
const loadingMessage = document.querySelector("#loading-message");
const emptyMessage = document.querySelector("#empty-message");
const visitorCount = document.querySelector("#visitor-count");
const notification = document.querySelector("#notification");
const serviceStatus = document.querySelector("#service-status");
const serviceStatusText = document.querySelector("#service-status-text");

const errorElements = {
  nombre: document.querySelector("#nombre-error"),
  correo: document.querySelector("#correo-error"),
  categoria_entrada: document.querySelector("#categoria-error")
};

let requestInProgress = false;
let notificationTimer;

function setServiceStatus(status, text) {
  serviceStatus.classList.remove("online", "offline");
  if (status) serviceStatus.classList.add(status);
  serviceStatusText.textContent = text;
}

function showNotification(message, type = "success") {
  window.clearTimeout(notificationTimer);
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.hidden = false;
  notificationTimer = window.setTimeout(() => {
    notification.hidden = true;
  }, 6000);
}

function setFieldError(input, errorElement, message) {
  errorElement.textContent = message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

function clearValidationErrors() {
  setFieldError(nameInput, errorElements.nombre, "");
  setFieldError(emailInput, errorElements.correo, "");
  setFieldError(categoryInput, errorElements.categoria_entrada, "");
}

// La validación se ejecuta antes del POST y devuelve false si un dato obligatorio
// está vacío o no cumple el formato esperado. Cada error se muestra junto al campo.
function validateForm() {
  clearValidationErrors();
  let isValid = true;
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name) {
    setFieldError(nameInput, errorElements.nombre, "Ingresa el nombre completo.");
    isValid = false;
  } else if (name.length < 3) {
    setFieldError(nameInput, errorElements.nombre, "El nombre debe tener al menos 3 caracteres.");
    isValid = false;
  }

  if (!email) {
    setFieldError(emailInput, errorElements.correo, "Ingresa el correo electrónico.");
    isValid = false;
  } else if (!emailPattern.test(email)) {
    setFieldError(emailInput, errorElements.correo, "Ingresa un correo electrónico válido.");
    isValid = false;
  }

  if (!categoryInput.value) {
    setFieldError(categoryInput, errorElements.categoria_entrada, "Selecciona una categoría de entrada.");
    isValid = false;
  }

  if (!isValid) {
    form.querySelector('[aria-invalid="true"]')?.focus();
  }

  return isValid;
}

async function parseJsonResponse(response, allowEmpty = false) {
  const text = await response.text();
  if (!text.trim()) {
    if (allowEmpty) return null;
    throw new Error("El servicio devolvió una respuesta vacía.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("El servicio devolvió una respuesta que no es JSON válido.");
  }
}

function getHttpError(response, payload) {
  const serverMessage = payload && typeof payload === "object"
    ? payload.mensaje || payload.message || payload.detail
    : "";
  return serverMessage || `La solicitud falló con el estado HTTP ${response.status}.`;
}

function normalizeVisitors(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.visitantes)) return payload.visitantes;
  if (payload && Array.isArray(payload.data)) return payload.data;
  throw new Error("La respuesta del servicio no contiene una lista de visitantes válida.");
}

function formatDate(dateValue) {
  if (!dateValue) return "Sin fecha";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value ?? "—";
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

// La tabla se reconstruye con createElement, textContent y un fragmento. Los datos
// recibidos nunca se insertan como HTML, reduciendo el riesgo de inyección de código.
function renderVisitors(visitors) {
  const fragment = document.createDocumentFragment();

  visitors.forEach((visitor) => {
    const row = document.createElement("tr");
    appendCell(row, visitor.id);
    appendCell(row, visitor.nombre);
    appendCell(row, visitor.correo);

    const categoryCell = document.createElement("td");
    const categoryBadge = document.createElement("span");
    categoryBadge.className = "category-badge";
    categoryBadge.textContent = visitor.categoria_entrada ?? "—";
    categoryCell.appendChild(categoryBadge);
    row.appendChild(categoryCell);

    appendCell(row, formatDate(visitor.fecha_registro));
    fragment.appendChild(row);
  });

  tableBody.replaceChildren(fragment);
  visitorCount.textContent = String(visitors.length);
  tableWrapper.hidden = visitors.length === 0;
  emptyMessage.hidden = visitors.length !== 0;
}

function showLoading(isLoading) {
  loadingMessage.hidden = !isLoading;
  if (isLoading) {
    emptyMessage.hidden = true;
    tableWrapper.hidden = true;
  }
}

// GET consulta la colección, acepta el arreglo principal y las envolturas temporales
// { visitantes: [] } o { data: [] }, y luego actualiza tabla y contador.
async function loadVisitors({ showErrors = true } = {}) {
  refreshButton.disabled = true;
  refreshButton.textContent = "Actualizando…";
  showLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(getHttpError(response, payload));
    }

    const visitors = normalizeVisitors(payload);
    renderVisitors(visitors);
    setServiceStatus("online", "Servicio disponible");
    return true;
  } catch (error) {
    tableBody.replaceChildren();
    visitorCount.textContent = "0";
    tableWrapper.hidden = true;
    emptyMessage.hidden = false;
    setServiceStatus("offline", "Servicio no disponible");
    if (showErrors) {
      showNotification(`No fue posible cargar los visitantes. ${error.message}`, "error");
    }
    return false;
  } finally {
    showLoading(false);
    refreshButton.disabled = false;
    refreshButton.textContent = "↻ Actualizar";
  }
}

// POST envía únicamente los tres campos acordados. Si termina correctamente,
// limpia el formulario y ejecuta nuevamente el GET para sincronizar la tabla.
async function registerVisitor(event) {
  event.preventDefault();
  if (requestInProgress || !validateForm()) return;

  requestInProgress = true;
  submitButton.disabled = true;
  clearButton.disabled = true;
  submitButton.textContent = "Registrando…";

  const visitor = {
    nombre: nameInput.value.trim(),
    correo: emailInput.value.trim(),
    categoria_entrada: categoryInput.value
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(visitor)
    });
    const payload = await parseJsonResponse(response, response.ok);

    if (!response.ok) {
      throw new Error(getHttpError(response, payload));
    }

    form.reset();
    clearValidationErrors();
    showNotification("Visitante registrado correctamente.", "success");
    setServiceStatus("online", "Servicio disponible");
    await loadVisitors({ showErrors: true });
  } catch (error) {
    // Los errores HTTP, de red, respuestas vacías inesperadas y JSON inválido se
    // transforman en mensajes visibles; finally siempre restaura los controles.
    setServiceStatus("offline", "Servicio no disponible");
    showNotification(`No fue posible registrar al visitante. ${error.message}`, "error");
  } finally {
    requestInProgress = false;
    submitButton.disabled = false;
    clearButton.disabled = false;
    submitButton.textContent = "Registrar visitante";
  }
}

form.addEventListener("submit", registerVisitor);
form.addEventListener("reset", () => {
  window.setTimeout(clearValidationErrors, 0);
  notification.hidden = true;
});
refreshButton.addEventListener("click", () => loadVisitors());

[nameInput, emailInput, categoryInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") validateForm();
  });
});

// No se coloca una IP fija: el navegador resuelve /api/visitantes desde su origen.
loadVisitors();
