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
    if (el('leads-section-count')) el('leads-section-count').innerText = ativos;
    if (el('sem-futuro-count-badge')) el('sem-futuro-count-badge').innerText = semSucesso;
    if (el('sem-futuro-section-count')) el('sem-futuro-section-count').innerText = semSucesso;
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

        // Verificar renda: campo dedicado OU observação
        const hasRenda = lead.renda || obs.some(o => o.text && o.text.toUpperCase().includes('RENDA'));
        const rendaValor = lead.renda || (obs.find(o => o.text && o.text.toUpperCase().includes('RENDA')) || {}).text || '';

        container.innerHTML += `
            <div class="card-green ${isActive ? 'active' : ''} ${hasRenda ? 'has-renda' : ''} p-4 flex flex-col cursor-pointer" onclick="openLeadDetail('${lead.id}')">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-11 h-11 rounded-full ${hasRenda ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-green-500 border-green-500/20'} border flex items-center justify-center font-bold text-sm shrink-0">
                        ${hasRenda ? '<i class="ph ph-money text-lg"></i>' : initials}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-white text-sm truncate" title="${lead.name}">${lead.name}</h3>
                        <p class="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || 'Sem telefone'}
                        </p>
                    </div>
                    <span class="date-badge date-badge--green shrink-0"><i class="ph ph-calendar"></i> ${createdDate ? formatDateBR(createdDate) : ''}</span>
                </div>

                ${hasRenda ? `
                <div class="bg-yellow-500/10 p-2.5 rounded-lg text-xs border border-yellow-500/25 mb-2 flex items-center gap-2">
                    <i class="ph ph-money text-yellow-400"></i>
                    <span class="text-yellow-300 font-semibold">RENDA: ${rendaValor || ' informada'}</span>
                </div>` : ''}

                ${lead.description ? `
                <div class="bg-green-500/8 p-2.5 rounded-lg text-xs text-green-200/80 border border-green-500/20 mb-2 line-clamp-2 flex items-start gap-1.5">
                    <i class="ph ph-text-align-left text-green-500/50 mt-0.5 shrink-0"></i>
                    <span>${lead.description}</span>
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
            const isRenda = o.text && o.text.toUpperCase().includes('RENDA');
            const obsBg = isRenda ? 'bg-yellow-500/10 border-yellow-500/25' : 'bg-[var(--bg-input)] border-[var(--border-color)]';
            const obsIconBg = isRenda ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/10 text-green-500';
            const obsIcon = isRenda ? 'ph-money' : 'ph-note';
            const obsText = isRenda ? `<span class="text-yellow-300 font-bold">${o.text}</span>` : `<span class="text-gray-300">${o.text}</span>`;

            obsHTML += `
                <div class="${obsBg} border rounded-xl p-3 flex items-start gap-2 group/obs">
                    <div class="w-7 h-7 rounded-full ${obsIconBg} flex items-center justify-center shrink-0 mt-0.5">
                        <i class="ph ${obsIcon} text-xs"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm">${obsText}</p>
                        <p class="text-[10px] text-[var(--text-muted)] mt-1">${dateStr}</p>
                    </div>
                    <button onclick="deleteLeadObservationLocal('${lead.id}', '${o.id}')" class="p-1 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover/obs:opacity-100 transition-all shrink-0" title="Excluir">
                        <i class="ph ph-trash text-xs"></i>
                    </button>
                </div>
            `;
        });
    }

    const isSemSucesso = lead.status === 'sem_sucesso';
    const headerIcon = isSemSucesso ? 'ph-prohibit text-red-400' : 'ph-whatsapp-logo text-green-500';
    const headerTitle = isSemSucesso ? 'Lead Sem Futuro' : 'Detalhe do Lead';
    const avatarBg = isSemSucesso ? 'bg-red-500/10 text-red-400 border-red-500/20' : (hasRenda ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-green-500 border-green-500/20');
    const statusBadge = isSemSucesso
        ? '<span class="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 flex items-center gap-1"><i class="ph ph-x-circle"></i> SEM FUTURO</span>'
        : '<span class="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/40 text-green-500 flex items-center gap-1"><i class="ph ph-check-circle"></i> ATIVO</span>';
    const rendaBadge = hasRenda ? `<span class="renda-badge"><i class="ph ph-money"></i> RENDA${rendaValor ? ': ' + rendaValor : ''}</span>` : '';

    content.innerHTML = `
        <div class="flex items-center justify-between mb-5 pb-4 border-b ${isSemSucesso ? 'border-red-500/20' : 'border-green-500/20'}">
            <h2 class="text-lg font-semibold text-white flex items-center gap-2">
                <i class="ph ${headerIcon}"></i> ${headerTitle}
            </h2>
            <button onclick="closeLeadDetail()" class="text-[var(--text-muted)] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"><i class="ph ph-x text-xl"></i></button>
        </div>

        <!-- Info do Lead -->
        <div class="bg-green-500/5 border border-green-500/15 rounded-xl p-4 mb-4">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 rounded-full ${avatarBg} border flex items-center justify-center font-bold text-sm shrink-0">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-white text-base">${lead.name}</h3>
                        ${statusBadge}
                        ${rendaBadge}
                    </div>
                    <p class="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || 'Sem telefone'}
                    </p>
                </div>
            </div>
            <p class="text-[10px] text-[var(--text-muted)] mb-2 flex items-center gap-1">
                <i class="ph ph-calendar"></i> Criado em ${createdDate ? formatDateBR(createdDate) : '-'}
            </p>
            ${lead.renda ? `<div class="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/25 mb-2 flex items-center gap-2"><i class="ph ph-money text-yellow-400"></i><div><p class="text-[10px] text-yellow-400/70 font-medium">Renda</p><p class="text-sm text-yellow-300 font-semibold">${lead.renda}</p></div></div>` : ''}
            ${lead.description ? `<div class="bg-green-500/8 p-3 rounded-lg border border-green-500/20"><p class="text-xs text-green-400/70 font-medium mb-1"><i class="ph ph-text-align-left"></i> Descrição</p><p class="text-sm text-green-100/80">${lead.description}</p></div>` : ''}
        </div>

        <!-- Botões de ação -->
        <div class="grid grid-cols-2 gap-2 mb-3">
            <a href="https://wa.me/55${(lead.phone || '').replace(/\D/g, '')}" target="_blank" class="py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5">
                <i class="ph-bold ph-whatsapp-logo"></i> WhatsApp
            </a>
            ${isSemSucesso
                ? `<button onclick="reactivateLead('${lead.id}')" class="py-2.5 bg-green-500/10 border border-green-500/40 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5">
                    <i class="ph ph-arrow-counter-clockwise"></i> Reativar
                </button>`
                : `<button onclick="callLeadAgain('${lead.id}')" class="py-2.5 bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5">
                    <i class="ph ph-bell-ringing"></i> Chamar Novamente
                </button>`
            }
        </div>
        ${isSemSucesso
            ? `<button onclick="callLeadAgain('${lead.id}')" class="w-full py-2 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5 mb-5">
                <i class="ph ph-bell-ringing"></i> Chamar Novamente
            </button>`
            : `<button onclick="markLeadAsSemSucesso('${lead.id}')" class="w-full py-2 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5 mb-5">
                <i class="ph ph-x-circle"></i> Marcar como Sem Sucesso
            </button>`
        }

        <!-- Observações -->
        <div class="bg-green-500/5 border border-green-500/15 rounded-xl p-4 mb-2">
            <h4 class="text-green-400 font-medium text-sm mb-3 flex items-center gap-2">
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
    const renda = document.getElementById('lead-renda').value.trim();

    if (!name) { showToast('Digite o nome do lead.', 'error'); return; }

    const newLead = {
        id: generateId(),
        name, phone, description, renda,
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
        const obs = leadObservations[lead.id] || [];
        const isActive = activeLeadId === lead.id;

        container.innerHTML += `
            <div class="card-red ${isActive ? 'active' : ''} p-4 flex items-center gap-4 cursor-pointer" onclick="openLeadDetail('${lead.id}')">
                <div class="w-10 h-10 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-white text-sm truncate">${lead.name}</h4>
                    <p class="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                        <span class="flex items-center gap-1"><i class="ph ph-whatsapp-logo text-green-500"></i> ${lead.phone || '-'}</span>
                        <span>·</span>
                        <span>${obs.length} obs</span>
                        <span>·</span>
                        <span class="date-badge date-badge--red"><i class="ph ph-calendar"></i> ${updatedDate ? formatDateBR(updatedDate) : (createdDate ? formatDateBR(createdDate) : '')}</span>
                    </p>
                </div>
                <button onclick="event.stopPropagation(); reactivateLead('${lead.id}')" class="py-2 px-3 bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0">
                    <i class="ph ph-arrow-counter-clockwise"></i> Reativar
                </button>
            </div>
        `;
    });
}
