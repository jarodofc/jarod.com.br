
const DB_KEY="mer_documentacao_modular_v1";
const SESSION_KEY="mer_documentacao_session_v1";

const USERS_DEFAULT=[
  {id:"u1",username:"jarod",password:"4922",name:"JAROD",role:"admin",active:true},
  {id:"u2",username:"mer",password:"123456",name:"MER",role:"viewer",active:true}
];

const FINE_ISSUERS=["PRF","DNIT","DETRAN","DER","DAER","DEER","PM","PMRv","BPRv","CET","SMT","SMTT","DMT","DEMUTRAN","AMT","AMTT","SEMOB","STTU","GM","GCM","PREF.","OUTROS"];
const SALE_STEPS=["Vendido","Documentos em conferência","Aguardando ATPV/Procuração","Assinatura reconhecida","Transferência iniciada","Transferência concluída"];
const DOCUMENT_TYPES=["ATPV","CRLV","PROCURAÇÃO","COMUNICADO","CNH"];

let db=loadDb();
let session=loadSession();
let route="dashboard";
let currentVehicleId=null;
let currentVehicleTab="summary";
let currentReportMonth=currentMonth();

document.addEventListener("DOMContentLoaded",init);

function init(){
  bindStaticEvents();
  applySession();
}

function bindStaticEvents(){
  $("#loginForm").addEventListener("submit",login);
  $("#logoutBtn").addEventListener("click",logout);
  $("#quickAddVehicle").addEventListener("click",()=>openVehicleModal());
  $("#mainNav").addEventListener("click",event=>{
    const button=event.target.closest("[data-route]");
    if(!button)return;
    navigate(button.dataset.route);
  });
}

