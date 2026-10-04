const API = "/api";
let token = localStorage.getItem("campusToken");
let currentUser = JSON.parse(localStorage.getItem("campusUser") || "null");
let allComplaints = [];

const $ = (id) => document.getElementById(id);
const authView = $("authView");
const appView = $("appView");

function showAlert(message, type = "success") {
  const box = $("alertBox");
  box.textContent = message;
  box.className = `alert alert-${type}`;
  box.classList.remove("d-none");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => box.classList.add("d-none"), 4500);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
}

function setAuthMode(mode) {
  const login = mode === "login";
  $("loginForm").classList.toggle("d-none", !login);
  $("registerForm").classList.toggle("d-none", login);
  $("showLogin").className = login ? "btn btn-primary" : "btn btn-outline-primary";
  $("showRegister").className = login ? "btn btn-outline-primary" : "btn btn-primary";
}

function renderShell() {
  const loggedIn = Boolean(token && currentUser);
  authView.classList.toggle("d-none", loggedIn);
  appView.classList.toggle("d-none", !loggedIn);
  $("logoutBtn").classList.toggle("d-none", !loggedIn);
  $("welcome").textContent = loggedIn ? `${currentUser.name} (${currentUser.role})` : "";
  if (!loggedIn) return;
  const isAdmin = currentUser.role === "admin";
  $("dashboardTitle").textContent = isAdmin ? "Admin dashboard" : "Student dashboard";
  $("studentFormCard").classList.toggle("d-none", isAdmin);
  $("adminStats").classList.toggle("d-none", !isAdmin);
  $("studentColumn").classList.toggle("d-none", !isAdmin);
  $("actionColumn").classList.toggle("d-none", !isAdmin);
  $("listTitle").textContent = isAdmin ? "All campus complaints" : "My complaints";
  loadData();
}

function saveSession(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem("campusToken", token);
  localStorage.setItem("campusUser", JSON.stringify(currentUser));
  renderShell();
}

function logout(showMessage = true) {
  token = null;
  currentUser = null;
  allComplaints = [];
  localStorage.removeItem("campusToken");
  localStorage.removeItem("campusUser");
  renderShell();
  if (showMessage) showAlert("You have been logged out.", "info");
}

$("showLogin").addEventListener("click", () => setAuthMode("login"));
$("showRegister").addEventListener("click", () => setAuthMode("register"));
$("logoutBtn").addEventListener("click", () => logout());

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value })
    });
    saveSession(data);
    showAlert("Login successful.");
  } catch (err) { showAlert(err.message, "danger"); }
});

$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("registerName").value,
        email: $("registerEmail").value,
        password: $("registerPassword").value
      })
    });
    saveSession(data);
    showAlert("Account created. You are now logged in.");
  } catch (err) { showAlert(err.message, "danger"); }
});

$("complaintForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/complaints", {
      method: "POST",
      body: JSON.stringify({
        title: $("complaintTitle").value,
        category: $("complaintCategory").value,
        description: $("complaintDescription").value
      })
    });
    $("complaintForm").reset();
    showAlert("Your complaint has been submitted.");
    await loadData();
  } catch (err) { showAlert(err.message, "danger"); }
});

$("refreshBtn").addEventListener("click", loadData);
$("statusFilter").addEventListener("change", renderComplaints);

function statusClass(status) {
  if (status === "Resolved") return "status-resolved";
  if (status === "In Progress") return "status-progress";
  return "status-pending";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderComplaints() {
  const filter = $("statusFilter").value;
  const list = allComplaints.filter(item => filter === "All" || item.status === filter);
  const body = $("complaintsBody");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No complaints found.</td></tr>`;
    return;
  }
  const isAdmin = currentUser.role === "admin";
  body.innerHTML = list.map(item => {
    const date = new Date(item.created_at).toLocaleDateString();
    const action = isAdmin ? `
      <select class="form-select form-select-sm status-update" data-id="${item.id}" aria-label="Update complaint status">
        ${["Pending","In Progress","Resolved"].map(s => `<option ${s === item.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>` : `<span class="text-muted small">—</span>`;
    return `<tr>
      <td>#${item.id}</td>
      <td><div class="fw-semibold">${escapeHtml(item.title)}</div><div class="description-cell">${escapeHtml(item.description)}</div></td>
      <td>${escapeHtml(item.category)}</td>
      <td class="${isAdmin ? "" : "d-none"}">${escapeHtml(item.student_name || "")}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td>${date}</td>
      <td class="${isAdmin ? "" : "d-none"}">${action}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".status-update").forEach(select => {
    select.addEventListener("change", async (event) => {
      const id = event.target.dataset.id;
      try {
        await api(`/complaints/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: event.target.value })
        });
        showAlert(`Complaint #${id} status updated.`);
        await loadData();
      } catch (err) { showAlert(err.message, "danger"); }
    });
  });
}

async function loadData() {
  if (!token || !currentUser) return;
  try {
    const data = await api("/complaints");
    allComplaints = data.complaints;
    renderComplaints();
    if (currentUser.role === "admin") {
      const result = await api("/admin/stats");
      const stats = result.stats;
      $("statTotal").textContent = stats.total || 0;
      $("statPending").textContent = stats.pending || 0;
      $("statProgress").textContent = stats.in_progress || 0;
      $("statResolved").textContent = stats.resolved || 0;
    }
  } catch (err) {
    showAlert(err.message, "danger");
  }
}

setAuthMode("login");
renderShell();
