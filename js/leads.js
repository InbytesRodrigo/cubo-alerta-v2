/* ============================================================
   WhatsApp LEADS - Sistema completo
   ------------------------------------------------------------ Painel lateral para detalhe, modal para criar alerta,
   lista sempre visível.
   ============================================================ */

// --- Estado dos Leads ---
let leads = [];
let leadObservations = {}; // { leadId: [observations] }
let activeLeadId = null;

// --- Helpers ---
function saveLeadsData() {
    Storage.saveLeads(leads);
}

function saveLeadObsData() {
    const all = [];
    Object.values(leadObservations).forEach(obsArr => obsArr.forEach(o => all.push(o)));
    localStorage.setItem('lead_obs_data', JSON.stringify(all));
}

// --- Dashboard de Leads ---
function renderLeadsDashboard() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const totalLeads = leads.length;
    const ativos = leads.filter(l => l.status === 'active').length;
    const semSucesso = leads.filter(l => l.status === 'sem_sucesso').length;
    const leadsHoje = leads.filter(l => {
        const d = l.createdAt ? l.createdAt.split('T')[0] : '';
        return d === todayStr;
    }).length;

    const el = (id) => document.getElementById(id);
    if (el('lead-stat-total')) el('lead-stat-total').innerText = totalLeads;
    if (el('lead-stat-ativos')) el('lead-stat-ativos').innerText = ativos;
    if (el('lead-stat-sem-sucesso')) el('lead-stat-sem-sucesso').innerText = semSucesso;
    if (el('lead-stat-hoje')) el('lead-stat-hoje').innerText = leadsHoje;
    if (el('leads-count-badge')) el('leads-count-badge').innerText = ativos;
    if (el('sem-futuro-count-badge')) el('sem-futuro-count-badge').innerText = semSucesso;
}