function $(selector){return document.querySelector(selector)}
function $$(selector){return [...document.querySelectorAll(selector)]}
function uid(){return crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(16).slice(2)}
function esc(value=""){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
function normalize(value=""){return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function cleanPlate(value=""){return String(value).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7)}
function money(value){return Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function parseMoney(value){
  if(typeof value==="number")return value;
  const clean=String(value||"").replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");
  return Number(clean)||0;
}
function dateBR(value){
  if(!value)return"-";
  const date=new Date(value+"T12:00:00");
  return Number.isNaN(date.getTime())?"-":date.toLocaleDateString("pt-BR");
}
function currentMonth(){return new Date().toISOString().slice(0,7)}
function monthLabel(value){
  if(!value)return"-";
  const [year,month]=value.split("-");
  return new Date(Number(year),Number(month)-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
}
function download(content,name,type="application/json"){
  const blob=new Blob([content],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function toast(message,type="success"){
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  el.textContent=message;
  $("#toastHost").appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function emptyDb(){
  return{
    users:structuredClone(USERS_DEFAULT),
    vehicles:[],
    settings:{
      company:"MER SEMINOVOS LTDA",
      cnpj:"40.570.918/0001-90",
      email:"contato@merseminovos.com.br",
      phone:"(31) 99952-1996",
      pix:"pix@merseminovos.com.br"
    }
  };
}
function loadDb(){
  try{
    const parsed=JSON.parse(localStorage.getItem(DB_KEY));
    if(!parsed)return emptyDb();
    parsed.users=Array.isArray(parsed.users)?parsed.users:structuredClone(USERS_DEFAULT);
    parsed.vehicles=Array.isArray(parsed.vehicles)?parsed.vehicles:[];
    parsed.settings={...emptyDb().settings,...(parsed.settings||{})};
    return parsed;
  }catch{return emptyDb()}
}
function saveDb(){localStorage.setItem(DB_KEY,JSON.stringify(db))}
function loadSession(){
  try{return JSON.parse(sessionStorage.getItem(SESSION_KEY))}catch{return null}
}
function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}

function login(event){
  event.preventDefault();
  const username=normalize($("#loginUser").value);
  const password=$("#loginPassword").value;
  const user=db.users.find(item=>normalize(item.username)===username&&item.password===password&&item.active!==false);
  if(!user){
    $("#loginError").textContent="Usuário ou senha inválidos.";
    return;
  }
  session={id:user.id,name:user.name,role:user.role};
  saveSession();
  $("#loginError").textContent="";
  applySession();
}
function logout(){
  session=null;
  sessionStorage.removeItem(SESSION_KEY);
  applySession();
}
function applySession(){
  const logged=Boolean(session);
  $("#loginView").classList.toggle("hidden",logged);
  $("#appView").classList.toggle("hidden",!logged);
  document.body.classList.toggle("viewer",logged&&session.role!=="admin");
  if(!logged)return;
  $("#sessionName").textContent=session.name;
  $("#sessionRole").textContent=session.role==="admin"?"Administrador":"Visualização";
  navigate(route);
}
function requireAdmin(){
  if(session?.role==="admin")return true;
  toast("Acesso disponível somente para administrador.","error");
  return false;
}

function navigate(nextRoute){
  route=nextRoute;
  currentVehicleId=null;
  $$(".nav-item").forEach(button=>button.classList.toggle("active",button.dataset.route===route));
  const titles={
    dashboard:["Visão geral","Dashboard"],
    vehicles:["Gestão","Veículos"],
    sales:["Relatórios","Vendas mensais"],
    documents:["Leitura","Extrair documento"],
    import:["Importação","Importar XLS"],
    backup:["Segurança","Backup"],
    users:["Administração","Usuários"],
    settings:["Administração","Configurações"]
  };
  $("#pageEyebrow").textContent=titles[route]?.[0]||"Sistema";
  $("#pageTitle").textContent=titles[route]?.[1]||"Documentação";
  renderRoute();
}

function renderRoute(){
  const views={
    dashboard:renderDashboard,
    vehicles:renderVehicles,
    sales:renderSales,
    documents:renderDocumentExtractor,
    import:renderImport,
    backup:renderBackup,
    users:renderUsers,
    settings:renderSettings
  };
  (views[route]||renderDashboard)();
}

function statusBadge(status){
  const map={
    stock:["stock","Em estoque"],
    sold:["sold","Vendido"],
    pending:["pending","Pendente"],
    canceled:["canceled","Cancelado"]
  };
  const [className,label]=map[status]||map.pending;
  return `<span class="badge ${className}">${label}</span>`;
}

function vehicleDebtTotal(vehicle){
  return (vehicle.fines||[]).reduce((sum,item)=>sum+Number(item.value||0),0)
}
function saleProgress(vehicle){
  if(vehicle.status!=="sold")return 0;
  return Math.round(((Number(vehicle.sale?.step||0)+1)/SALE_STEPS.length)*100);
}
function addHistory(vehicle,action,details=""){
  vehicle.history=Array.isArray(vehicle.history)?vehicle.history:[];
  vehicle.history.unshift({
    id:uid(),
    date:new Date().toISOString(),
    action,
    details,
    user:session?.name||"Sistema"
  });
}
function getVehicle(id){return db.vehicles.find(vehicle=>vehicle.id===id)}

function renderDashboard(){
  const stock=db.vehicles.filter(v=>v.status==="stock");
  const sold=db.vehicles.filter(v=>v.status==="sold");
  const monthSold=sold.filter(v=>(v.sale?.date||"").slice(0,7)===currentMonth());
  const pendingDocs=db.vehicles.filter(v=>{
    const docs=v.documents||{};
    return DOCUMENT_TYPES.some(type=>!docs[type]?.received);
  });
  const debts=db.vehicles.reduce((sum,v)=>sum+vehicleDebtTotal(v),0);

  $("#pageContent").innerHTML=`
    <div class="grid stats-grid">
      ${statCard("Total de veículos",db.vehicles.length,"Todos os registros")}
      ${statCard("Em estoque",stock.length,"Disponíveis")}
      ${statCard("Vendidos no mês",monthSold.length,money(monthSold.reduce((s,v)=>s+Number(v.sale?.value||0),0)))}
      ${statCard("Débitos cadastrados",money(debts),"Multas e outros débitos")}
    </div>

    <div class="grid two-col" style="margin-top:16px">
      <div class="card">
        <div class="card-head">
          <div><p class="eyebrow">Vendas</p><h3>Andamento das transferências</h3></div>
        </div>
        ${sold.length?sold.slice(0,8).map(v=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:7px">
              <strong>${esc(v.model)}</strong><span class="muted">${saleProgress(v)}%</span>
            </div>
            <div class="progress"><span style="width:${saleProgress(v)}%"></span></div>
          </div>
        `).join(""):`<div class="empty">Nenhuma venda cadastrada.</div>`}
      </div>

      <div class="card">
        <div class="card-head">
          <div><p class="eyebrow">Pendências</p><h3>Documentação</h3></div>
          <span class="badge pending">${pendingDocs.length}</span>
        </div>
        ${pendingDocs.length?pendingDocs.slice(0,8).map(v=>`
          <div class="document-row">
            <div><strong>${esc(v.model)}</strong><span>${esc(v.plate)}</span></div>
            <button class="btn secondary small" onclick="openVehicle('${v.id}','documents')">Abrir</button>
          </div>
        `).join(""):`<div class="empty">Nenhuma pendência documental.</div>`}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <div><p class="eyebrow">Movimentações</p><h3>Atividade recente</h3></div>
      </div>
      ${renderGlobalHistory()}
    </div>
  `;
}

function statCard(title,value,description){
  return `<div class="card stat-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><span>${esc(description)}</span></div>`
}

function renderGlobalHistory(){
  const items=db.vehicles.flatMap(vehicle=>(vehicle.history||[]).map(item=>({...item,vehicle})))
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
    .slice(0,12);
  if(!items.length)return`<div class="empty">Nenhuma movimentação registrada.</div>`;
  return `<div class="history-list">${items.map(item=>`
    <div class="history-item">
      <div>
        <strong>${esc(item.action)} — ${esc(item.vehicle.model)}</strong>
        <span>${new Date(item.date).toLocaleString("pt-BR")} • ${esc(item.user)}</span>
      </div>
      <button class="btn secondary small" onclick="openVehicle('${item.vehicle.id}','history')">Abrir</button>
    </div>
  `).join("")}</div>`;
}

function renderVehicles(){
  $("#pageContent").innerHTML=`
    <div class="toolbar">
      <div class="toolbar-left">
        <input id="vehicleSearch" class="search" placeholder="Buscar por modelo, placa ou fornecedor">
        <select id="vehicleStatusFilter">
          <option value="">Todos os status</option>
          <option value="stock">Em estoque</option>
          <option value="sold">Vendidos</option>
          <option value="pending">Pendentes</option>
          <option value="canceled">Cancelados</option>
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn primary admin-only" onclick="openVehicleModal()">Adicionar veículo</button>
      </div>
    </div>
    <div id="vehicleGrid" class="grid card-grid"></div>
  `;
  $("#vehicleSearch").addEventListener("input",renderVehicleCards);
  $("#vehicleStatusFilter").addEventListener("change",renderVehicleCards);
  renderVehicleCards();
}

function renderVehicleCards(){
  const search=normalize($("#vehicleSearch")?.value||"");
  const status=$("#vehicleStatusFilter")?.value||"";
  const list=db.vehicles.filter(vehicle=>{
    const matchesSearch=!search||normalize([vehicle.model,vehicle.plate,vehicle.supplier].join(" ")).includes(search);
    const matchesStatus=!status||vehicle.status===status;
    return matchesSearch&&matchesStatus;
  });
  $("#vehicleGrid").innerHTML=list.length?list.map(vehicle=>`
    <article class="card vehicle-card">
      <div class="card-head">
        <div>
          <p class="plate">${esc(vehicle.plate||"SEM PLACA")}</p>
          <h3>${esc(vehicle.model||"Veículo")}</h3>
        </div>
        ${statusBadge(vehicle.status)}
      </div>
      <div class="vehicle-meta">
        <div><span>Fornecedor</span><strong>${esc(vehicle.supplier||"-")}</strong></div>
        <div><span>Ano/modelo</span><strong>${esc(vehicle.year||"-")}</strong></div>
        <div><span>Débitos</span><strong>${money(vehicleDebtTotal(vehicle))}</strong></div>
        <div><span>Documentos</span><strong>${documentProgress(vehicle)}%</strong></div>
      </div>
      <div class="actions">
        <button class="btn primary" onclick="openVehicle('${vehicle.id}')">Abrir veículo</button>
        <button class="btn secondary admin-only" onclick="openVehicleModal('${vehicle.id}')">Editar rápido</button>
      </div>
    </article>
  `).join(""):`<div class="empty" style="grid-column:1/-1">Nenhum veículo encontrado.</div>`;
}

function documentProgress(vehicle){
  const docs=vehicle.documents||{};
  const received=DOCUMENT_TYPES.filter(type=>docs[type]?.received).length;
  return Math.round((received/DOCUMENT_TYPES.length)*100)
}

window.openVehicle=function(id,tab="summary"){
  currentVehicleId=id;
  currentVehicleTab=tab;
  $("#pageEyebrow").textContent="Veículo";
  $("#pageTitle").textContent=getVehicle(id)?.model||"Veículo";
  renderVehiclePage();
}

function renderVehiclePage(){
  const vehicle=getVehicle(currentVehicleId);
  if(!vehicle){navigate("vehicles");return}
  const tabs=[
    ["summary","Resumo"],
    ["documents","Documentação"],
    ["sale","Venda"],
    ["fines","Multas e débitos"],
    ["history","Histórico"],
    ["xml","XML"],
    ["export","Exportar"]
  ];
  $("#pageContent").innerHTML=`
    <div class="vehicle-hero">
      <div>
        <p class="eyebrow">${esc(vehicle.plate||"SEM PLACA")}</p>
        <h2>${esc(vehicle.model)}</h2>
        <p class="muted">${esc(vehicle.supplier||"Fornecedor não informado")} • ${esc(vehicle.year||"Ano não informado")}</p>
      </div>
      <div class="actions">
        ${statusBadge(vehicle.status)}
        <button class="btn secondary admin-only" onclick="openVehicleModal('${vehicle.id}')">Editar dados</button>
        <button class="btn ghost" onclick="navigate('vehicles')">Voltar</button>
      </div>
    </div>

    <div class="vehicle-shell">
      <aside class="card vehicle-menu">
        ${tabs.map(([id,label])=>`<button class="${currentVehicleTab===id?"active":""}" onclick="switchVehicleTab('${id}')">${label}</button>`).join("")}
      </aside>
      <section id="vehicleTabContent"></section>
    </div>
  `;
  renderVehicleTab();
}

window.switchVehicleTab=function(tab){
  currentVehicleTab=tab;
  renderVehiclePage();
}

function renderVehicleTab(){
  const vehicle=getVehicle(currentVehicleId);
  const target=$("#vehicleTabContent");
  const views={
    summary:renderVehicleSummary,
    documents:renderVehicleDocuments,
    sale:renderVehicleSale,
    fines:renderVehicleFines,
    history:renderVehicleHistory,
    xml:renderVehicleXml,
    export:renderVehicleExport
  };
  target.innerHTML=(views[currentVehicleTab]||renderVehicleSummary)(vehicle);
  bindVehicleTabEvents(vehicle);
}

function renderVehicleSummary(vehicle){
  return`
    <div class="grid two-col">
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Cadastro</p><h3>Dados principais</h3></div></div>
        <div class="vehicle-meta">
          ${detail("Modelo",vehicle.model)}
          ${detail("Placa",vehicle.plate)}
          ${detail("Ano/modelo",vehicle.year)}
          ${detail("Cor",vehicle.color)}
          ${detail("Quilometragem",vehicle.km)}
          ${detail("Fornecedor",vehicle.supplier)}
          ${detail("Status",statusLabel(vehicle.status))}
          ${detail("Procuração",vehicle.powerOfAttorney?"SIM":"NÃO")}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Resumo financeiro</p><h3>Valores</h3></div></div>
        <div class="vehicle-meta">
          ${detail("Valor de venda",money(vehicle.sale?.value||0))}
          ${detail("Total de débitos",money(vehicleDebtTotal(vehicle)))}
          ${detail("Venda líquida",money(Number(vehicle.sale?.value||0)-vehicleDebtTotal(vehicle)))}
          ${detail("Progresso",saleProgress(vehicle)+"%")}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><p class="eyebrow">Observações</p><h3>Anotações administrativas</h3></div></div>
      <textarea id="vehicleNotes" class="admin-only">${esc(vehicle.notes||"")}</textarea>
      <p class="viewer-only">${esc(vehicle.notes||"Nenhuma observação cadastrada.")}</p>
      <div class="actions admin-only" style="margin-top:10px"><button id="saveNotesBtn" class="btn primary">Salvar observações</button></div>
    </div>
  `
}

function detail(label,value){
  return`<div><span>${esc(label)}</span><strong>${esc(value||"-")}</strong></div>`
}

function renderVehicleDocuments(vehicle){
  const docs=vehicle.documents||{};
  return`
    <div class="card">
      <div class="card-head">
        <div><p class="eyebrow">Arquivos</p><h3>Documentação do veículo</h3></div>
        <span class="badge pending">${documentProgress(vehicle)}%</span>
      </div>
      <div class="document-list">
        ${DOCUMENT_TYPES.map(type=>{
          const doc=docs[type]||{};
          return`
            <div class="document-row">
              <div>
                <strong>${type}</strong>
                <span>${doc.received?`Recebido em ${dateBR(doc.date)}`:"Pendente"}</span>
              </div>
              <div class="actions">
                <button class="btn ${doc.received?"success":"secondary"} small admin-only" onclick="toggleDocument('${type}')">${doc.received?"Marcar pendente":"Marcar recebido"}</button>
                <button class="btn secondary small admin-only" onclick="editDocumentNote('${type}')">Observação</button>
              </div>
            </div>
          `
        }).join("")}
      </div>
    </div>
  `
}

window.toggleDocument=function(type){
  if(!requireAdmin())return;
  const vehicle=getVehicle(currentVehicleId);
  vehicle.documents=vehicle.documents||{};
  const current=vehicle.documents[type]||{};
  vehicle.documents[type]={...current,received:!current.received,date:!current.received?new Date().toISOString().slice(0,10):""};
  addHistory(vehicle,current.received?`${type} marcado como pendente`:`${type} recebido`);
  saveDb();renderVehiclePage();toast("Documento atualizado.");
}

window.editDocumentNote=function(type){
  if(!requireAdmin())return;
  const vehicle=getVehicle(currentVehicleId);
  vehicle.documents=vehicle.documents||{};
  const current=vehicle.documents[type]||{};
  const note=prompt(`Observação para ${type}:`,current.note||"");
  if(note===null)return;
  vehicle.documents[type]={...current,note};
  addHistory(vehicle,`Observação alterada em ${type}`,note);
  saveDb();renderVehiclePage();
}

function renderVehicleSale(vehicle){
  const sale=vehicle.sale||{};
  return`
    <form id="saleForm" class="card admin-only">
      <div class="card-head"><div><p class="eyebrow">Negociação</p><h3>Dados da venda</h3></div></div>
      <div class="form-grid">
        <div class="field"><label>Comprador<input name="buyer" value="${esc(sale.buyer||"")}"></label></div>
        <div class="field"><label>Data da venda<input name="date" type="date" value="${esc(sale.date||"")}"></label></div>
        <div class="field"><label>Valor vendido<input name="value" value="${sale.value?money(sale.value):""}"></label></div>
        <div class="field"><label>Financeira<input name="financeCompany" value="${esc(sale.financeCompany||"")}"></label></div>
        <div class="field"><label>Valor financiado<input name="financedValue" value="${sale.financedValue?money(sale.financedValue):""}"></label></div>
        <div class="field"><label>Parcelas<input name="installments" value="${esc(sale.installments||"")}"></label></div>
        <div class="field"><label>PIX / entrada<input name="pixValue" value="${sale.pixValue?money(sale.pixValue):""}"></label></div>
        <div class="field"><label>Etapa<select name="step">${SALE_STEPS.map((label,index)=>`<option value="${index}" ${Number(sale.step||0)===index?"selected":""}>${label}</option>`).join("")}</select></label></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn primary" type="submit">Salvar venda</button>
        <button class="btn secondary" type="button" onclick="setVehicleStatus('sold')">Marcar como vendido</button>
      </div>
    </form>

    <div class="card viewer-only">
      <div class="card-head"><div><p class="eyebrow">Negociação</p><h3>Dados da venda</h3></div></div>
      <div class="vehicle-meta">
        ${detail("Comprador",sale.buyer)}
        ${detail("Data",dateBR(sale.date))}
        ${detail("Valor",money(sale.value||0))}
        ${detail("Etapa",SALE_STEPS[Number(sale.step||0)])}
      </div>
    </div>
  `
}

function renderVehicleFines(vehicle){
  const fines=vehicle.fines||[];
  return`
    <div class="card">
      <div class="card-head">
        <div><p class="eyebrow">Controle financeiro</p><h3>Multas e débitos</h3></div>
        <button id="addFineBtn" class="btn primary admin-only">Adicionar multa</button>
      </div>
      <div id="fineRows">
        ${fines.length?fines.map((fine,index)=>fineRow(fine,index)).join(""):`<div class="empty">Nenhuma multa cadastrada.</div>`}
      </div>
      <div class="total-box"><span>Total de débitos</span><strong>${money(vehicleDebtTotal(vehicle))}</strong></div>
      <div class="actions admin-only" style="margin-top:12px"><button id="saveFinesBtn" class="btn primary">Salvar multas</button></div>
    </div>
  `
}

function fineRow(fine,index){
  return`
    <div class="fine-row" data-fine-index="${index}">
      <select class="fine-issuer">
        <option value="">Órgão emissor</option>
        ${FINE_ISSUERS.map(issuer=>`<option value="${issuer}" ${fine.issuer===issuer?"selected":""}>${issuer}</option>`).join("")}
      </select>
      <input class="fine-code" placeholder="Código da multa" value="${esc(fine.code||"")}">
      <input class="fine-value" placeholder="R$ 0,00" value="${fine.value?money(fine.value):""}">
      <button class="btn danger small admin-only" type="button" onclick="removeFineRow(this)">×</button>
    </div>
  `
}

window.removeFineRow=function(button){button.closest(".fine-row").remove()}

function renderVehicleHistory(vehicle){
  const history=vehicle.history||[];
  return`
    <div class="card">
      <div class="card-head"><div><p class="eyebrow">Auditoria</p><h3>Histórico do veículo</h3></div></div>
      ${history.length?`<div class="history-list">${history.map(item=>`
        <div class="history-item">
          <div><strong>${esc(item.action)}</strong><span>${new Date(item.date).toLocaleString("pt-BR")} • ${esc(item.user)}</span></div>
          <span>${esc(item.details||"")}</span>
        </div>
      `).join("")}</div>`:`<div class="empty">Nenhum histórico registrado.</div>`}
    </div>
  `
}

function renderVehicleXml(vehicle){
  return`
    <div class="grid two-col">
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Importação individual</p><h3>Atualizar por XML</h3></div></div>
        <p class="muted">Importe um XML contendo este veículo. O sistema tentará localizar a placa e atualizar os dados básicos.</p>
        <input id="vehicleXmlFile" class="admin-only" type="file" accept=".xml,text/xml">
        <div class="actions admin-only" style="margin-top:12px"><button id="vehicleXmlImportBtn" class="btn primary">Importar XML</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Dados sincronizados</p><h3>Última leitura</h3></div></div>
        <div class="vehicle-meta">
          ${detail("Origem",vehicle.xml?.source||"-")}
          ${detail("Atualizado em",vehicle.xml?.updatedAt?new Date(vehicle.xml.updatedAt).toLocaleString("pt-BR"):"-")}
          ${detail("Código externo",vehicle.xml?.externalId||"-")}
          ${detail("Fotos",String(vehicle.xml?.photos?.length||0))}
        </div>
      </div>
    </div>
  `
}

function renderVehicleExport(vehicle){
  return`
    <div class="grid three-col">
      <div class="card">
        <p class="eyebrow">JSON</p>
        <h3>Backup individual</h3>
        <p class="muted">Exporta todos os dados deste veículo.</p>
        <button class="btn primary" onclick="exportVehicleJson()">Exportar JSON</button>
      </div>
      <div class="card">
        <p class="eyebrow">Relatório</p>
        <h3>Resumo imprimível</h3>
        <p class="muted">Abre um resumo para impressão ou PDF.</p>
        <button class="btn primary" onclick="printVehicleReport()">Abrir relatório</button>
      </div>
      <div class="card admin-only">
        <p class="eyebrow">Exclusão</p>
        <h3>Remover veículo</h3>
        <p class="muted">Esta ação remove o cadastro completo.</p>
        <button class="btn danger" onclick="deleteCurrentVehicle()">Excluir veículo</button>
      </div>
    </div>
  `
}

function bindVehicleTabEvents(vehicle){
  $("#saveNotesBtn")?.addEventListener("click",()=>{
    vehicle.notes=$("#vehicleNotes").value.trim();
    addHistory(vehicle,"Observações atualizadas");
    saveDb();toast("Observações salvas.");
  });

  $("#saleForm")?.addEventListener("submit",event=>{
    event.preventDefault();
    if(!requireAdmin())return;
    const data=new FormData(event.target);
    vehicle.sale={
      buyer:String(data.get("buyer")||"").trim(),
      date:String(data.get("date")||""),
      value:parseMoney(data.get("value")),
      financeCompany:String(data.get("financeCompany")||"").trim(),
      financedValue:parseMoney(data.get("financedValue")),
      installments:String(data.get("installments")||"").trim(),
      pixValue:parseMoney(data.get("pixValue")),
      step:Number(data.get("step")||0)
    };
    vehicle.status="sold";
    addHistory(vehicle,"Dados da venda atualizados",vehicle.sale.buyer);
    saveDb();renderVehiclePage();toast("Venda salva.");
  });

  $("#addFineBtn")?.addEventListener("click",()=>{
    const host=$("#fineRows");
    if(host.querySelector(".empty"))host.innerHTML="";
    host.insertAdjacentHTML("beforeend",fineRow({issuer:"",code:"",value:0},host.querySelectorAll(".fine-row").length));
  });

  $("#saveFinesBtn")?.addEventListener("click",()=>{
    if(!requireAdmin())return;
    vehicle.fines=[...$$(".fine-row")].map(row=>({
      id:uid(),
      issuer:row.querySelector(".fine-issuer").value,
      code:row.querySelector(".fine-code").value.trim().toUpperCase(),
      value:parseMoney(row.querySelector(".fine-value").value)
    })).filter(item=>item.issuer||item.code||item.value);
    addHistory(vehicle,"Multas e débitos atualizados",money(vehicleDebtTotal(vehicle)));
    saveDb();renderVehiclePage();toast("Multas salvas.");
  });

  $("#vehicleXmlImportBtn")?.addEventListener("click",()=>importVehicleXml(vehicle));
}

window.setVehicleStatus=function(status){
  if(!requireAdmin())return;
  const vehicle=getVehicle(currentVehicleId);
  vehicle.status=status;
  addHistory(vehicle,`Status alterado para ${statusLabel(status)}`);
  saveDb();renderVehiclePage();
}

function statusLabel(status){
  return({stock:"Em estoque",sold:"Vendido",pending:"Pendente",canceled:"Cancelado"})[status]||"Pendente"
}

window.openVehicleModal=function(id=""){
  if(!requireAdmin())return;
  const vehicle=id?getVehicle(id):null;
  const backdrop=document.createElement("div");
  backdrop.className="modal-backdrop";
  backdrop.innerHTML=`
    <form class="modal" id="vehicleForm">
      <div class="modal-head">
        <div><p class="eyebrow">Cadastro</p><h3>${vehicle?"Editar veículo":"Novo veículo"}</h3></div>
        <button type="button" class="close-btn">×</button>
      </div>
      <div class="form-grid">
        <div class="field"><label>Modelo<input name="model" required value="${esc(vehicle?.model||"")}"></label></div>
        <div class="field"><label>Placa<input name="plate" required maxlength="7" value="${esc(vehicle?.plate||"")}"></label></div>
        <div class="field"><label>Ano/modelo<input name="year" value="${esc(vehicle?.year||"")}"></label></div>
        <div class="field"><label>Cor<input name="color" value="${esc(vehicle?.color||"")}"></label></div>
        <div class="field"><label>Quilometragem<input name="km" value="${esc(vehicle?.km||"")}"></label></div>
        <div class="field"><label>Fornecedor<input name="supplier" value="${esc(vehicle?.supplier||"")}"></label></div>
        <div class="field"><label>Status<select name="status">
          ${["stock","sold","pending","canceled"].map(status=>`<option value="${status}" ${vehicle?.status===status?"selected":""}>${statusLabel(status)}</option>`).join("")}
        </select></label></div>
        <div class="field"><label>Procuração<select name="powerOfAttorney">
          <option value="false" ${!vehicle?.powerOfAttorney?"selected":""}>NÃO</option>
          <option value="true" ${vehicle?.powerOfAttorney?"selected":""}>SIM</option>
        </select></label></div>
        <div class="field full"><label>Observações<textarea name="notes">${esc(vehicle?.notes||"")}</textarea></label></div>
      </div>
      <div class="actions" style="margin-top:16px">
        <button class="btn primary" type="submit">Salvar</button>
        <button class="btn secondary" type="button" data-close>Cancelar</button>
      </div>
    </form>
  `;
  document.body.appendChild(backdrop);
  const close=()=>backdrop.remove();
  backdrop.querySelector(".close-btn").onclick=close;
  backdrop.querySelector("[data-close]").onclick=close;
  backdrop.addEventListener("click",event=>{if(event.target===backdrop)close()});
  backdrop.querySelector("#vehicleForm").addEventListener("submit",event=>{
    event.preventDefault();
    const data=new FormData(event.target);
    const plate=cleanPlate(data.get("plate"));
    const duplicate=db.vehicles.some(item=>item.plate===plate&&item.id!==vehicle?.id);
    if(duplicate){toast("Já existe um veículo com essa placa.","error");return}
    const record=vehicle||{
      id:uid(),
      documents:{},
      fines:[],
      sale:{step:0},
      history:[],
      xml:{}
    };
    Object.assign(record,{
      model:String(data.get("model")||"").trim(),
      plate,
      year:String(data.get("year")||"").trim(),
      color:String(data.get("color")||"").trim(),
      km:String(data.get("km")||"").trim(),
      supplier:String(data.get("supplier")||"").trim(),
      status:String(data.get("status")||"stock"),
      powerOfAttorney:String(data.get("powerOfAttorney"))==="true",
      notes:String(data.get("notes")||"").trim()
    });
    addHistory(record,vehicle?"Cadastro do veículo atualizado":"Veículo cadastrado");
    if(!vehicle)db.vehicles.unshift(record);
    saveDb();close();navigate("vehicles");toast("Veículo salvo.");
  });
}

function renderSales(){
  const month=currentReportMonth;
  const sold=db.vehicles.filter(v=>v.status==="sold"&&(v.sale?.date||"").slice(0,7)===month);
  const total=sold.reduce((sum,v)=>sum+Number(v.sale?.value||0),0);
  $("#pageContent").innerHTML=`
    <div class="toolbar">
      <div class="toolbar-left">
        <input id="salesMonth" type="month" value="${month}">
      </div>
      <div class="toolbar-right">
        <button id="exportSalesCsv" class="btn secondary">Exportar CSV</button>
        <button id="printSalesReport" class="btn primary">Imprimir / PDF</button>
      </div>
    </div>
    <div class="grid stats-grid">
      ${statCard("Vendas",sold.length,monthLabel(month))}
      ${statCard("Total vendido",money(total),"Valor bruto")}
      ${statCard("Ticket médio",money(sold.length?total/sold.length:0),"Média por venda")}
      ${statCard("Débitos",money(sold.reduce((s,v)=>s+vehicleDebtTotal(v),0)),"Veículos vendidos")}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Veículo</th><th>Placa</th><th>Comprador</th><th>Data</th><th>Valor</th><th>Etapa</th><th>Ação</th></tr></thead>
          <tbody>
            ${sold.length?sold.map(v=>`<tr>
              <td>${esc(v.model)}</td>
              <td>${esc(v.plate)}</td>
              <td>${esc(v.sale?.buyer||"-")}</td>
              <td>${dateBR(v.sale?.date)}</td>
              <td>${money(v.sale?.value||0)}</td>
              <td>${esc(SALE_STEPS[Number(v.sale?.step||0)])}</td>
              <td><button class="btn secondary small" onclick="openVehicle('${v.id}','sale')">Abrir</button></td>
            </tr>`).join(""):`<tr><td colspan="7"><div class="empty">Nenhuma venda no mês selecionado.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  $("#salesMonth").addEventListener("change",event=>{currentReportMonth=event.target.value;renderSales()});
  $("#exportSalesCsv").addEventListener("click",()=>exportMonthlyCsv(sold,month));
  $("#printSalesReport").addEventListener("click",()=>printMonthlyReport(sold,month));
}

function exportMonthlyCsv(list,month){
  const rows=[
    ["Modelo","Placa","Comprador","Data","Valor","Fornecedor","Etapa","Débitos"],
    ...list.map(v=>[v.model,v.plate,v.sale?.buyer||"",dateBR(v.sale?.date),v.sale?.value||0,v.supplier,SALE_STEPS[Number(v.sale?.step||0)],vehicleDebtTotal(v)])
  ];
  const csv=rows.map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(";")).join("\n");
  download("\ufeff"+csv,`vendas-${month}.csv`,"text/csv;charset=utf-8");
}

function printMonthlyReport(list,month){
  const total=list.reduce((sum,v)=>sum+Number(v.sale?.value||0),0);
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vendas mensais</title>
  <style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ccc;text-align:left}</style></head>
  <body><h1>${esc(db.settings.company)}</h1><h2>Vendas mensais — ${esc(monthLabel(month))}</h2><p>Total: ${money(total)}</p>
  <table><thead><tr><th>Veículo</th><th>Placa</th><th>Comprador</th><th>Data</th><th>Valor</th></tr></thead>
  <tbody>${list.map(v=>`<tr><td>${esc(v.model)}</td><td>${esc(v.plate)}</td><td>${esc(v.sale?.buyer||"-")}</td><td>${dateBR(v.sale?.date)}</td><td>${money(v.sale?.value||0)}</td></tr>`).join("")}</tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open("","_blank");
  win.document.write(html);win.document.close();
}

function renderDocumentExtractor(){
  $("#pageContent").innerHTML=`
    <div class="grid two-col">
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">PDF textual</p><h3>Extrair ATPV ou CRLV</h3></div></div>
        <div class="field"><label>Tipo<select id="extractType"><option value="AUTO">Identificar automaticamente</option><option value="ATPV">ATPV</option><option value="CRLV">CRLV</option></select></label></div>
        <div class="field"><label>Arquivo PDF<input id="extractFile" type="file" accept=".pdf,application/pdf"></label></div>
        <div class="actions" style="margin-top:14px"><button id="extractBtn" class="btn primary">Extrair dados</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Resultado</p><h3>Dados encontrados</h3></div></div>
        <div id="extractResult" class="empty">Selecione um documento.</div>
      </div>
    </div>
  `;
  $("#extractBtn").addEventListener("click",extractDocument);
}

async function extractDocument(){
  const file=$("#extractFile").files[0];
  if(!file){toast("Selecione um PDF.","error");return}
  try{
    if(!window.pdfjsLib)throw new Error("Leitor de PDF indisponível.");
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer(),disableWorker:true}).promise;
    let text="";
    for(let page=1;page<=pdf.numPages;page++){
      const current=await pdf.getPage(page);
      const content=await current.getTextContent();
      text+=" "+content.items.map(item=>item.str).join(" ");
    }
    const data=parseVehicleDocument(text,$("#extractType").value);
    $("#extractResult").className="";
    $("#extractResult").innerHTML=`
      <div class="vehicle-meta">
        ${detail("Documento",data.type)}
        ${detail("Modelo",data.model)}
        ${detail("Placa",data.plate)}
        ${detail("Ano/modelo",data.year)}
        ${detail("Renavam",data.renavam)}
        ${detail("Chassi",data.chassi)}
        ${detail("Cor",data.color)}
        ${detail("Proprietário",data.owner)}
      </div>
      <div class="actions admin-only" style="margin-top:14px">
        <button id="createFromDocument" class="btn primary">Criar/atualizar veículo</button>
      </div>
    `;
    $("#createFromDocument")?.addEventListener("click",()=>createFromExtracted(data));
  }catch(error){toast(error.message||"Falha ao ler documento.","error")}
}

