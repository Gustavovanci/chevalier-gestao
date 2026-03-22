import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB287wny9z9gXM9eJNbhCmTuX4OOH1D5hU",
  authDomain: "chevalier-c6960.firebaseapp.com",
  projectId: "chevalier-c6960",
  storageBucket: "chevalier-c6960.firebasestorage.app",
  messagingSenderId: "342031185821",
  appId: "1:342031185821:web:fe3e58b6e93f90bdd12174"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Lista de e-mails autorizados para acessar o painel
const AUTHORIZED_ADMINS = [
  "vancigustavo@gmail.com"
];

// Elements
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loading = document.getElementById("loading");

function toggleLoading(show) {
  if (show) loading.classList.add("visible");
  else loading.classList.remove("visible");
}

let unsubscribeMetrics = null;

// --- AUTH LOGIC ---
setPersistence(auth, browserLocalPersistence);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Validação da Identidade Master
    if (!AUTHORIZED_ADMINS.includes(user.email)) {
      signOut(auth);
      Swal.fire({
        title: "Acesso Protegido",
        text: "Sua conta é padrão. Painel restrito ao Master da NexuFlow.",
        icon: "error"
      });
      return;
    }

    loginScreen.style.display = "none";
    appScreen.style.display = "flex";
    iniciarMonitoramentoGlobal();
  } else {
    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
    if (unsubscribeMetrics) unsubscribeMetrics();
    toggleLoading(false);
  }
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  toggleLoading(true);
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  
  signInWithEmailAndPassword(auth, email, password)
    .catch((err) => {
      toggleLoading(false);
      console.error(err);
      Swal.fire("Bloqueado", "Credencial Master Incorreta ou Inexistente.", "error");
    });
});

document.getElementById("btn-logout").addEventListener("click", () => {
  Swal.fire({
    title: 'Desconectar Sistema?',
    text: "Você será deslogado do Command Center.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#27272a',
    confirmButtonText: 'Sim, sair'
  }).then((result) => {
    if (result.isConfirmed) {
      signOut(auth);
    }
  });
});

// --- TELEMETRY ENGINE ---
function formatarDataHora(isoString) {
  if (!isoString) return "Desconhecido";
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function iniciarMonitoramentoGlobal() {
  toggleLoading(true);

  const metricsRef = collection(db, "nexuflow_metrics");
  
  unsubscribeMetrics = onSnapshot(metricsRef, (snapshot) => {
    let totalEmpresas = 0;
    let totalVidas = 0;
    let empresasHtml = "";

    // Convertemos para array para ordenar pela data de acesso (mais recentes primeiro)
    const empresasAtivas = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      empresasAtivas.push({
        uid: doc.id,
        empresa: data.empresa || "Sem Nome",
        funcionarios: data.total_funcionarios || 0,
        lastActive: data.last_active || null
      });
    });

    // Ordenar por lastActive DESC (Quem entrou mais recentemente aparece em cima)
    empresasAtivas.sort((a, b) => {
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    empresasAtivas.forEach(emp => {
      totalEmpresas++;
      totalVidas += emp.funcionarios;

      empresasHtml += `
        <tr>
          <td>
            <div class="empresa-tag">
              <div class="tag-icon"><i class="ph-fill ph-storefront"></i></div>
              <strong>${emp.empresa}</strong>
            </div>
          </td>
          <td><i class="ph-fill ph-users" style="color: var(--text-dim); margin-right: 6px;"></i> ${emp.funcionarios}</td>
          <td>${formatarDataHora(emp.lastActive)}</td>
          <td><span class="uid-cell">${emp.uid.substring(0, 8)}...</span></td>
        </tr>
      `;
    });

    // Atualiza HUD
    document.getElementById("dash-empresas").innerText = totalEmpresas;
    document.getElementById("dash-vidas").innerText = totalVidas;
    
    // Atualiza Tabela
    if (empresasAtivas.length === 0) {
      document.getElementById("lista-empresas").innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 40px;">Nenhum inquilino detectado pela telemetria.</td></tr>`;
    } else {
      document.getElementById("lista-empresas").innerHTML = empresasHtml;
    }

    toggleLoading(false);
  }, (error) => {
    console.error("Erro ao ler métricas:", error);
    toggleLoading(false);
    Swal.fire("Alerta de Permissão", "Suas regras do Firestore não permitem a leitura da raiz 'nexuflow_metrics'. Autentique-se como admin no Firebase Console.", "warning");
  });
}
