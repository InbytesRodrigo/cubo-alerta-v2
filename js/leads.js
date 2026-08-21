/* ============================================================
   WhatsApp LEADS - Sistema completo
   ------------------------------------------------------------
   Gerencia leads do WhatsApp: criação, observações múltiplas,
   chamada novamente (cria alerta), sem sucesso (sem futuro).
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

    const elTotal = document.getElementById('lead-stat-total');
    const elAtivos = document.getElementById('lead-stat-ativos');
    const elSemSucesso = document.getElementById('lead-stat-sem-sucesso');
    const elHoje = document.getElementById('lead-stat-hoje');

    if (elTotal) elTotal.innerText = totalLeads;
    if (elAtivos) elAtivos.innerText = ativos;
    if (elSemSucesso) elSemSucesso.innerText = semSucesso;
    if (elHoje) elHoje.innerText = leadsHoje;

    const tabBadge = document.getElementById('leads-count-badge');
    if (tabBadge) tabBadge.innerText = ativos;
    const semFuturoBadge = document.getElementById('sem-futuro-count-badge');
    if (semFuturoBadge) semFuturoBadge.innerText = semSucesso;
}

// --- Lista de Leads (Aba WhatsApp LEAD) ---
function renderLeadsList() {
    const container = document.getElementById('leads-list');
    const empty = document.getElementById('leads-empty');
    if (!container) return;

    // Se está no modo detalhe, renderiza o detalhe
    if (activeLeadId) {
        renderLeadDetail(activeLeadId);
        return;
    }

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
        const obsCount = obs.length;

        container.innerHTML += `
            <div class="bg-[var(--bg-card)] border border-green-500/30 hover:border-green-500/60 rounded-2xl p-4 flex flex-col transition-colors">
                <div class="flex items-center gap-3 mb-3">
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
                <div class="bg-[var(--bg-input)] p-3 rounded-xl text-sm text-gray-300 border border-green-500/10 mb-3 line-clamp-2 flex items-start gap-2">
                    <i class="ph ph-text-align-left text-[var(--text-muted)] mt-0.5 shrink-0"></i>
                    <span class="flex-1" title="${lead.description}">${lead.description}</span>
                </div>` : ''}

                <div class="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-3">
                    <span class="flex items-center gap-1"><i class="ph ph-chat-circle-dots text-green-500"></i> ${obsCount} observação${obsCount !== 1 ? 'ões' : ''}</span>
                </div>

                <div class="mt-auto flex gap-2">
                    <button onclick="openLeadDetail('${lead.id}')" class="flex-1 py-2.5 bg-green-500/10 border border-green-500/40 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1">
                        <i class="ph ph-eye"></i> Detalhes
                    </button>
                    <button onclick="callLeadAgain('${lead.id}')" class="py-2.5 px-3 bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1" title="Chamar novamente (criar alerta)">
                        <i class="ph ph-bell-ringing"></i>
                    </button>
                    <button onclick="markLeadAsSemSucesso('${lead.id}')" class="py-2.5 px-3 bg-red-500/10 border border-red-500/40 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1" title="Sem sucesso">
                        <i class="ph ph-x-circle"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

// --- Detalhe do Lead ---
function renderLeadDetail(leadId) {
    const container = document.getElementById('leads-list');
    const empty = document.getElementById('leads-empty');
    if (!container) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
        activeLeadId = null;
        renderLeadsList();
        return;
    }

    empty.classList.add('hidden');
    const obs = leadObservations[lead.id] || [];
    const initials = lead.name.substring(0, 2).toUpperCase();
    const createdDate = lead.createdAt ? lead.createdAt.split('T')[0] : '';

    let obsHTML = '';
    if (obs.length === 0) {
        obsHTML = '<div class="text-center text-[var(--text-muted)] text-sm py-6 border border-dashed border-[var(--border-color)] rounded-xl"><i class="ph ph-chat-circle-dots text-2xl mb-2 text-gray-600"></i><br>Nenhuma observação ainda.</div>';
    } else {
        obs.forEach(o => {
            const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR') : '';
            obsHTML += `
                <div class="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl p-3 flex items-start gap-3 group/obs">
                    <div class="w-8 h-8 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <i class="ph ph-note text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-300">${o.text}</p>
                        <p class="text-[10px] text-[var(--text-muted)] mt-1">${dateStr}</p>
                    </div>
                    <button onclick="deleteLeadObservationLocal('${lead.id}', '${o.id}')" class="p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover/obs:opacity-100 transition-all shrink-0" title="Excluir">
                        <i class="ph ph-trash text-sm"></i>
                    </button>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <div class="space-y-6 max-w-3xl">
            <button onclick="closeLeadDetail()" class="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors">
                <i class="ph ph-arrow-left"></i> Voltar para lista
            </button>

            <div class="bg-[var(--bg-card)] border border-green-500/30 rounded-2xl p-6">
                <div class="flex items-start gap-4 mb-4">
                    <div class="w-14 h-14 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 flex items-center justify-center font-bold text-lg shrink-0">
                        ${initials}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl font-bold text-white">${lead.name}</h2>
                        <p class="text-sm text-[var(--text-muted)] flex items-center gap-1 mt-1">
                            <i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || 'Sem telefone'}
                        </p>
                        <p class="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                            <i class="ph ph-calendar"></i> Criado em ${createdDate ? formatDateBR(createdDate) : '-'}
                        </p>
                    </div>
                </div>

                ${lead.description ? `
                <div class="bg-[var(--bg-input)] p-4 rounded-xl text-sm text-gray-300 border border-green-500/10 mb-4">
                    <p class="text-xs text-[var(--text-muted)] mb-1 font-medium"><i class="ph ph-text-align-left"></i> Descrição</p>
                    <p>${lead.description}</p>
                </div>` : ''}

                <div class="flex flex-wrap gap-2">
                    <a href="https://wa.me/55${(lead.phone || '').replace(/\D/g, '')}" target="_blank" class="flex-1 min-w-[140px] py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-all flex justify-center items-center gap-2">
                        <i class="ph-bold ph-whatsapp-logo"></i> WhatsApp
                    </a>
                    <button onclick="callLeadAgain('${lead.id}')" class="flex-1 min-w-[140px] py-2.5 bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-sm font-semibold transition-all flex justify-center items-center gap-2">
                        <i class="ph ph-bell-ringing"></i> Chamar Novamente
                    </button>
                    <button onclick="markLeadAsSemSucesso('${lead.id}')" class="py-2.5 px-4 bg-red-500/10 border border-red-500/40 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
                        <i class="ph ph-x-circle"></i> Sem Sucesso
                    </button>
                </div>
            </div>

            <div class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6">
                <h3 class="text-green-500 font-medium mb-4 flex items-center gap-2">
                    <i class="ph ph-chat-circle-dots"></i> Observações (${obs.length})
                </h3>

                <div class="flex gap-2 mb-4">
                    <input type="text" id="new-lead-obs-text" placeholder="Adicionar observação..." class="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500 placeholder-[var(--border-color)] transition-colors"
                        onkeydown="if(event.key==='Enter')addLeadObservationLocal('${lead.id}')">
                    <button onclick="addLeadObservationLocal('${lead.id}')" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 shrink-0">
                        <i class="ph ph-plus"></i>
                    </button>
                </div>

                <div class="space-y-3 max-h-[400px] overflow-y-auto">
                    ${obsHTML}
                </div>
            </div>
        </div>
    `;
}

function openLeadDetail(leadId) {
    activeLeadId = leadId;
    renderLeadDetail(leadId);
}

function closeLeadDetail() {
    activeLeadId = null;
    renderLeadsList();
}

// --- Criar Lead ---
function handleCreateLead(e) {
    e.preventDefault();
    const name = document.getElementById('lead-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();
    const description = document.getElementById('lead-desc').value.trim();

    if (!name) {
        showToast('Digite o nome do lead.', 'error');
        return;
    }

    const newLead = {
        id: generateId(),
        name,
        phone,
        description,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    leads.push(newLead);
    saveLeadsData();

    // Limpar formulário
    e.target.reset();

    // SEMPRE fechar o modal
    closeCreateLeadModal();

    showToast('Lead criado com sucesso!', 'success');

    // Atualizar tudo
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
}

function openCreateLeadModal() {
    const modal = document.getElementById('create-lead-modal');
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => {
        const nameInput = document.getElementById('lead-name');
        if (nameInput) nameInput.focus();
    }, 100);
}

function closeCreateLeadModal() {
    const modal = document.getElementById('create-lead-modal');
    if (modal) modal.classList.add('hidden');
}

// --- Observações ---
function addLeadObservationLocal(leadId) {
    const input = document.getElementById('new-lead-obs-text');
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
        showToast('Digite uma observação.', 'error');
        return;
    }

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
    renderLeadDetail(leadId);
}

function deleteLeadObservationLocal(leadId, obsId) {
    if (!confirm('Excluir esta observação?')) return;

    if (leadObservations[leadId]) {
        leadObservations[leadId] = leadObservations[leadId].filter(o => o.id !== obsId);
    }
    saveLeadObsData();
    Storage.deleteLeadObservation(obsId);

    showToast('Observação excluída.', 'success');
    renderLeadDetail(leadId);
}

// --- Chamar Novamente (cria alerta a partir do lead) ---
function callLeadAgain(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Preenche o formulário de alerta
    document.getElementById('alert-name').value = lead.name;
    document.getElementById('alert-phone').value = lead.phone || '';
    document.getElementById('alert-subject').value = `Retorno para lead: ${lead.name}`;
    document.getElementById('alert-category').value = 'WhatsApp';
    document.getElementById('alert-notes').value = `Lead: ${lead.name} | Tel: ${lead.phone || '-'}\n${lead.description || ''}`;

    // Definir data/hora para daqui 15 min
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('alert-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('alert-time').value = `${hh}:${min}`;

    // Trocar para aba de alertas
    switchTab('todos');

    // Abrir sidebar (funciona tanto mobile quanto desktop)
    const sidebar = document.getElementById('sidebar-form');
    if (sidebar) {
        // Forçar abertura removendo translate-x-full
        sidebar.classList.remove('translate-x-full');
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay && window.innerWidth < 1024) {
            overlay.classList.remove('hidden');
        }
    }

    // Foco no botão de submit após um breve delay
    setTimeout(() => {
        const submitBtn = document.getElementById('submit-alert-btn');
        if (submitBtn) submitBtn.focus();
    }, 300);

    showToast(`Formulário preenchido para ${lead.name} — clique em "Criar Alerta"`, 'info');
}

// --- Marcar como Sem Sucesso ---
function markLeadAsSemSucesso(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    if (!confirm(`Marcar "${lead.name}" como SEM SUCESSO? Ele irá para a aba "Sem Futuro".`)) return;

    lead.status = 'sem_sucesso';
    lead.updatedAt = new Date().toISOString();
    saveLeadsData();

    if (activeLeadId === leadId) {
        activeLeadId = null;
    }

    showToast(`"${lead.name}" marcado como sem sucesso.`, 'info');
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
}

// --- Reativar lead do sem futuro ---
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

// --- Aba Sem Futuro ---
function renderSemFuturo() {
    const container = document.getElementById('sem-futuro-list');
    const empty = document.getElementById('sem-futuro-empty');
    if (!container) return;
    container.innerHTML = '';

    const semSucesso = leads.filter(l => l.status === 'sem_sucesso')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    if (semSucesso.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
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