function parseVehicleDocument(text,forcedType="AUTO"){
  const clean=String(text||"").replace(/\s+/g," ").toUpperCase();
  const capture=patterns=>{
    for(const pattern of patterns){const match=clean.match(pattern);if(match?.[1])return match[1].trim()}
    return"";
  };
  const type=forcedType!=="AUTO"?forcedType:(clean.includes("ATPV")?"ATPV":"CRLV");
  return{
    type,
    model:capture([/(?:MARCA\/MODELO|MARCA MODELO)\s*[:\-]?\s*([A-Z0-9 .\/-]{3,60}?)(?=\s+(?:ANO|PLACA|COR|CHASSI|RENAVAM))/]),
    plate:cleanPlate(capture([/(?:PLACA)\s*[:\-]?\s*([A-Z]{3}[0-9A-Z][0-9]{2})/,/\b([A-Z]{3}[0-9][A-Z0-9][0-9]{2})\b/])),
    year:capture([/(?:ANO\/MODELO|ANO FABRICAÇÃO\/MODELO|ANO FABRICACAO\/MODELO)\s*[:\-]?\s*(\d{4}\s*\/\s*\d{4})/]),
    renavam:capture([/(?:RENAVAM|CÓDIGO RENAVAM|CODIGO RENAVAM)\s*[:\-]?\s*(\d{9,11})/]),
    chassi:capture([/(?:CHASSI|VIN)\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/]),
    color:capture([/(?:COR PREDOMINANTE|COR)\s*[:\-]?\s*([A-ZÇÃÕÉÍÓÚ ]{3,20})/]),
    owner:capture([/(?:NOME DO PROPRIETÁRIO|NOME DO PROPRIETARIO|PROPRIETÁRIO|PROPRIETARIO)\s*[:\-]?\s*([A-ZÀ-Ú ]{5,70}?)(?=\s+(?:CPF|CNPJ|PLACA|RENAVAM|CHASSI))/])
  };
}

