import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, doc, setDoc, getDoc, where, deleteDoc, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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

// --- VERIFICAÇÃO DE DISPOSITIVO E PERSISTÊNCIA ---
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Se for celular (PWA), guarda a sessão para sempre. Se for PC, desloga ao fechar a aba.
setPersistence(auth, isMobile ? browserLocalPersistence : browserSessionPersistence)
  .catch((error) => console.error("Erro na persistência de auth:", error));

const splashScreen = document.getElementById("splash-screen");

// Persistência Offline
enableIndexedDbPersistence(db).catch((err) => console.warn("Aviso: Persistência offline não suportada.", err.code));

const loading = document.getElementById("loading");
let currentUserUid = null;
let cacheTransacoes = [];
let cacheFuncionarios = [];
let periodoAtual = "mes";
let companyName = "Minha Empresa";
let unsubscribeTransacoes = null;
let unsubscribeFuncionarios = null;

// --- PRIVACY MODE ---
let privacyMode = localStorage.getItem("chevalier_privacy") === "true";
function aplicarPrivacidade() {
  const btnToggleEye = document.getElementById("btn-toggle-eye");
  if (privacyMode) {
    document.body.classList.add("privacy-mode");
    if (btnToggleEye) btnToggleEye.innerHTML = '<i class="ph ph-eye-slash"></i>';
  } else {
    document.body.classList.remove("privacy-mode");
    if (btnToggleEye) btnToggleEye.innerHTML = '<i class="ph ph-eye"></i>';
  }
}
aplicarPrivacidade();

document.getElementById("btn-toggle-eye")?.addEventListener("click", () => {
  vibrarHaptic(10);
  privacyMode = !privacyMode;
  localStorage.setItem("chevalier_privacy", privacyMode);
  aplicarPrivacidade();
});

// Fallback loader
setTimeout(() => { if (loading.classList.contains("visible") && !currentUserUid) toggleLoading(false); }, 4000);

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "flex";
    await carregarDadosSaaS(user.uid);
    
    // Oculta a Splash Screen suavemente DEPOIS de carregar os dados
    setTimeout(() => {
      if(splashScreen) splashScreen.classList.add("hidden");
    }, 600); // 600ms garante que a tela por trás já se desenhou
    
  } else {
    if (unsubscribeTransacoes) unsubscribeTransacoes();
    if (unsubscribeFuncionarios) unsubscribeFuncionarios();
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app-screen").style.display = "none";
    toggleLoading(false);
    
    // Oculta a Splash Screen para revelar a tela de Login
    setTimeout(() => {
      if(splashScreen) splashScreen.classList.add("hidden");
    }, 600);
  }
});

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toggleLoading(true);
  signInWithEmailAndPassword(auth, document.getElementById("email").value, document.getElementById("password").value)
    .catch(() => {
      toggleLoading(false);
      Swal.fire("Erro", "Acesso negado. Verifique e-mail e senha.", "error");
    });
});

document.getElementById("btn-logout").addEventListener("click", () => { signOut(auth); location.reload(); });

// --- LOAD SAAS ---
async function carregarDadosSaaS(uid) {
  currentUserUid = uid;
  toggleLoading(true);
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { empresa: "Minha Empresa" });
      companyName = "Minha Empresa";
    } else {
      companyName = snap.data()?.empresa || "Minha Empresa";
    }
    document.getElementById("nome-empresa-header").innerText = companyName;
    bindChartFilter();
    atualizarListaFuncionarios();
    atualizarDashboard();
  } catch (error) {
    console.error(error);
  } finally {
    toggleLoading(false);
  }
}

// --- DASHBOARD ---
window.filtrarDash = function (tipo) {
  vibrarHaptic(10);
  periodoAtual = tipo;
  document.getElementById("btn-filtro-mes").className = tipo === "mes" ? "filter-chip active" : "filter-chip";
  document.getElementById("btn-filtro-mesant").className = tipo === "mes_ant" ? "filter-chip active" : "filter-chip";
  document.getElementById("btn-filtro-tudo").className = tipo === "tudo" ? "filter-chip active" : "filter-chip";
  renderizarDadosAgrupados();
};