// ============================================================
//  LISTA DE LEADS (sempre visível)
// ============================================================
function renderLeadsList() {
    const container = document.getElementById('leads-list');
    const empty = document.getElementById('leads-empty');
    if (!container) return;
    container.innerHTML = '';

    const filtered = leads.filter(l => l.status === 'active');
    if (filtered.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    filtered.forEach(lead => {
        const obs = leadObservations[lead.id] || [];
        const initials = lead.name.substring(0, 2).toUpperCase();
        const createdDate = lead.createdAt ? lead.createdAt.split('T')[0] : '';
        const isActive = activeLeadId === lead.id;

        container.innerHTML += `
            <div class="bg-[var(--bg-card)] border ${isActive ? 'border-green-500 ring-1 ring-green-500/30' : 'border-green-500/30 hover:border-green-500/60'} rounded-2xl p-4 flex flex-col transition-all cursor-pointer" onclick="openLeadDetail('${lead.id}')">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-11 h-11 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                        ${initials}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-white text-sm truncate" title="${lead.name}">${lead.name}</h3>
                        <p class="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || 'Sem telefone'}
                        </p>
                    </div>
                    <span class="text-[10px] text-[var(--text-muted)] shrink-0">${createdDate ? formatDateBR(createdDate) : ''}</span>
                </div>

                ${lead.description ? `
                <div class="bg-[var(--bg-input)] p-2.5 rounded-lg text-xs text-gray-300 border border-green-500/10 mb-2 line-clamp-1">
                    ${lead.description}
                </div>` : ''}

                <div class="flex items-center justify-between mt-1">
                    <span class="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                        <i class="ph ph-chat-circle-dots text-green-500"></i> ${obs.length} obs
                    </span>
                    <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                        <button onclick="callLeadAgain('${lead.id}')" class="p-1.5 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-lg text-xs transition-all" title="Chamar novamente">
                            <i class="ph ph-bell-ringing"></i>
                        </button>
                        <button onclick="markLeadAsSemSucesso('${lead.id}')" class="p-1.5 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-lg text-xs transition-all" title="Sem sucesso">
                            <i class="ph ph-x-circle"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

// ============================================================
//  PAINEL LATERAL DE DETALHE (slide-in, não substitui a lista)
// ============================================================
function openLeadDetail(leadId) {
    activeLeadId = leadId;
    renderLeadDetailPanel(leadId);
    renderLeadsList(); // atualiza borda do card selecionado

    const panel = document.getElementById('lead-detail-panel');
    const overlay = document.getElementById('lead-detail-overlay');
    if (panel) panel.classList.remove('translate-x-full');
    if (overlay) overlay.classList.remove('hidden');
}

function closeLeadDetail() {
    activeLeadId = null;
    const panel = document.getElementById('lead-detail-panel');
    const overlay = document.getElementById('lead-detail-overlay');
    if (panel) panel.classList.add('translate-x-full');
    if (overlay) overlay.classList.add('hidden');
    renderLeadsList();
}

function renderLeadDetailPanel(leadId) {
    const content = document.getElementById('lead-detail-content');
    if (!content) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead) { closeLeadDetail(); return; }

    const obs = leadObservations[lead.id] || [];
    const initials = lead.name.substring(0, 2).toUpperCase();
    const createdDate = lead.createdAt ? lead.createdAt.split('T')[0] : '';

    let obsHTML = '';
    if (obs.length === 0) {
        obsHTML = '<div class="text-center text-[var(--text-muted)] text-xs py-6 border border-dashed border-[var(--border-color)] rounded-xl"><i class="ph ph-chat-circle-dots text-xl mb-1 text-gray-600"></i><br>Nenhuma observação</div>';
    } else {
        obs.forEach(o => {
            const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR') : '';
            obsHTML += `
                <div class="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl p-3 flex items-start gap-2 group/obs">
                    <div class="w-7 h-7 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0 mt-0.5">
                        <i class="ph ph-note text-xs"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-300">${o.text}</p>
                        <p class="text-[10px] text-[var(--text-muted)] mt-1">${dateStr}</p>
                    </div>
                    <button onclick="deleteLeadObservationLocal('${lead.id}', '${o.id}')" class="p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover/obs:opacity-100 transition-all shrink-0" title="Excluir">
                        <i class="ph ph-trash text-xs"></i>
                    </button>
                </div>
            `;
        });
    }

    content.innerHTML = `
        <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-white flex items-center gap-2">
                <i class="ph ph-whatsapp-logo text-green-500"></i> Detalhe do Lead
            </h2>
            <button onclick="closeLeadDetail()" class="text-[var(--text-muted)] hover:text-white p-1"><i class="ph ph-x text-xl"></i></button>
        </div>

        <!-- Info do Lead -->
        <div class="bg-[var(--bg-input)] rounded-xl p-4 mb-4">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-white text-base">${lead.name}</h3>
                    <p class="text-xs text-[var(--text-muted)] flex items-center gap-1">
                        <i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || 'Sem telefone'}
                    </p>
                </div>
            </div>
            <p class="text-[10px] text-[var(--text-muted)] mb-2 flex items-center gap-1">
                <i class="ph ph-calendar"></i> Criado em ${createdDate ? formatDateBR(createdDate) : '-'}
            </p>
            ${lead.description ? `<p class="text-sm text-gray-300 bg-[var(--bg-card)] p-3 rounded-lg border border-green-500/10">${lead.description}</p>` : ''}
        </div>

        <!-- Botões de ação -->
        <div class="grid grid-cols-2 gap-2 mb-5">
            <a href="https://wa.me/55${(lead.phone || '').replace(/\D/g, '')}" target="_blank" class="py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5">
                <i class="ph-bold ph-whatsapp-logo"></i> WhatsApp
            </a>
            <button onclick="callLeadAgain('${lead.id}')" class="py-2.5 bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5">
                <i class="ph ph-bell-ringing"></i> Chamar Novamente
            </button>
        </div>
        <button onclick="markLeadAsSemSucesso('${lead.id}')" class="w-full py-2 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5 mb-5">
            <i class="ph ph-x-circle"></i> Marcar como Sem Sucesso
        </button>

        <!-- Observações -->
        <div class="mb-2">
            <h4 class="text-green-500 font-medium text-sm mb-3 flex items-center gap-2">
                <i class="ph ph-chat-circle-dots"></i> Observações (${obs.length})
            </h4>

            <div class="flex gap-2 mb-3">
                <input type="text" id="new-lead-obs-text" placeholder="Nova observação..." class="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 placeholder-[var(--border-color)] transition-colors"
                    onkeydown="if(event.key==='Enter')addLeadObservationLocal('${lead.id}')">
                <button onclick="addLeadObservationLocal('${lead.id}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
                    <i class="ph ph-plus"></i>
                </button>
            </div>

            <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                ${obsHTML}
            </div>
        </div>
    `;
}

// ============================================================
//  MODAL: CHAMAR NOVAMENTE (criar alerta com data/hora)
// ============================================================
function callLeadAgain(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Preenche campos ocultos do modal
    document.getElementById('callagain-lead-id').value = leadId;
    document.getElementById('callagain-lead-name').innerText = lead.name;
    document.getElementById('callagain-lead-phone').innerText = lead.phone || 'Sem telefone';

    // Defaults: daqui 30 min
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('callagain-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('callagain-time').value = `${hh}:${min}`;

    // Abrir modal
    const modal = document.getElementById('callagain-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeCallAgainModal() {
    const modal = document.getElementById('callagain-modal');
    if (modal) modal.classList.add('hidden');
}

function confirmCallAgain() {
    const leadId = document.getElementById('callagain-lead-id').value;
    const lead = leads.find(l => l.id === leadId);
    if (!lead) { closeCallAgainModal(); return; }

    const date = document.getElementById('callagain-date').value;
    const time = document.getElementById('callagain-time').value;

    if (!date || !time) {
        showToast('Escolha data e hora.', 'error');
        return;
    }

    // Criar o alerta diretamente
    const newAlert = {
        id: generateId(),
        name: lead.name,
        phone: lead.phone || '',
        subject: `Retorno para lead: ${lead.name}`,
        date: date,
        time: time,
        category: 'WhatsApp',
        notes: `Lead: ${lead.name} | Tel: ${lead.phone || '-'}\n${lead.description || ''}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completionNotes: ''
    };

    alerts.push(newAlert);
    Storage.saveAlerts(alerts);

    closeCallAgainModal();
    closeLeadDetail();

    showToast(`Alerta criado para ${lead.name} em ${formatDateBR(date)} às ${time}`, 'success');
    renderDashboard();
}

function setCallAgainQuick(minutes) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('callagain-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('callagain-time').value = `${hh}:${min}`;
}

// ============================================================
//  CRIAR LEAD (modal)
// ============================================================
function handleCreateLead(e) {
    e.preventDefault();
    const name = document.getElementById('lead-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();
    const description = document.getElementById('lead-desc').value.trim();

    if (!name) { showToast('Digite o nome do lead.', 'error'); return; }

    const newLead = {
        id: generateId(),
        name, phone, description,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    leads.push(newLead);
    saveLeadsData();
    e.target.reset();
    closeCreateLeadModal();
    showToast('Lead criado com sucesso!', 'success');
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
}

function openCreateLeadModal() {
    const modal = document.getElementById('create-lead-modal');
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => { const el = document.getElementById('lead-name'); if (el) el.focus(); }, 100);
}

function closeCreateLeadModal() {
    const modal = document.getElementById('create-lead-modal');
    if (modal) modal.classList.add('hidden');
}

// ============================================================
//  OBSERVAÇÕES
// ============================================================
function addLeadObservationLocal(leadId) {
    const input = document.getElementById('new-lead-obs-text');
    if (!input) return;
    const text = input.value.trim();
    if (!text) { showToast('Digite uma observação.', 'error'); return; }

    const obs = {
        id: generateId(),
        leadId,
        text,
        createdAt: new Date().toISOString()
    };

    if (!leadObservations[leadId]) leadObservations[leadId] = [];
    leadObservations[leadId].push(obs);
    saveLeadObsData();
    Storage.saveLeadObservation(obs);

    input.value = '';
    showToast('Observação adicionada!', 'success');
    renderLeadDetailPanel(leadId);
    renderLeadsList();
}

function deleteLeadObservationLocal(leadId, obsId) {
    if (!confirm('Excluir esta observação?')) return;
    if (leadObservations[leadId]) {
        leadObservations[leadId] = leadObservations[leadId].filter(o => o.id !== obsId);
    }
    saveLeadObsData();
    Storage.deleteLeadObservation(obsId);
    showToast('Observação excluída.', 'success');
    renderLeadDetailPanel(leadId);
}

// ============================================================
//  SEM SUCESSO
// ============================================================
function markLeadAsSemSucesso(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    if (!confirm(`Marcar "${lead.name}" como SEM SUCESSO?`)) return;

    lead.status = 'sem_sucesso';
    lead.updatedAt = new Date().toISOString();
    saveLeadsData();

    if (activeLeadId === leadId) closeLeadDetail();

    showToast(`"${lead.name}" marcado como sem sucesso.`, 'info');
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
}

function reactivateLead(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    lead.status = 'active';
    lead.updatedAt = new Date().toISOString();
    saveLeadsData();
    showToast(`"${lead.name}" reativado!`, 'success');
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
}

// ============================================================
//  ABA SEM FUTURO
// ============================================================
function renderSemFuturo() {
    const container = document.getElementById('sem-futuro-list');
    const empty = document.getElementById('sem-futuro-empty');
    if (!container) return;
    container.innerHTML = '';

    const semSucesso = leads.filter(l => l.status === 'sem_sucesso')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    if (semSucesso.length === 0) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    semSucesso.forEach(lead => {
        const initials = lead.name.substring(0, 2).toUpperCase();
        const createdDate = lead.createdAt ? lead.createdAt.split('T')[0] : '';
        const updatedDate = lead.updatedAt ? lead.updatedAt.split('T')[0] : '';

        container.innerHTML += `
            <div class="bg-[var(--bg-card)] border border-red-500/20 hover:border-red-500/40 rounded-2xl p-4 flex items-center gap-4 transition-colors">
                <div class="w-10 h-10 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-white text-sm truncate">${lead.name}</h4>
                    <p class="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                        <span class="flex items-center gap-1"><i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || '-'}</span>
                        <span>·</span>
                        <span>${updatedDate ? formatDateBR(updatedDate) : (createdDate ? formatDateBR(createdDate) : '')}</span>
                    </p>
                </div>
                <button onclick="reactivateLead('${lead.id}')" class="py-2 px-3 bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0">
                    <i class="ph ph-arrow-counter-clockwise"></i> Reativar
                </button>
            </div>
        `;
    });
}