function createFromExtracted(data){
  if(!requireAdmin())return;
  let vehicle=db.vehicles.find(item=>item.plate&&item.plate===data.plate);
  if(!vehicle){
    vehicle={id:uid(),documents:{},fines:[],sale:{step:0},history:[],xml:{},status:"stock"};
    db.vehicles.unshift(vehicle);
  }
  Object.assign(vehicle,{
    model:data.model||vehicle.model||"VEÍCULO",
    plate:data.plate||vehicle.plate||"",
    year:data.year||vehicle.year||"",
    color:data.color||vehicle.color||""
  });
  vehicle.documents[data.type]={received:true,date:new Date().toISOString().slice(0,10)};
  vehicle.rawDocument={renavam:data.renavam,chassi:data.chassi,owner:data.owner};
  addHistory(vehicle,`${data.type} extraído e aplicado`);
  saveDb();toast("Dados aplicados ao veículo.");openVehicle(vehicle.id,"documents");
}

function renderImport(){
  $("#pageContent").innerHTML=`
    <div class="grid two-col">
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Planilha</p><h3>Importar vendas por XLS</h3></div></div>
        <p class="muted">O sistema lê XLS, XLSX e planilhas HTML salvas como XLS.</p>
        <input id="xlsFile" type="file" accept=".xls,.xlsx,.html,.htm">
        <div class="actions" style="margin-top:14px"><button id="importXlsBtn" class="btn primary admin-only">Importar planilha</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><p class="eyebrow">Resultado</p><h3>Resumo da importação</h3></div></div>
        <div id="importResult" class="empty">Nenhuma planilha importada.</div>
      </div>
    </div>
  `;
  $("#importXlsBtn")?.addEventListener("click",importXls);
}