function atualizarDashboard() {
  const hoje = new Date();
  let dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  if (periodoAtual === "tudo") dataInicio = new Date(2020, 0, 1);

  const q = query(collection(db, "users", currentUserUid, "transacoes"), where("data", ">=", dataInicio), orderBy("data", "desc"));
  if (unsubscribeTransacoes) unsubscribeTransacoes();

  unsubscribeTransacoes = onSnapshot(q, (snapshot) => {
    cacheTransacoes = [];
    snapshot.forEach((d) => {
      const t = d.data();
      t.id = d.id;
      t.dataJS = t.data?.toDate ? t.data.toDate() : new Date();
      cacheTransacoes.push(t);
    });
    renderizarDadosAgrupados();
  });
}

function renderizarDadosAgrupados() {
  const hoje = new Date();
  let mesFiltrar = hoje.getMonth();
  let anoFiltrar = hoje.getFullYear();

  if (periodoAtual === "mes_ant") {
    mesFiltrar -= 1;
    if (mesFiltrar < 0) { mesFiltrar = 11; anoFiltrar -= 1; }
  }

  const transacoesFiltradas = cacheTransacoes.filter((t) => {
    if (periodoAtual === "tudo") return true;
    return t.dataJS.getMonth() === mesFiltrar && t.dataJS.getFullYear() === anoFiltrar;
  });

  const agrupado = {};
  let totalGeral = 0, totalVales = 0, totalPags = 0;

  transacoesFiltradas.forEach((t) => {
    const valor = Number(t.valor || 0);
    totalGeral += valor;
    if (t.tipo === "Vale") totalVales += valor; else totalPags += valor;

    if (!agrupado[t.funcionario]) agrupado[t.funcionario] = { nome: t.funcionario, totalVale: 0, totalPag: 0, historico: [] };
    if (t.tipo === "Vale") agrupado[t.funcionario].totalVale += valor; else agrupado[t.funcionario].totalPag += valor;
    agrupado[t.funcionario].historico.push(t);
  });

  animarNumero("dash-total", totalGeral);
  animarNumero("dash-vales", totalVales);
  animarNumero("dash-salarios", totalPags);
  renderChart(totalVales, totalPags);

  const listaEl = document.getElementById("lista-agrupada");
  listaEl.innerHTML = "";
  const nomes = Object.keys(agrupado);

  if (nomes.length === 0) {
    listaEl.innerHTML = `<div class="empty-state">Sem lançamentos no período.</div>`;
    return;
  }

  nomes.forEach((nome) => {
    const dados = agrupado[nome];
    const card = document.createElement("div");
    card.className = "grouped-card";
    card.onclick = () => abrirDetalhesFuncionario(dados);
    card.innerHTML = `
      <div class="gc-info"><h4>${dados.nome}</h4><span>${dados.historico.length} lançamentos</span></div>
      <div style="display:flex; align-items:center;">
        <div class="gc-values">
          ${dados.totalVale > 0 ? `<span class="gc-val-vale">Vales: ${formatMoney(dados.totalVale)}</span>` : ""}
          ${dados.totalPag > 0 ? `<span class="gc-val-pag">Salários: ${formatMoney(dados.totalPag)}</span>` : ""}
        </div>
        <i class="ph-bold ph-caret-right gc-arrow"></i>
      </div>`;
    listaEl.appendChild(card);
  });
}

// --- MODALS & EXCLUSÃO ---
window.abrirDetalhesFuncionario = function (dados) {
  vibrarHaptic(10);
  document.getElementById("detalhe-nome").innerText = dados.nome;
  document.getElementById("detalhe-total-vale").innerText = formatMoney(dados.totalVale);
  document.getElementById("detalhe-total-pag").innerText = formatMoney(dados.totalPag);

  const listaHist = document.getElementById("lista-historico-detalhado");
  listaHist.innerHTML = "";

  dados.historico.forEach((t) => {
    const dia = t.dataJS.getDate().toString().padStart(2, "0");
    const mes = (t.dataJS.getMonth() + 1).toString().padStart(2, "0");
    const isVale = t.tipo === "Vale";
    const icone = isVale ? "ph-trend-down" : "ph-trend-up";
    const cor = isVale ? "val-neg" : "val-pos";

    listaHist.innerHTML += `
      <div class="hist-item">
        <div class="hist-info">
          <div class="hist-icon"><i class="ph ${icone}"></i></div>
          <div class="hist-text">
            <strong>${t.tipo}</strong>
            <small>${dia}/${mes}</small>
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="hist-value ${cor}">${formatMoney(t.valor)}</span>
          <button class="btn-del-hist" onclick="window.deletarTransacao('${t.id}')"><i class="ph-fill ph-trash"></i></button>
        </div>
      </div>`;
  });
  document.getElementById("modal-detalhes").classList.add("open");
};

