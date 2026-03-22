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
let unsubscribeUsers = null;

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
    if (unsubscribeUsers) unsubscribeUsers();
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
      if (unsubscribeMetrics) unsubscribeMetrics();
      if (unsubscribeUsers) unsubscribeUsers();
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
  const usersRef = collection(db, "users");
  
  // Variáveis para guardar o estado dos dois bancos
  let baseClientes = {};
  let telemetria = {};

  // Função central que cruza os dados e desenha a tela
  function renderizarRadar() {
    let totalBase = 0;
    let totalOnlineAgora = 0;
    let totalVidas = 0;
    let totalOperacoesSaas = 0;
    let empresasHtml = "";
    
    const listaFinal = [];

    // 1. Pega todo mundo que está na base de usuários (cadastrados)
    for (const uid in baseClientes) {
      const cliente = baseClientes[uid];
      const metrica = telemetria[uid] || {}; // Se não tiver métrica, retorna vazio

      listaFinal.push({
        uid: uid,
        empresa: cliente.empresa || "Sem Nome Configurado",
        funcionarios: metrica.total_funcionarios || 0,
        operacoes: metrica.total_operacoes || 0,
        lastActive: metrica.last_active || null
      });
    }

    // 2. Ordena a lista: Quem tá online primeiro, inativos por último
    listaFinal.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));

    // 3. Monta a tabela e os cálculos
    listaFinal.forEach(emp => {
      totalBase++;
      totalVidas += emp.funcionarios;
      totalOperacoesSaas += emp.operacoes;

      // Inteligência de Status
      const agora = new Date();
      let statusClass = "offline";
      let statusText = "Inativo";
      
      if (emp.lastActive) {
        const ultimoAcesso = new Date(emp.lastActive);
        const minutosInativo = (agora - ultimoAcesso) / (1000 * 60);

        if (minutosInativo <= 15) {
          statusClass = "online";
          statusText = "Online";
          totalOnlineAgora++; // Conta pro KPI principal!
        } else if (minutosInativo <= 1440) { // 24 horas = 1440 mins
          statusClass = "away";
          statusText = "Ausente";
        }
      }

      empresasHtml += `
        <tr>
          <td>
            <div class="status-badge ${statusClass}">
              <div class="status-dot"></div>
              ${statusText}
            </div>
          </td>
          <td>
            <div class="empresa-tag">
              <div class="tag-icon"><i class="ph-fill ph-storefront"></i></div>
              <strong>${emp.empresa}</strong>
            </div>
          </td>
          <td><i class="ph-fill ph-users" style="color: var(--text-dim); margin-right: 6px;"></i> ${emp.funcionarios}</td>
          <td><i class="ph-fill ph-swap" style="color: var(--text-dim); margin-right: 6px;"></i> ${emp.operacoes} logs</td>
          <td style="color: ${statusClass === 'offline' ? 'var(--text-dim)' : 'var(--text-main)'};">
            ${formatarDataHora(emp.lastActive)}
          </td>
          <td><span class="uid-cell">${emp.uid.substring(0, 8)}...</span></td>
        </tr>
      `;
    });

    // 4. Atualiza os KPIs
    document.getElementById("dash-base-total").innerText = totalBase;
    document.getElementById("dash-online-agora").innerText = totalOnlineAgora;
    document.getElementById("dash-vidas").innerText = totalVidas;
    document.getElementById("dash-operacoes").innerText = totalOperacoesSaas;
    
    // 5. Atualiza a Tabela
    if (listaFinal.length === 0) {
      document.getElementById("lista-empresas").innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 40px;">Sua base de clientes está vazia.</td></tr>`;
    } else {
      document.getElementById("lista-empresas").innerHTML = empresasHtml;
    }
  }

  // --- LISTENERS SIMULTÂNEOS ---
  
  // A. Escuta todos os usuários criados
  unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
    baseClientes = {};
    snapshot.forEach(doc => {
      baseClientes[doc.id] = { empresa: doc.data().empresa };
    });
    renderizarRadar(); // Atualiza a tela
    toggleLoading(false); // Só tira o loading quando os usuários chegarem
  }, (error) => {
    console.error("Erro Users:", error);
    toggleLoading(false);
    Swal.fire("Acesso Negado", "Sem permissão na base de usuários.", "error");
  });

  // B. Escuta a Telemetria (Quem tá online)
  unsubscribeMetrics = onSnapshot(metricsRef, (snapshot) => {
    telemetria = {};
    snapshot.forEach(doc => {
      telemetria[doc.id] = doc.data();
    });
    renderizarRadar(); // Atualiza a tela
  });
}