async function importXls(){
  if(!requireAdmin())return;
  const file=$("#xlsFile").files[0];
  if(!file){toast("Selecione uma planilha.","error");return}
  try{
    let rows=[];
    const text=await file.text();
    if(/^\s*<(?:!doctype|html|table|head|body)/i.test(text)){
      rows=parseHtmlTable(text);
    }else{
      if(!window.XLSX)throw new Error("Leitor XLSX indisponível.");
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      workbook.SheetNames.forEach(sheet=>rows.push(...XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{defval:"",raw:false})));
    }
    let inserted=0,updated=0,ignored=0;
    for(const row of rows){
      const model=pick(row,["modelo","veículo","veiculo","descrição","descricao"]);
      const plate=cleanPlate(pick(row,["placa"]));
      if(!model&&!plate){ignored++;continue}
      let vehicle=db.vehicles.find(v=>plate&&v.plate===plate);
      const existed=Boolean(vehicle);
      if(!vehicle){
        vehicle={id:uid(),documents:{},fines:[],sale:{step:0},history:[],xml:{},status:"stock"};
        db.vehicles.push(vehicle);
      }
      vehicle.model=model||vehicle.model||"VEÍCULO";
      vehicle.plate=plate||vehicle.plate||"";
      vehicle.supplier=pick(row,["fornecedor","origem"])||vehicle.supplier||"";
      const saleDate=excelDate(pick(row,["data da venda","dt venda","dt saída","dt saida","data saída","data saida"]));
      const status=normalize(pick(row,["status","situação","situacao"]));
      const sold=status.includes("vend")||Boolean(saleDate);
      if(sold){
        vehicle.status="sold";
        vehicle.sale={
          ...vehicle.sale,
          buyer:pick(row,["comprador","cliente","nome cliente"])||vehicle.sale?.buyer||"",
          date:saleDate||vehicle.sale?.date||"",
          value:parseMoney(pick(row,["valor vendido","valor de venda","valor venda"]))||vehicle.sale?.value||0
        };
      }
      addHistory(vehicle,"Dados importados por XLS");
      existed?updated++:inserted++;
    }
    saveDb();
    $("#importResult").className="";
    $("#importResult").innerHTML=`
      <div class="vehicle-meta">
        ${detail("Inseridos",String(inserted))}
        ${detail("Atualizados",String(updated))}
        ${detail("Ignorados",String(ignored))}
        ${detail("Linhas lidas",String(rows.length))}
      </div>
    `;
    toast("Planilha importada.");
  }catch(error){toast(error.message||"Falha ao importar.","error")}
}