window.deletarTransacao = async function (id) {
  vibrarHaptic(50);
  const confirm = await Swal.fire({
    title: "Apagar lançamento?",
    text: "O saldo será recalculado.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#333",
    confirmButtonText: "Apagar",
    cancelButtonText: "Cancelar"
  });

  if (confirm.isConfirmed) {
    try {
      await deleteDoc(doc(db, "users", currentUserUid, "transacoes", id));
      Swal.fire({ title: "Excluído!", icon: "success", timer: 1500, showConfirmButton: false });
      document.getElementById("modal-detalhes").classList.remove("open");
    } catch (error) {
      Swal.fire("Erro", "Falha ao excluir.", "error");
    }
  }
};

window.abrirPerfilFuncionario = function (func) {
  vibrarHaptic(10);
  document.getElementById("perfil-nome").innerText = func.nome || "Perfil";
  document.getElementById("perfil-cel").innerText = func.cel ? formatPhone(func.cel) : "—";
  document.getElementById("perfil-rg").innerText = func.rg || "—";
  document.getElementById("perfil-endereco").innerText = func.endereco || "—";
  document.getElementById("perfil-entrada").innerText = func.entrada ? formatDateBR(func.entrada) : "—";

  document.getElementById("btn-perfil-wpp").onclick = () => {
    const cel = (func.cel || "").replace(/\D/g, "");
    if (!cel) return Swal.fire("Ops", "Sem telefone cadastrado.", "warning");
    window.open(`https://wa.me/${cel.startsWith("55") ? "" : "55"}${cel}`, "_blank");
  };
  document.getElementById("btn-perfil-pdf").onclick = () => gerarPDFCadastro(func);
  document.getElementById("modal-perfil").classList.add("open");
};

// --- CRUD FUNCIONÁRIOS ---
function atualizarListaFuncionarios() {
  const q = query(collection(db, "users", currentUserUid, "funcionarios"), orderBy("nome"));
  if (unsubscribeFuncionarios) unsubscribeFuncionarios();

  unsubscribeFuncionarios = onSnapshot(q, (snap) => {
    const sel = document.getElementById("sel-func");
    const lista = document.getElementById("lista-funcionarios");

    sel.innerHTML = `<option value="" disabled selected>Selecione...</option>`;
    lista.innerHTML = "";
    cacheFuncionarios = [];

    if (snap.empty) {
      lista.innerHTML = `<div class="empty-state">Sem colaboradores.</div>`;
      return;
    }

    snap.forEach((d) => {
      const f = d.data();
      f.id = d.id;
      cacheFuncionarios.push(f);
      sel.innerHTML += `<option value="${f.nome}">${f.nome}</option>`;

      const card = document.createElement("div");
      card.className = "grouped-card func-card-item";
      card.onclick = () => window.abrirPerfilFuncionario(f);
      card.innerHTML = `
        <div class="gc-info"><h4>${f.nome}</h4><span>${f.cel ? formatPhone(f.cel) : "Sem telefone"}</span></div>
        <div style="display:flex; align-items:center;"><i class="ph-bold ph-caret-right gc-arrow"></i></div>`;
      lista.appendChild(card);
    });
  });
}

window.filtrarEquipe = function () {
  const termo = document.getElementById("busca-equipe").value.toLowerCase();
  document.querySelectorAll("#lista-funcionarios .func-card-item").forEach(card => {
    const nome = card.querySelector("h4").innerText.toLowerCase();
    card.style.display = nome.includes(termo) ? "flex" : "none";
  });
};

document.getElementById("btn-salvar-transacao").addEventListener("click", async () => {
  const nome = document.getElementById("sel-func").value;
  const tipo = document.querySelector('input[name="tipo"]:checked').value;
  const valor = parseBRLInputToNumber(document.getElementById("inp-valor").value);

  if (!nome || !valor || isNaN(valor) || valor <= 0) {
    vibrarHaptic([50, 50]);
    return Swal.fire("Ops", "Preencha o valor e selecione a pessoa.", "warning");
  }

  toggleLoading(true);
  try {
    await addDoc(collection(db, "users", currentUserUid, "transacoes"), { data: new Date(), funcionario: nome, tipo, valor });
    vibrarHaptic(50);
    const f = cacheFuncionarios.find((x) => x.nome === nome);
    const celLimpo = f && f.cel ? String(f.cel).replace(/\D/g, "") : "";

    document.getElementById("inp-valor").value = "0,00";
    toggleLoading(false);

    if (celLimpo) {
      const msg = `Olá *${nome}*!\n\nAcabei de registrar *${formatMoney(valor)}* no sistema referente a *${tipo === "Vale" ? "um vale/adiantamento" : "pagamento de salário"}*.\n\nAtt,\n*${companyName}*`;
      window.open(`https://wa.me/${celLimpo.startsWith("55") ? "" : "55"}${celLimpo}?text=${encodeURIComponent(msg)}`, "_blank");
      Swal.fire({ title: "Salvo!", icon: "success", timer: 2000, showConfirmButton: false });
    } else {
      Swal.fire("Aviso", "Salvo, mas funcionário não possui WhatsApp.", "info");
    }
  } catch (error) {
    toggleLoading(false);
    Swal.fire("Erro", "Falha ao salvar. Verifique a internet.", "error");
  }
});

