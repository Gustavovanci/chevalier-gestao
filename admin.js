import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
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
    // Validação da Identidade Master (case-insensitive)
    const normalizedUserEmail = user.email.trim().toLowerCase();
    const isMaster = AUTHORIZED_ADMINS.map(e => e.trim().toLowerCase()).includes(normalizedUserEmail);

    if (!isMaster) {
      signOut(auth);
      Swal.fire({
        title: "Acesso Protegido",
        text: "Sua conta é padrão. Painel restrito ao Master da NexuFlow.",
        icon: "error"
      });
      return;
    }

    // Transição Suave Premium
    loginScreen.classList.remove("active");
    setTimeout(() => {
      appScreen.classList.add("active");
      iniciarMonitoramentoGlobal();
    }, 300); // Aguarda a tela de login sumir para revelar o painel
    
  } else {
    appScreen.classList.remove("active");
    setTimeout(() => {
      loginScreen.classList.add("active");
    }, 300);
    
    if (unsubscribeMetrics) unsubscribeMetrics();
    toggleLoading(false);
  }
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  toggleLoading(true);
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  
  signInWithEmailAndPassword(auth, email, password)
    .catch((err) => {
      // Se não existir o usuário e for o e-mail master, criar automaticamente
      const normalizedEmail = email.toLowerCase();
      const isMaster = AUTHORIZED_ADMINS.map(e => e.trim().toLowerCase()).includes(normalizedEmail);
      
      if (err.code === 'auth/user-not-found' && isMaster) {
        createUserWithEmailAndPassword(auth, email, password)
          .then(() => {
            Swal.fire({
              title: "Sinal Master Reconhecido",
              text: "A credencial da NexuFlow foi ativada na Criptografia Global. Acesso Liberado.",
              icon: "success",
              timer: 3000,
              showConfirmButton: false
            });
          })
          .catch((createErr) => {
            toggleLoading(false);
            console.error("AutoRegistry Error:", createErr);
            Swal.fire("Falha de Criação Mestra", createErr.message, "error");
          });
      } else {
        toggleLoading(false);
        console.error("Login Error:", err);
        Swal.fire("Bloqueado", "Credencial Master Incorreta ou Inexistente.", "error");
      }
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
    let totalOperacoesSaas = 0;
    let empresasHtml = "";
    const empresasAtivas = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      empresasAtivas.push({
        uid: doc.id,
        empresa: data.empresa || "Sem Nome",
        funcionarios: data.total_funcionarios || 0,
        operacoes: data.total_operacoes || 0,
        lastActive: data.last_active || null
      });
    });

    empresasAtivas.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));

    empresasAtivas.forEach(emp => {
      totalEmpresas++;
      totalVidas += emp.funcionarios;
      totalOperacoesSaas += emp.operacoes;

      const hoje = new Date();
      const ultimoAcesso = new Date(emp.lastActive);
      const isHot = (hoje - ultimoAcesso) < (24 * 60 * 60 * 1000);

      empresasHtml += `
        <tr>
          <td>
            <div class="empresa-tag">
              <div class="tag-icon"><i class="ph-fill ph-storefront"></i></div>
              <strong>${emp.empresa}</strong>
              ${isHot ? '<span title="Acessou hoje" style="color:var(--accent-green); font-size:10px;">●</span>' : ''}
            </div>
          </td>
          <td><i class="ph-fill ph-users" style="color: var(--text-dim); margin-right: 6px;"></i> ${emp.funcionarios}</td>
          <td><i class="ph-fill ph-swap" style="color: var(--text-dim); margin-right: 6px;"></i> ${emp.operacoes} logs</td>
          <td>${formatarDataHora(emp.lastActive)}</td>
          <td><span class="uid-cell">${emp.uid.substring(0, 8)}...</span></td>
        </tr>
      `;
    });

    document.getElementById("dash-empresas").innerText = totalEmpresas;
    document.getElementById("dash-vidas").innerText = totalVidas;
    
    if (empresasAtivas.length === 0) {
      document.getElementById("lista-empresas").innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 40px;">Sem dados de telemetria.</td></tr>`;
    } else {
      document.getElementById("lista-empresas").innerHTML = empresasHtml;
    }

    toggleLoading(false);
  }, (error) => {
    console.error("Erro ao ler métricas:", error);
    toggleLoading(false);
    Swal.fire("Acesso Negado", "Você não tem permissão para ler o painel mestre.", "warning");
  });
}