function parseHtmlTable(text){
  const doc=new DOMParser().parseFromString(text,"text/html");
  const result=[];
  doc.querySelectorAll("table").forEach(table=>{
    let headers=[];
    table.querySelectorAll("tr").forEach(tr=>{
      const cells=[...tr.querySelectorAll("th,td")].map(cell=>cell.textContent.trim());
      if(!cells.some(Boolean))return;
      if(!headers.length){headers=cells;return}
      const row={};headers.forEach((header,index)=>row[header]=cells[index]||"");
      result.push(row);
    });
  });
  return result;
}
function pick(row,aliases){
  const keys=Object.keys(row||{});
  for(const alias of aliases){
    const key=keys.find(item=>normalize(item)===normalize(alias)||normalize(item).includes(normalize(alias)));
    if(key)return String(row[key]||"").trim();
  }
  return"";
}
function excelDate(value){
  if(!value)return"";
  const text=String(value).trim();
  const br=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(br){
    const year=br[3].length===2?"20"+br[3]:br[3];
    return`${year}-${br[2].padStart(2,"0")}-${br[1].padStart(2,"0")}`;
  }
  const date=new Date(text);
  return Number.isNaN(date.getTime())?"":date.toISOString().slice(0,10);
}

function renderBackup(){
  $("#pageContent").innerHTML=`
    <div class="grid three-col">
      <div class="card">
        <p class="eyebrow">Exportar</p>
        <h3>Backup completo</h3>
        <p class="muted">Salva veículos, usuários e configurações.</p>
        <button id="exportBackupBtn" class="btn primary">Exportar JSON</button>
      </div>
      <div class="card admin-only">
        <p class="eyebrow">Importar</p>
        <h3>Restaurar backup</h3>
        <input id="restoreFile" type="file" accept=".json,application/json">
        <button id="restoreBackupBtn" class="btn primary" style="margin-top:12px">Restaurar</button>
      </div>
      <div class="card admin-only">
        <p class="eyebrow">Limpeza</p>
        <h3>Apagar base local</h3>
        <p class="muted">Remove todos os veículos e mantém os usuários padrão.</p>
        <button id="clearDbBtn" class="btn danger">Limpar dados</button>
      </div>
    </div>
  `;
  $("#exportBackupBtn").addEventListener("click",()=>download(JSON.stringify(db,null,2),`backup-documentacao-${new Date().toISOString().slice(0,10)}.json`));
  $("#restoreBackupBtn")?.addEventListener("click",restoreBackup);
  $("#clearDbBtn")?.addEventListener("click",()=>{
    if(!requireAdmin())return;
    if(!confirm("Deseja apagar todos os veículos?"))return;
    db=emptyDb();saveDb();toast("Base limpa.");renderBackup();
  });
}