document.getElementById("btn-salvar-func").addEventListener("click", async () => {
  const nome = document.getElementById("novo-func-nome").value.trim();
  const cel = document.getElementById("novo-func-cel").value.replace(/\D/g, "");
  const rg = document.getElementById("novo-func-rg").value.trim();
  const endereco = document.getElementById("novo-func-endereco").value.trim();
  const entrada = document.getElementById("novo-func-entrada").value;

  if (!nome) return Swal.fire("Ops", "Nome é obrigatório.", "warning");

  // BUG FIX: Evita que células de telefone vazio batam umas com as outras
  const jaExiste = cacheFuncionarios.some(f => f.nome.toLowerCase() === nome.toLowerCase() || (cel.length > 0 && f.cel === cel));
  if (jaExiste) {
    vibrarHaptic([50, 50]);
    return Swal.fire("Cuidado!", "Pessoa ou WhatsApp já cadastrado.", "warning");
  }

  toggleLoading(true);
  try {
    await addDoc(collection(db, "users", currentUserUid, "funcionarios"), { nome, cel, rg, endereco, entrada });
    vibrarHaptic(50);
    Swal.fire("Sucesso", "Colaborador salvo.", "success");
    document.querySelectorAll("#view-func-novo input").forEach(i => i.value = "");
    window.nav("home");
  } catch (error) {
    Swal.fire("Erro", "Falha ao cadastrar.", "error");
  } finally {
    toggleLoading(false);
  }
});

document.getElementById("btn-salvar-config").addEventListener("click", async () => {
  vibrarHaptic(30);
  const empresa = document.getElementById("config-empresa-nome").value.trim();
  if (!empresa) return Swal.fire("Ops", "Preencha o nome.", "warning");

  toggleLoading(true);
  try {
    await setDoc(doc(db, "users", currentUserUid), { empresa }, { merge: true });
    companyName = empresa;
    document.getElementById("nome-empresa-header").innerText = companyName;
    Swal.fire("Ok", "Configuração atualizada.", "success");
  } catch (error) {
    Swal.fire("Erro", "Falha ao salvar.", "error");
  } finally {
    toggleLoading(false);
  }
});