async function restoreBackup(){
  if(!requireAdmin())return;
  const file=$("#restoreFile").files[0];
  if(!file){toast("Selecione um backup.","error");return}
  try{
    const parsed=JSON.parse(await file.text());
    if(!Array.isArray(parsed.vehicles))throw new Error("Backup inválido.");
    db={...emptyDb(),...parsed,settings:{...emptyDb().settings,...(parsed.settings||{})}};
    saveDb();toast("Backup restaurado.");navigate("dashboard");
  }catch(error){toast(error.message||"Falha ao restaurar.","error")}
}

function renderUsers(){
  if(!requireAdmin()){navigate("dashboard");return}
  $("#pageContent").innerHTML=`
    <div class="toolbar"><div></div><button id="addUserBtn" class="btn primary">Novo usuário</button></div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${db.users.map(user=>`
          <tr>
            <td>${esc(user.name)}</td><td>${esc(user.username)}</td><td>${user.role==="admin"?"Administrador":"Visualização"}</td>
            <td>${user.active!==false?"Ativo":"Inativo"}</td>
            <td><button class="btn secondary small" onclick="editUser('${user.id}')">Editar</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </div>
  `;
  $("#addUserBtn").addEventListener("click",()=>userModal());
}

window.editUser=function(id){userModal(id)}
function userModal(id=""){
  const user=id?db.users.find(item=>item.id===id):null;
  const backdrop=document.createElement("div");
  backdrop.className="modal-backdrop";
  backdrop.innerHTML=`
    <form class="modal" id="userForm">
      <div class="modal-head"><div><p class="eyebrow">Usuário</p><h3>${user?"Editar":"Novo"} usuário</h3></div><button class="close-btn" type="button">×</button></div>
      <div class="form-grid">
        <div class="field"><label>Nome<input name="name" required value="${esc(user?.name||"")}"></label></div>
        <div class="field"><label>Usuário<input name="username" required value="${esc(user?.username||"")}"></label></div>
        <div class="field"><label>Senha<input name="password" required value="${esc(user?.password||"")}"></label></div>
        <div class="field"><label>Perfil<select name="role"><option value="admin" ${user?.role==="admin"?"selected":""}>Administrador</option><option value="viewer" ${user?.role==="viewer"?"selected":""}>Visualização</option></select></label></div>
        <div class="field"><label>Status<select name="active"><option value="true" ${user?.active!==false?"selected":""}>Ativo</option><option value="false" ${user?.active===false?"selected":""}>Inativo</option></select></label></div>
      </div>
      <div class="actions" style="margin-top:16px"><button class="btn primary">Salvar</button></div>
    </form>
  `;
  document.body.appendChild(backdrop);
  const close=()=>backdrop.remove();
  backdrop.querySelector(".close-btn").onclick=close;
  backdrop.querySelector("#userForm").onsubmit=event=>{
    event.preventDefault();
    const data=new FormData(event.target);
    const record=user||{id:uid()};
    Object.assign(record,{
      name:String(data.get("name")).trim(),
      username:String(data.get("username")).trim(),
      password:String(data.get("password")),
      role:String(data.get("role")),
      active:String(data.get("active"))==="true"
    });
    if(!user)db.users.push(record);
    saveDb();close();renderUsers();toast("Usuário salvo.");
  };
}

function renderSettings(){
  if(!requireAdmin()){navigate("dashboard");return}
  const s=db.settings;
  $("#pageContent").innerHTML=`
    <form id="settingsForm" class="card">
      <div class="card-head"><div><p class="eyebrow">Loja</p><h3>Dados da empresa</h3></div></div>
      <div class="form-grid">
        <div class="field"><label>Razão social<input name="company" value="${esc(s.company)}"></label></div>
        <div class="field"><label>CNPJ<input name="cnpj" value="${esc(s.cnpj)}"></label></div>
        <div class="field"><label>E-mail<input name="email" value="${esc(s.email)}"></label></div>
        <div class="field"><label>Telefone<input name="phone" value="${esc(s.phone)}"></label></div>
        <div class="field full"><label>Chave PIX<input name="pix" value="${esc(s.pix)}"></label></div>
      </div>
      <button class="btn primary" style="margin-top:14px">Salvar configurações</button>
    </form>
  `;
  $("#settingsForm").onsubmit=event=>{
    event.preventDefault();
    db.settings=Object.fromEntries(new FormData(event.target));
    saveDb();toast("Configurações salvas.");
  };
}

async function importVehicleXml(vehicle){
  if(!requireAdmin())return;
  const file=$("#vehicleXmlFile").files[0];
  if(!file){toast("Selecione um XML.","error");return}
  try{
    const text=await file.text();
    const doc=new DOMParser().parseFromString(text,"application/xml");
    if(doc.querySelector("parsererror"))throw new Error("XML inválido.");
    const all=[...doc.querySelectorAll("*")];
    const findValue=names=>{
      const normalized=names.map(normalize);
      const node=all.find(item=>normalized.includes(normalize(item.tagName)));
      return node?.textContent?.trim()||"";
    };
    const xmlPlate=cleanPlate(findValue(["placa","plate"]));
    if(xmlPlate&&vehicle.plate&&xmlPlate!==vehicle.plate)throw new Error("A placa do XML não corresponde a este veículo.");
    vehicle.model=findValue(["modelo","model","veiculo"])||vehicle.model;
    vehicle.year=findValue(["ano","anomodelo","ano_modelo"])||vehicle.year;
    vehicle.color=findValue(["cor","color"])||vehicle.color;
    vehicle.km=findValue(["km","quilometragem"])||vehicle.km;
    vehicle.xml={
      source:file.name,
      updatedAt:new Date().toISOString(),
      externalId:findValue(["id","codigo","codigoveiculo"]),
      photos:[...doc.querySelectorAll("foto,url_foto,imagem")].map(node=>node.textContent.trim()).filter(Boolean)
    };
    addHistory(vehicle,"Dados atualizados por XML",file.name);
    saveDb();renderVehiclePage();toast("XML importado.");
  }catch(error){toast(error.message||"Falha ao importar XML.","error")}
}

window.exportVehicleJson=function(){
  const vehicle=getVehicle(currentVehicleId);
  download(JSON.stringify(vehicle,null,2),`veiculo-${vehicle.plate||vehicle.id}.json`);
}
window.printVehicleReport=function(){
  const v=getVehicle(currentVehicleId);
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(v.model)}</title>
  <style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse}td{padding:8px;border:1px solid #ccc}</style></head>
  <body><h1>${esc(v.model)}</h1><p>${esc(v.plate)}</p><table>
  <tr><td>Status</td><td>${esc(statusLabel(v.status))}</td></tr>
  <tr><td>Fornecedor</td><td>${esc(v.supplier||"-")}</td></tr>
  <tr><td>Venda</td><td>${money(v.sale?.value||0)}</td></tr>
  <tr><td>Débitos</td><td>${money(vehicleDebtTotal(v))}</td></tr>
  </table><script>window.onload=()=>window.print()<\/script></body></html>`;
  const win=window.open("","_blank");win.document.write(html);win.document.close();
}
window.deleteCurrentVehicle=function(){
  if(!requireAdmin())return;
  const vehicle=getVehicle(currentVehicleId);
  if(!confirm(`Excluir ${vehicle.model}?`))return;
  db.vehicles=db.vehicles.filter(item=>item.id!==vehicle.id);
  saveDb();navigate("vehicles");toast("Veículo excluído.");
}

window.navigate=navigate;