// --- EXPORTAR CSV ---
window.exportarCSV = function () {
  const hoje = new Date();
  let mesFiltrar = hoje.getMonth();
  let anoFiltrar = hoje.getFullYear();
  if (periodoAtual === "mes_ant") { mesFiltrar -= 1; if (mesFiltrar < 0) { mesFiltrar = 11; anoFiltrar -= 1; } }

  const filtradas = cacheTransacoes.filter((t) => periodoAtual === "tudo" || (t.dataJS.getMonth() === mesFiltrar && t.dataJS.getFullYear() === anoFiltrar));
  if (filtradas.length === 0) return Swal.fire("Ops", "Sem dados para exportar.", "warning");

  let csv = "\uFEFFData;Colaborador;Tipo;Valor (R$)\n";
  filtradas.forEach(t => {
    const d = t.dataJS;
    csv += `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()};${t.funcionario};${t.tipo};${t.valor.toFixed(2).replace('.', ',')}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.setAttribute("download", `Relatorio_${companyName.replace(/\s+/g, '')}.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

// --- NAVEGAÇÃO & UI UTILS ---
window.nav = function (viewId) {
  vibrarHaptic(15);
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  const target = document.getElementById("view-" + viewId);
  if (target) target.classList.add("active");

  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(el => el.classList.remove("active"));

  if (viewId === "home" && navItems[0]) navItems[0].classList.add("active");
  else if (viewId === "lancar" && navItems[1]) navItems[1].classList.add("active");

  if (viewId === "config") document.getElementById("config-empresa-nome").value = companyName || "";
};

window.abrirModal = (id) => { vibrarHaptic(15); document.getElementById(id).classList.add("open"); };
window.fecharModal = (e, id) => { if (e.target.id === id || e.target.closest(".close-icon")) { document.getElementById(id).classList.remove("open"); } };
window.navegarEquipe = (dest) => { document.getElementById("modal-equipe").classList.remove("open"); window.nav(`func-${dest}`); };

const moneyInput = document.getElementById("inp-valor");
if (moneyInput) {
  moneyInput.value = "0,00";
  moneyInput.addEventListener("input", () => moneyInput.value = formatBRLInput(moneyInput.value));
  moneyInput.addEventListener("focus", () => { if (!moneyInput.value) moneyInput.value = "0,00"; });
}

function bindChartFilter() { document.getElementById("sel-chart")?.addEventListener("change", () => renderizarDadosAgrupados()); }
window.vibrarHaptic = function (ms = 50) { if (navigator.vibrate) navigator.vibrate(ms); };
function formatMoney(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function toggleLoading(show) { loading.classList.toggle("visible", show); }
function formatPhone(cel) {
  const d = String(cel || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return cel || "—";
}
function formatDateBR(yyyyMMdd) {
  if (!yyyyMMdd) return "—";
  const [y, m, d] = yyyyMMdd.split("-");
  return `${d}/${m}/${y}`;
}
function formatBRLInput(value) {
  return (parseInt(String(value || "").replace(/\D/g, "") || "0", 10) / 100).toFixed(2).replace(".", ",");
}
function parseBRLInputToNumber(value) {
  return parseInt(String(value || "").replace(/\D/g, "") || "0", 10) / 100;
}

function animarNumero(id, endVal) {
  const el = document.getElementById(id);
  if (!el) return;
  const startVal = 0, duration = 800;
  let start = null;
  window.requestAnimationFrame(function step(timestamp) {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    el.innerText = formatMoney(startVal + (endVal - startVal) * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) window.requestAnimationFrame(step);
  });
}

function gerarPDFCadastro(func) {
  if (!func) return;
  const html = `<html><head><meta charset="utf-8"/><title>Cadastro - ${func.nome || ""}</title>
  <style>body{font-family:Arial,sans-serif;padding:24px;color:#111;}h1{margin:0 0 6px;}small{color:#666;}
  .box{margin-top:16px;padding:14px;border:1px solid #ddd;border-radius:10px;}.row{display:flex;gap:12px;}.col{flex:1;}
  .k{font-size:12px;color:#666;margin-bottom:4px;}.v{font-size:16px;font-weight:700;}</style></head>
  <body><small>${APP_SUBTITLE}</small><h1>${func.nome || "-"}</h1><small>Empresa: ${companyName || "-"}</small>
  <div class="box"><div class="row"><div class="col"><div class="k">Telefone</div><div class="v">${formatPhone(func.cel || "")}</div></div>
  <div class="col"><div class="k">RG</div><div class="v">${func.rg || "-"}</div></div></div><div style="height:10px"></div>
  <div class="row"><div class="col"><div class="k">Endereço</div><div class="v">${func.endereco || "-"}</div></div></div>
  <div style="height:10px"></div><div class="row"><div class="col"><div class="k">Data de Entrada</div><div class="v">${formatDateBR(func.entrada || "")}</div></div></div></div>
  <script>window.onload=()=>{window.print();};</script></body></html>`;
  const w = window.open("", "_blank"); w.document.open(); w.document.write(html); w.document.close();
}

let chart = null;
function renderChart(vales, pags) {
  const ctx = document.getElementById("mainChart")?.getContext("2d");
  if (!ctx) return;
  const scope = document.getElementById("sel-chart")?.value || "todos";
  const v = Number(vales || 0), p = Number(pags || 0);

  if (v === 0 && p === 0) {
    if (chart) { chart.destroy(); chart = null; }
    document.getElementById("chart-empty").classList.remove("hidden");
    return;
  }
  document.getElementById("chart-empty").classList.add("hidden");

  let labels = ["Vales", "Salários"], data = [v, p], colors = ["#52525b", "#10b981"];
  if (scope === "vale") { labels = ["Vales"]; data = [v]; colors = ["#52525b"]; }
  else if (scope === "pag") { labels = ["Salários"]; data = [p]; colors = ["#10b981"]; }

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 8, barThickness: 48 }] },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#a1a1aa", font: { weight: "600" } } }, y: { display: false } }
    }
  });
}