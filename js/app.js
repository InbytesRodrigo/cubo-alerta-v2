/* ============================================================
   CENTRAL DE ALERTAS - Lógica do aplicativo
   ------------------------------------------------------------
   Responsável por toda a interface e regras de negócio.

   - Dados: NÃO mexer direto em localStorage por aqui.
     Todo acesso a dados passa por `Storage` (ver js/storage.js).
   - Configuração de banco de dados no futuro: trocar apenas o
     js/storage.js, sem alterar este arquivo.
   ============================================================ */

// --- Estado (carregado de forma assíncrona no initApp: Supabase ou localStorage) ---
let alerts = [];
let snoozeOptions = [];
let avatarData = null;
let soundOption = 'call';
let soundFile = null;
let customSoundBuffer = null;
let customSoundSource = null;
let reportFilter = 'todos';
let deferredInstallPrompt = null;
let installBannerDismissed = false;
let applyingPwaUpdate = false;

let activePushAlertId = null;
let isPushActive = false;
let editingAlertId = null;

// WhatsApp Leads: definidos em js/leads.js (antes deste arquivo)

// Audio
let audioCtx = null;
let soundTimer = null;

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- Inicialização ---
async function initApp() {
    // Carrega os dados (Supabase; se não configurado, usa localStorage)
    try {
        const [loadedAlerts, loadedSnoozes, loadedAvatar, loadedSound, loadedSoundFile, loadedLeads, loadedLeadObs] = await Promise.all([
            Storage.getAlerts(),
            Storage.getSnoozeOptions(),
            Storage.getAvatar(),
            Storage.getSoundOption(),
            Storage.getSoundFile(),
            Storage.getLeads(),
            Storage.getAllLeadObservations()
        ]);
        alerts = loadedAlerts || [];
        snoozeOptions = loadedSnoozes || [15, 30, 60, 1440];
        avatarData = loadedAvatar || null;
        soundOption = loadedSound || 'call';
        soundFile = loadedSoundFile || null;
        leads = loadedLeads || [];
        // Index observations by leadId
        leadObservations = {};
        (loadedLeadObs || []).forEach(obs => {
            if (!leadObservations[obs.leadId]) leadObservations[obs.leadId] = [];
            leadObservations[obs.leadId].push(obs);
        });
    } catch (err) {
        console.warn('Falha ao carregar dados:', err);
    }

    applyAvatar();
    renderSnoozeSettings();
    renderSoundSettings();
    renderDashboard();
    renderLeadsDashboard();
    renderLeadsList();
    renderSemFuturo();
    setDefaultDate();
    renderDbStatus();
    decodeCustomSound(soundFile);

    // Fora do modo aplicativo, mantém a opção de instalação acessível.
    if (!isRunningStandalone()) showInstallBanner();

            // Loop de verificação a cada 2 segundos para não perder nada
            setInterval(checkDueAlerts, 2000);

            // Se já tem atrasado assim que abre a tela, espera 3 seg e dispara o push
            setTimeout(checkDueAlerts, 3000);

            // Registra o Service Worker (PWA - offline/instalação)
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                    .then(setupPwaUpdates)
                    .catch((err) => console.warn('Service Worker não registrado:', err));
            }
        }

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-form');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar.classList.contains('translate-x-full')) {
        sidebar.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    }
}

function setDefaultDate() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    document.getElementById('alert-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('alert-time').value = `${hh}:${min}`;
}

function maskPhone(value) {
    value = value.replace(/\D/g, "");
    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
    value = value.replace(/(\d)(\d{4})$/, "$1-$2");
    return value;
}

        // Aplica data/hora no formulário
        function applySchedule(dateObj, hour, minute) {
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const hh = String(hour).padStart(2, '0');
            const min = String(minute).padStart(2, '0');
            document.getElementById('alert-date').value = `${yyyy}-${mm}-${dd}`;
            document.getElementById('alert-time').value = `${hh}:${min}`;
        }

        // AQUI ESTÁ O AGENDAMENTO COM HORA EXATA DO MOMENTO DO CLIQUE
        function setQuickTime(addMinutes) {
            const now = new Date(); // Pega o minuto EXATO de agora
            now.setMinutes(now.getMinutes() + addMinutes);
            applySchedule(now, now.getHours(), now.getMinutes());

            const label = addMinutes >= 60 ? `${addMinutes/60}h` : `${addMinutes} min`;
            showToast(`Agendado p/ daqui ${label}`, 'success');
        }

        // "Amanhã": o alerta SEMPRE chega às 09:00 da manhã
        function setTomorrowMorning() {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            applySchedule(tomorrow, 9, 0);
            showToast('Agendado p/ amanhã às 09:00', 'success');
        }

        // "Finde" (final de semana): o alerta SEMPRE chega na segunda-feira às 09:30
        function setNextMondayMorning() {
            const target = new Date();
            const day = target.getDay(); // 0=domingo, 1=segunda, ..., 6=sábado
            let daysUntilMonday;
            if (day === 0) daysUntilMonday = 1;      // domingo → segunda (amanhã)
            else if (day === 1) daysUntilMonday = 7; // segunda → próxima segunda
            else daysUntilMonday = 8 - day;          // ter..sáb → próxima segunda
            target.setDate(target.getDate() + daysUntilMonday);
            applySchedule(target, 9, 30);
            showToast('Agendado p/ segunda-feira às 09:30', 'success');
        }

function handleCreateAlert(e) {
    e.preventDefault();
    const values = {
        name: document.getElementById('alert-name').value,
        phone: document.getElementById('alert-phone').value,
        subject: document.getElementById('alert-subject').value,
        date: document.getElementById('alert-date').value,
        time: document.getElementById('alert-time').value,
        category: document.getElementById('alert-category').value,
        notes: document.getElementById('alert-notes').value
    };

    // MODO EDIÇÃO: atualiza o alerta existente
    if (editingAlertId) {
        const idx = alerts.findIndex(a => a.id === editingAlertId);
        if (idx !== -1) {
            Object.assign(alerts[idx], values);
            saveData();
            cancelEdit();
            if(window.innerWidth < 1024) toggleSidebar();
            showToast('Alerta atualizado com sucesso!', 'success');
            renderDashboard();
            return;
        }
    }

    // MODO CRIAÇÃO
    const newAlert = {
        id: generateId(),
        ...values,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completionNotes: ''
    };

    alerts.push(newAlert);
    saveData();

    e.target.reset();
    setDefaultDate();

    if(window.innerWidth < 1024) toggleSidebar();

    showToast('Alerta criado e registrado!', 'success');
    renderDashboard();
}

// --- Editar alerta (abre o formulário preenchido) ---
function openEditAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;

    editingAlertId = id;

    document.getElementById('alert-name').value = alert.name || '';
    document.getElementById('alert-phone').value = alert.phone || '';
    document.getElementById('alert-subject').value = alert.subject || '';
    document.getElementById('alert-date').value = alert.date || '';
    document.getElementById('alert-time').value = alert.time || '';
    document.getElementById('alert-category').value = alert.category || 'WhatsApp';
    document.getElementById('alert-notes').value = alert.notes || '';

    document.getElementById('sidebar-form-title').innerText = 'Editar Alerta';
    document.getElementById('submit-alert-btn').innerHTML = '<i class="ph ph-floppy-disk text-lg"></i> Salvar Alterações';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    // Abre o painel lateral (mobile ou desktop)
    const sidebar = document.getElementById('sidebar-form');
    if (sidebar.classList.contains('translate-x-full')) toggleSidebar();

    setTimeout(() => document.getElementById('alert-name').focus(), 100);
    showToast('Editando alerta. Ajuste e clique em Salvar.', 'info');
}

function cancelEdit() {
    editingAlertId = null;
    document.getElementById('sidebar-form-title').innerText = 'Novo Alerta';
    document.getElementById('submit-alert-btn').innerHTML = '<i class="ph ph-plus-circle text-lg"></i> Criar Alerta';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    document.getElementById('new-alert-form').reset();
    setDefaultDate();
}

// --- Excluir alerta ---
function deleteAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    if (!confirm(`Excluir o alerta de "${alert.name}"${alert.time ? ` (${alert.time})` : ''}? Esta ação não pode ser desfeita.`)) return;

    alerts = alerts.filter(a => a.id !== id);
    saveData();

    // Se o alerta estiver na tela de push, fecha
    if (activePushAlertId === id) closePushModal();

    // Se estiver sendo editado, cancela
    if (editingAlertId === id) cancelEdit();

    showToast('Alerta excluído.', 'success');
    renderDashboard();
}

// --- Marcar como "Não Funcionou" ---
function markAsNotWorked(id) {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    if (!confirm(`Marcar o alerta de "${alert.name}" como NÃO FUNCIONOU?`)) return;

    alert.status = 'completed';
    alert.completionNotes = 'Não funcionou - contato sem sucesso';
    alert.completedAt = new Date().toISOString();
    alert.notWorked = true; // flag para diferenciar
    saveData();

    showToast(`Alerta de "${alert.name}" marcado como não funcionou.`, 'info');
    renderDashboard();
}

// --- Renderização do Dashboard ---
        function renderDashboard() {
            const now = new Date();
            // Data local (YYYY-MM-DD) — toISOString() usaria UTC e erraria a seção após ~21h
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let countHoje = 0, countPendentes = 0, countAtrasados = 0, countConcluidos = 0;

    const listAtrasados = document.getElementById('list-atrasados');
    const listAgora = document.getElementById('list-agora');
    const listProximo = document.getElementById('list-proximo');

    listAtrasados.innerHTML = ''; listAgora.innerHTML = ''; listProximo.innerHTML = '';
    let hasAtrasados = false, hasAgora = false;

    alerts.forEach(alert => {
        if (alert.status === 'completed') {
            if (alert.date === todayStr) countConcluidos++;
            return;
        }

        countPendentes++;
        if (alert.date === todayStr) countHoje++;

        const alertDateTime = new Date(`${alert.date}T${alert.time}:00`);
        const isPast = alertDateTime <= now;
        const isToday = alert.date === todayStr;

        const cardHTML = buildAlertCard(alert, isPast ? 'late' : (isToday ? 'agora' : 'proximo'));

        if (isPast) {
            listAtrasados.innerHTML += cardHTML;
            countAtrasados++; hasAtrasados = true;
        } else if (isToday) {
            listAgora.innerHTML += cardHTML;
            hasAgora = true;
        } else {
            listProximo.innerHTML += cardHTML;
        }
    });

    // Atualiza Topo
    document.getElementById('stat-hoje').innerText = countHoje;
    document.getElementById('stat-pendentes').innerText = countPendentes;
    document.getElementById('stat-atrasados').innerText = countAtrasados;
    document.getElementById('stat-concluidos-hoje').innerText = countConcluidos;
    document.getElementById('header-pending-count').innerText = `${countPendentes} alertas`;

    // Mostra/Oculta Secoes
    document.getElementById('section-atrasados').style.display = hasAtrasados ? 'block' : 'none';
    document.getElementById('count-atrasados').innerText = countAtrasados;

    document.getElementById('count-agora').innerText = hasAgora ? listAgora.children.length : '0';
    document.getElementById('empty-agora').style.display = hasAgora ? 'none' : 'block';

    document.getElementById('count-proximo').innerText = listProximo.children.length;

    renderHistorico();
    renderConcluidos();
        }

        // Temas de cor dos cards por seção: atrasado (vermelho), agora (laranja), próximo (azul)
        const CARD_THEMES = {
            late: {
                border: 'border-red-500/60 hover:border-red-500',
                leftBar: 'border-l-red-500',
                avatar: 'bg-red-500/15 text-red-400 border-red-500/30',
                time: 'text-red-400',
                boxBg: 'bg-red-500/8',
                boxBorder: 'border-red-500/30'
            },
            agora: {
                border: 'border-orange-500/50 hover:border-orange-400',
                leftBar: 'border-l-orange-500',
                avatar: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
                time: 'text-orange-400',
                boxBg: 'bg-orange-500/8',
                boxBorder: 'border-orange-500/30'
            },
            proximo: {
                border: 'border-green-500/40 hover:border-green-400',
                leftBar: 'border-l-green-500',
                avatar: 'bg-green-500/10 text-green-400 border-green-500/25',
                time: 'text-green-400',
                boxBg: 'bg-green-500/6',
                boxBorder: 'border-green-500/25'
            }
        };

        function buildAlertCard(alert, themeKey) {
            const theme = CARD_THEMES[themeKey] || CARD_THEMES.agora;
            const initials = alert.name.substring(0, 2).toUpperCase();
            
            // Definição de Cores Baseado na Categoria
            let catIcon = 'ph-tag';
            let catColor = 'text-[var(--text-muted)]';
            if(alert.category === 'WhatsApp') { catIcon = 'ph-whatsapp-logo'; catColor = 'text-green-500'; }
            if(alert.category === 'Ligação') { catIcon = 'ph-phone-call'; catColor = 'text-blue-500'; }
            if(alert.category === 'Reunião') { catIcon = 'ph-calendar-blank'; catColor = 'text-purple-500'; }
            if(alert.category === 'Retorno') { catIcon = 'ph-arrow-u-down-left'; catColor = 'text-yellow-500'; }

            return `
                <div class="bg-[var(--bg-card)] border ${theme.border} border-l-4 ${theme.leftBar} rounded-2xl p-4 flex flex-col transition-colors group relative">
                    <div class="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                        <button onclick="openEditAlert('${alert.id}')" title="Editar alerta" class="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--brand-orange)] hover:border-[var(--brand-orange)]/50 transition-colors"><i class="ph ph-pencil-simple text-sm"></i></button>
                        <button onclick="deleteAlert('${alert.id}')" title="Excluir alerta" class="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/50 transition-colors"><i class="ph ph-trash text-sm"></i></button>
                    </div>
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-3 w-full">
                            <div class="w-12 h-12 rounded-full ${theme.avatar} border flex items-center justify-center font-bold text-sm shrink-0">
                                ${initials}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 pr-16">
                                    <span class="${theme.time} font-bold text-sm shrink-0">${alert.time}</span>
                                    <h3 class="font-medium text-white truncate text-base" title="${alert.name}">${alert.name}</h3>
                                </div>
                                <div class="flex items-center gap-3 mt-0.5">
                                    <p class="text-xs text-[var(--text-muted)] flex items-center gap-1"><i class="ph ph-whatsapp-logo text-green-500"></i> ${alert.phone}</p>
                                    <span class="text-[10px] bg-[var(--bg-input)] border border-[var(--border-color)] px-1.5 py-0.5 rounded flex items-center gap-1 text-[var(--text-muted)]"><i class="ph ${catIcon} ${catColor}"></i> ${alert.category || 'Lead'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="${theme.boxBg} p-3 rounded-xl mb-4 text-sm text-gray-300 line-clamp-2 border ${theme.boxBorder} flex items-start gap-2 h-14">
                        <i class="ph ph-text-align-left ${theme.time} mt-0.5 opacity-50"></i> 
                        <span class="flex-1" title="${alert.subject}">${alert.subject}</span>
                    </div>

                    <div class="mt-auto flex gap-2">
                        <button onclick="manualSnooze('${alert.id}', 15)" class="flex-1 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] hover:bg-[var(--border-color)] rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-white transition-colors flex justify-center items-center gap-1"><i class="ph ph-clock"></i> Adiar</button>
                        <a href="https://wa.me/55${alert.phone.replace(/\D/g,'')}" target="_blank" class="flex-1 py-2 bg-transparent border border-green-500/50 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1 group/btn"><i class="ph-bold ph-whatsapp-logo group-hover/btn:scale-110 transition-transform"></i> Falar</a>
                        <button onclick="markAsNotWorked('${alert.id}')" class="py-2 px-2.5 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-xs font-medium transition-all flex justify-center items-center gap-1" title="Não funcionou">
                            <i class="ph ph-x-circle"></i>
                        </button>
                    </div>
                </div>
            `;
        }

// --- SISTEMA DE PUSH ININTERRUPTO ---
function checkDueAlerts() {
    if(isPushActive) return;

    const now = new Date();
    const dueAlert = alerts.find(a => {
        if(a.status !== 'pending') return false;
        const alertDate = new Date(`${a.date}T${a.time}:00`);
        return now >= alertDate;
    });

    if (dueAlert) triggerPush(dueAlert);
}

        // --- SOM DO ALERTA ---
        const SOUND_OPTIONS = [
            { id: 'call',          label: 'Chamada (padrão)', desc: 'Toque de ligação de rede social', icon: 'ph-phone-call' },
            { id: 'beep',          label: 'Alarme',            desc: 'Bipe contínuo agudo',            icon: 'ph-alarm' },
            { id: 'notification',  label: 'Notificação',       desc: 'Toque suave',                    icon: 'ph-bell' },
            { id: 'none',          label: 'Silencioso',        desc: 'Sem som',                        icon: 'ph-bell-slash' }
        ];

        function ensureAudioCtx() {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            if (!audioCtx) audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            return audioCtx;
        }

        function playTone(freq, startTime, duration, volume, type) {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
            gain.gain.setValueAtTime(volume, startTime + duration - 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.05);
        }

        // Toca um ciclo completo do som escolhido (para teste ou quando dispara)
        function playSoundCycle() {
            const ctx = ensureAudioCtx();
            if (!ctx || soundOption === 'none') return;
            const t = ctx.currentTime;

            if (soundOption === 'custom') {
                if (customSoundBuffer) {
                    if (customSoundSource) { try { customSoundSource.stop(); } catch (e) {} }
                    const src = ctx.createBufferSource();
                    src.buffer = customSoundBuffer;
                    src.connect(ctx.destination);
                    src.start();
                    customSoundSource = src;
                }
                return;
            }

            if (soundOption === 'call') {
                // "Trim-trim" de chamada (como ligação de rede social)
                playTone(780, t, 0.38, 0.16, 'sine');
                playTone(1560, t, 0.38, 0.045, 'sine'); // harmônico dá o timbre de telefone
                playTone(780, t + 0.58, 0.38, 0.16, 'sine');
                playTone(1560, t + 0.58, 0.38, 0.045, 'sine');
            } else if (soundOption === 'beep') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(600, t);
                osc.frequency.exponentialRampToValueAtTime(300, t + 0.2);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.25);
            } else if (soundOption === 'notification') {
                playTone(880, t, 0.3, 0.14, 'triangle');
                playTone(1320, t + 0.12, 0.25, 0.07, 'sine');
            }
        }

        function playAlertSound() {
            if (soundTimer) return;
            if (soundOption === 'none') return;
            const ctx = ensureAudioCtx();
            if (!ctx) return;

            // Repete o ciclo até o usuário responder
            playSoundCycle();
            soundTimer = setInterval(playSoundCycle, 2400);
        }

        function stopAlertSound() {
            if (soundTimer) {
                clearInterval(soundTimer);
                soundTimer = null;
            }
            if (customSoundSource) {
                try { customSoundSource.stop(); } catch (e) {}
                customSoundSource = null;
            }
        }

        function testAlertSound() {
            stopAlertSound();
            playSoundCycle();
        }

        // Decodifica o arquivo de som personalizado para tocar pelo Web Audio (funciona no mobile)
        async function decodeCustomSound(dataUrl) {
            customSoundBuffer = null;
            if (!dataUrl) return;
            const ctx = ensureAudioCtx();
            if (!ctx) return;
            try {
                const res = await fetch(dataUrl);
                const arrayBuf = await res.arrayBuffer();
                customSoundBuffer = await ctx.decodeAudioData(arrayBuf);
            } catch (err) {
                console.warn('Falha ao decodificar o som personalizado:', err);
                customSoundBuffer = null;
            }
        }

        function handleSoundUpload(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            if (!/^audio\//.test(file.type)) {
                showToast('Envie um arquivo de áudio (MP3, WAV, M4A ou OGG).', 'error');
                return;
            }
            if (file.size > 1024 * 1024) {
                showToast('Arquivo muito grande. Use um som curto (até 1 MB).', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async function (e) {
                soundFile = e.target.result;
                Storage.saveSoundFile(soundFile);
                await decodeCustomSound(soundFile);
                soundOption = 'custom';
                Storage.saveSoundOption('custom');
                renderSoundSettings();
                if (customSoundBuffer) {
                    showToast('Som personalizado salvo!', 'success');
                    testAlertSound();
                } else {
                    showToast('Som salvo, mas não foi possível reproduzi-lo neste navegador.', 'error');
                }
            };
            reader.readAsDataURL(file);
        }

        function removeCustomSound() {
            soundFile = null;
            customSoundBuffer = null;
            Storage.saveSoundFile(null);
            if (soundOption === 'custom') {
                soundOption = 'call';
                Storage.saveSoundOption('call');
            }
            renderSoundSettings();
            showToast('Som personalizado removido.', 'info');
        }

        function renderSoundSettings() {
            const container = document.getElementById('sound-options');
            if (!container) return;
            container.innerHTML = '';

            const options = [...SOUND_OPTIONS];
            if (soundFile) {
                options.push({ id: 'custom', label: 'Som personalizado', desc: 'O arquivo que você enviou', icon: 'ph-music-notes' });
            }

            options.forEach(opt => {
                const active = soundOption === opt.id;
                container.innerHTML += `
                    <label class="flex items-center gap-3 cursor-pointer p-4 border rounded-xl transition-colors ${active ? 'border-[var(--brand-orange)] bg-[var(--brand-orange)]/5' : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--brand-orange)]'}">
                        <input type="radio" name="sound" value="${opt.id}" ${active ? 'checked' : ''} onchange="setSoundOption('${opt.id}')" class="accent-[var(--brand-orange)] w-4 h-4 shrink-0">
                        <i class="ph ${opt.icon} text-lg ${active ? 'text-[var(--brand-orange)]' : 'text-[var(--text-muted)]'}"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-white">${opt.label}</p>
                            <p class="text-xs text-[var(--text-muted)]">${opt.desc}</p>
                        </div>
                    </label>`;
            });

            container.innerHTML += `
                <label class="flex items-center gap-3 cursor-pointer p-4 border border-dashed border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--brand-orange)] rounded-xl transition-colors">
                    <input type="file" accept="audio/*" class="hidden" onchange="handleSoundUpload(event)">
                    <i class="ph ph-upload-simple text-lg text-[var(--text-muted)]"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-white">${soundFile ? 'Trocar som personalizado' : 'Enviar um som meu'}</p>
                        <p class="text-xs text-[var(--text-muted)]">MP3, WAV, M4A ou OGG · curto e até 1 MB</p>
                    </div>
                </label>`;

            if (soundFile) {
                container.innerHTML += `
                    <button onclick="removeCustomSound()" class="sm:col-span-2 flex items-center justify-center gap-2 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 bg-red-500/5 rounded-xl py-2 px-3 transition-colors">
                        <i class="ph ph-trash"></i> Remover som personalizado
                    </button>`;
            }
        }

        function setSoundOption(id) {
            soundOption = id;
            Storage.saveSoundOption(id);
            renderSoundSettings();
            showToast(id === 'none' ? 'Alerta silencioso.' : 'Som do alerta atualizado.', 'success');
        }

        function renderDbStatus() {
            const el = document.getElementById('db-status');
            const banner = document.getElementById('db-warning');
            const bannerText = document.getElementById('db-warning-text');
            const info = Storage.statusInfo();

            // Card de status nas Configurações
            if (el) {
                if (info.mode === 'supabase') {
                    el.innerHTML = info.lastSyncError === 'missing-table'
                        ? `<span class="text-red-400 flex items-center gap-1"><i class="ph-bold ph-warning-circle"></i> Supabase conectado, mas as tabelas não existem — rode o <code class="text-white">supabase/schema.sql</code> no SQL Editor.</span>`
                        : info.lastSyncError === 'network'
                            ? `<span class="text-amber-400 flex items-center gap-1"><i class="ph ph-warning-circle"></i> Supabase configurado, mas não consegui conectar — confira a URL/chave e sua internet.</span>`
                            : `<span class="text-green-400 flex items-center gap-1"><i class="ph-bold ph-check-circle"></i> Conectado ao Supabase — salvando em tempo real.</span>`;
                } else {
                    el.innerHTML = `<span class="text-amber-400 flex items-center gap-1"><i class="ph ph-warning-circle"></i> Modo local (navegador). Cole a URL e a chave do Supabase em <code class="text-white">js/config.js</code> para salvar no banco.</span>`;
                }
            }

            // Banner vermelho no topo enquanto NÃO estiver salvando no banco
            if (banner && bannerText) {
                const disconnected = info.mode !== 'supabase' || !!info.lastSyncError;
                if (disconnected) {
                    if (info.mode === 'supabase') {
                        bannerText.innerHTML = info.lastSyncError === 'missing-table'
                            ? '<i class="ph-bold ph-warning-circle text-lg shrink-0"></i> <span><strong>Banco configurado, mas as tabelas não existem.</strong> Rode o arquivo <code class="underline decoration-1">supabase/schema.sql</code> no SQL Editor do Supabase.</span>'
                            : '<i class="ph-bold ph-warning-circle text-lg shrink-0"></i> <span><strong>Banco configurado, mas sem conexão.</strong> Confira a URL e a chave em <code class="underline decoration-1">js/config.js</code> e sua internet.</span>';
                    } else {
                        bannerText.innerHTML = '<i class="ph-bold ph-warning-circle text-lg shrink-0"></i> <span><strong>Não conectado ao banco de dados.</strong> Os dados estão salvos só neste navegador. Cole a URL e a chave (Settings &gt; API) em <code class="underline decoration-1">js/config.js</code>.</span>';
                    }
                    banner.classList.remove('hidden');
                } else {
                    banner.classList.add('hidden');
                }
            }
        }

        // Chamado pelo Storage sempre que o status da conexão muda
        window.onDbStatusChange = () => { renderDbStatus(); };

        function triggerPush(alertData) {
            isPushActive = true;
            activePushAlertId = alertData.id;

            // Popula Modal Central
            document.getElementById('push-name').innerText = alertData.name;
            document.getElementById('push-phone').innerText = alertData.phone;
            document.getElementById('push-subject').innerText = alertData.subject;
            document.getElementById('push-time').innerText = alertData.time;

            // Categoria (ícone + cor)
            const catMap = {
                'WhatsApp': { icon: 'ph-whatsapp-logo', color: 'text-green-500' },
                'Ligação': { icon: 'ph-phone-call', color: 'text-blue-400' },
                'Reunião': { icon: 'ph-calendar-blank', color: 'text-purple-400' },
                'Retorno': { icon: 'ph-arrow-u-down-left', color: 'text-yellow-400' }
            };
            const cat = catMap[alertData.category] || { icon: 'ph-tag', color: 'text-[var(--text-muted)]' };
            document.getElementById('push-category').innerHTML = `<i class="ph ${cat.icon} ${cat.color}"></i> ${alertData.category || 'Lead'}`;
            document.getElementById('push-bell-icon').className = `ph-fill ${alertData.category === 'Ligação' ? 'ph-phone-call' : 'ph-bell-ringing'} text-5xl text-[var(--brand-orange)]`;

            // Badge Agora / Atrasado
            const late = new Date(`${alertData.date}T${alertData.time}:00`) < new Date();
            const badge = document.getElementById('push-late-badge');
            if (late) {
                badge.className = 'absolute top-4 right-4 text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 flex items-center gap-1';
                badge.innerHTML = '<i class="ph ph-warning-circle"></i> ATRASADO';
            } else {
                badge.className = 'absolute top-4 right-4 text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full bg-[var(--brand-orange)]/15 border border-[var(--brand-orange)]/40 text-[var(--brand-orange)] flex items-center gap-1';
                badge.innerHTML = '<i class="ph ph-bell-ringing"></i> AGORA';
            }

            renderPushSnoozeButtons();

            document.getElementById('active-alert-overlay').classList.remove('hidden');

            playAlertSound();
        }

function renderPushSnoozeButtons() {
    const container = document.getElementById('push-snooze-container');
    container.innerHTML = '';

    snoozeOptions.forEach(min => {
        const label = min >= 1440 ? `${min/1440} dia` : (min >= 60 ? `${min/60} h` : `${min} min`);
        container.innerHTML += `
            <button onclick="snoozeAlertFromPush(${min})" class="py-2.5 bg-[var(--bg-input)] hover:bg-[var(--border-color)] border border-[var(--border-color)] rounded-xl text-sm font-medium text-[var(--text-muted)] hover:text-white transition-colors flex items-center justify-center gap-1"><i class="ph ph-clock"></i> ${label}</button>
        `;
    });
}

function snoozeAlertFromPush(minutes) {
    if(!activePushAlertId) return;

    const index = alerts.findIndex(a => a.id === activePushAlertId);
    if(index !== -1) {
        const now = new Date(); // Hora e minuto Exatos
        now.setMinutes(now.getMinutes() + minutes);

        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mmm = String(now.getMinutes()).padStart(2, '0');

        alerts[index].date = `${yyyy}-${mm}-${dd}`;
        alerts[index].time = `${hh}:${mmm}`;

        saveData();
        showToast(`Alerta adiado para ${hh}:${mmm}`, 'success');
    }
    closePushModal();
    renderDashboard();
}

function manualSnooze(id, minutes) {
     const index = alerts.findIndex(a => a.id === id);
    if(index !== -1) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);

        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mmm = String(now.getMinutes()).padStart(2, '0');

        alerts[index].date = `${yyyy}-${mm}-${dd}`;
        alerts[index].time = `${hh}:${mmm}`;
        saveData();
        showToast(`Adiado para ${hh}:${mmm}`, 'success');
        renderDashboard();
    }
}

        function closePushModal() {
            document.getElementById('active-alert-overlay').classList.add('hidden');
            stopAlertSound();
            isPushActive = false;
            activePushAlertId = null;
        }

// --- Fluxo de Conclusão Obrigatório ---
function openCompletionFlow() {
    stopAlertSound(); // Para o som para a pessoa conseguir pensar e digitar

    const alertData = alerts.find(a => a.id === activePushAlertId);
    document.getElementById('completion-lead-name').innerText = alertData.name;
    document.getElementById('completion-notes').value = '';
    document.getElementById('check-24h').checked = false;

    document.getElementById('completion-overlay').classList.remove('hidden');
}

function cancelCompletionFlow() {
    document.getElementById('completion-overlay').classList.add('hidden');
    playAlertSound(); // Volta a tocar o som, pois não concluiu nem adiou!
}

function confirmCompletion() {
    const notes = document.getElementById('completion-notes').value.trim();
    if(!notes) {
        showToast('É obrigatório descrever a conclusão.', 'error');
        return;
    }

    const index = alerts.findIndex(a => a.id === activePushAlertId);
    const originalAlert = alerts[index];

    originalAlert.status = 'completed';
    originalAlert.completionNotes = notes;
    originalAlert.completedAt = new Date().toISOString();

    if (document.getElementById('check-24h').checked) {
        createFollowUp(originalAlert);
    }

    saveData();

    document.getElementById('completion-overlay').classList.add('hidden');
    closePushModal();

    showToast('Lead concluído com sucesso!', 'success');
    renderDashboard();
}

function createFollowUp(alert) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');

    const newDate = `${yyyy}-${mm}-${dd}`;

    const followUp = {
        id: generateId(),
        name: alert.name,
        phone: alert.phone,
        subject: `FOLLOW-UP: ${alert.subject}`,
        date: newDate,
        time: alert.time, // Mesmo horário, só +1 dia
        category: alert.category,
        notes: `Notas do dia anterior: ${alert.completionNotes}`, // Passa o histórico para observação
        status: 'pending',
        createdAt: new Date().toISOString(),
        completionNotes: ''
    };

    alerts.push(followUp);
    showToast('Alerta de Follow-up 24h foi criado.', 'info');
}

// --- Relatório Administrativo (lista com filtros: hoje / semana / mês) ---
function passesReportFilter(a) {
    if (reportFilter === 'todos') return true;
    const created = a.createdAt ? new Date(a.createdAt) : null;
    if (!created) return false;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (reportFilter === 'hoje') return created >= startOfDay;
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // semana começa no domingo
    if (reportFilter === 'semana') return created >= startOfWeek;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return created >= startOfMonth;
}

function setReportFilter(f) {
    reportFilter = f;
    ['hoje', 'semana', 'mes', 'todos'].forEach(id => {
        const btn = document.getElementById('report-filter-' + id);
        if (!btn) return;
        const active = id === f;
        btn.classList.toggle('bg-[var(--brand-orange)]', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('border-[var(--brand-orange)]', active);
        btn.classList.toggle('shadow', active);
        btn.classList.toggle('bg-[var(--bg-input)]', !active);
        btn.classList.toggle('text-[var(--text-muted)]', !active);
        btn.classList.toggle('border-[var(--border-color)]', !active);
        btn.classList.toggle('hover:border-[var(--brand-orange)]', !active);
    });
    renderHistorico();
}

function buildReportItem(a) {
    const isCompleted = a.status === 'completed';
    const initials = a.name ? a.name.substring(0, 2).toUpperCase() : '??';
    const catMap = {
        'WhatsApp': { icon: 'ph-whatsapp-logo', color: 'text-green-500' },
        'Ligação': { icon: 'ph-phone-call', color: 'text-blue-400' },
        'Reunião': { icon: 'ph-calendar-blank', color: 'text-purple-400' },
        'Retorno': { icon: 'ph-arrow-u-down-left', color: 'text-yellow-400' }
    };
    const cat = catMap[a.category] || { icon: 'ph-tag', color: 'text-[var(--text-muted)]' };
    const statusBadge = isCompleted
        ? `<span class="flex items-center gap-1 text-[11px] bg-green-500/10 border border-green-500/30 text-green-500 px-2 py-1 rounded-full shrink-0"><i class="ph-bold ph-check"></i> Concluído</span>`
        : `<span class="flex items-center gap-1 text-[11px] bg-[var(--brand-orange)]/10 border border-[var(--brand-orange)]/30 text-[var(--brand-orange)] px-2 py-1 rounded-full shrink-0"><i class="ph ph-clock"></i> Pendente</span>`;

    const createdDate = a.createdAt ? a.createdAt.split('T')[0] : '';
    return `
        <div class="bg-[var(--bg-card)] border ${isCompleted ? 'border-green-500/15 hover:border-green-500/40' : 'border-[var(--border-color)] hover:border-[var(--brand-orange)]/40'} rounded-xl p-4 flex items-start gap-4 transition-colors group">
            <div class="w-10 h-10 rounded-full ${isCompleted ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-[var(--bg-input)] text-white border-[var(--border-color)]'} border flex items-center justify-center font-bold text-xs shrink-0">${initials}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-medium text-white text-sm">${a.name || '-'}</h4>
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                    <span class="flex items-center gap-1"><i class="ph ph-calendar-blank"></i> ${formatDateBR(a.date)} às ${a.time}</span>
                    <span class="flex items-center gap-1"><i class="ph ${cat.icon} ${cat.color}"></i> ${a.category || 'Lead'}</span>
                    <span class="flex items-center gap-1"><i class="ph ph-whatsapp-logo text-green-500"></i> ${a.phone || '-'}</span>
                </div>
                <p class="text-sm text-gray-300 mt-2 line-clamp-2">${a.subject || ''}</p>
                ${a.completionNotes ? `<p class="text-xs text-green-400/90 mt-2 bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2"><i class="ph ph-chat-circle-dots"></i> ${a.completionNotes}</p>` : ''}
            </div>
            <div class="shrink-0 text-right">
                <div class="flex items-center justify-end gap-1.5 mb-2">
                    <button onclick="openEditAlert('${a.id}')" title="Editar" class="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--brand-orange)] hover:border-[var(--brand-orange)]/50 transition-colors"><i class="ph ph-pencil-simple text-sm"></i></button>
                    <button onclick="deleteAlert('${a.id}')" title="Excluir" class="p-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/50 transition-colors"><i class="ph ph-trash text-sm"></i></button>
                </div>
                <p class="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Criado</p>
                <p class="text-xs text-gray-400 mt-0.5">${createdDate ? formatDateBR(createdDate) : '-'}</p>
            </div>
        </div>`;
}

function renderHistorico() {
    const container = document.getElementById('report-list');
    const empty = document.getElementById('report-empty');
    const summary = document.getElementById('report-summary');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...alerts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const filtered = sorted.filter(passesReportFilter);

    if (filtered.length === 0) {
        empty.classList.remove('hidden');
        summary.innerHTML = '0 registros no período.';
        return;
    }
    empty.classList.add('hidden');

    let pendentes = 0, concluidos = 0, atrasadosHoje = 0;
    const now = new Date();
    filtered.forEach(a => {
        if (a.status === 'completed') concluidos++;
        else {
            pendentes++;
            if (new Date(`${a.date}T${a.time}:00`) < now) atrasadosHoje++;
        }
        container.innerHTML += buildReportItem(a);
    });

    const hojeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    summary.innerHTML =
        `<strong class="text-white">${filtered.length}</strong> registros no período` +
        ` · <span class="text-[var(--brand-orange)]">${pendentes} pendentes</span>` +
        (atrasadosHoje ? ` · <span class="text-red-400">${atrasadosHoje} atrasados</span>` : '') +
        ` · <span class="text-green-400">${concluidos} concluídos</span>` +
        ` <span class="text-[var(--text-muted)]">(hoje: ${formatDateBR(hojeStr)})</span>`;
}

function renderConcluidos() {
    const container = document.getElementById('list-concluidos-view');
    container.innerHTML = '';

    // Só mostra alertas realmente concluídos (com notas de conclusão)
    const concluidos = alerts.filter(a => a.status === 'completed' && a.completionNotes).sort((a,b) => new Date(b.completedAt) - new Date(a.completedAt));

    if(concluidos.length === 0) {
        container.innerHTML = `<div class="col-span-full py-10 text-center border border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)]">Nenhum alerta finalizado ainda.</div>`;
        return;
    }

    concluidos.forEach(a => {
        const initials = a.name ? a.name.substring(0, 2).toUpperCase() : '??';
        const isNotWorked = a.notWorked;
        const borderColor = isNotWorked ? 'border-red-500/20' : 'border-green-500/20';
        const badgeBg = isNotWorked ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-500';
        const badgeIcon = isNotWorked ? 'ph-x-circle' : 'ph-check';
        const badgeLabel = isNotWorked ? 'NÃO FUNCIONOU' : 'CONCLUÍDO';
        const noteBorder = isNotWorked ? 'border-red-500' : 'border-green-500';
        const noteLabel = isNotWorked ? 'text-red-400/70' : 'text-green-400/70';

        container.innerHTML += `
            <div class="bg-[var(--bg-card)] ${borderColor} border rounded-2xl p-5 flex flex-col relative group">
                <div class="absolute top-4 right-4 ${badgeBg} p-1.5 rounded-full flex items-center gap-1"><i class="ph-bold ${badgeIcon} text-sm"></i> <span class="text-[9px] font-bold tracking-wider">${badgeLabel}</span></div>
                <div class="flex items-start gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full ${badgeBg} border ${borderColor} flex items-center justify-center font-bold text-xs shrink-0">${initials}</div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-white text-base pr-20 truncate">${a.name}</h3>
                        <p class="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                            <span class="flex items-center gap-1"><i class="ph ph-calendar-check"></i> ${formatDateBR(a.completedAt.split('T')[0])}</span>
                            <span>·</span>
                            <span class="flex items-center gap-1"><i class="ph ph-clock"></i> ${a.time || '-'}</span>
                            <span>·</span>
                            <span class="flex items-center gap-1"><i class="ph ph-whatsapp-logo text-green-500"></i> ${a.phone || '-'}</span>
                        </p>
                    </div>
                </div>

                ${a.subject ? `<p class="text-xs text-[var(--text-muted)] mb-3 line-clamp-1">${a.subject}</p>` : ''}

                <div class="bg-[var(--bg-input)] p-3 rounded-xl text-sm text-gray-300 border-l-2 ${noteBorder} mb-4 line-clamp-3" title="${a.completionNotes}">
                    <span class="${noteLabel} text-xs font-medium"><i class="ph ph-chat-circle-dots"></i> Nota:</span> ${a.completionNotes}
                </div>

                <div class="mt-auto flex gap-2">
                    <button onclick="openEditAlert('${a.id}')" class="flex-1 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--brand-orange)] text-[var(--text-muted)] hover:text-[var(--brand-orange)] rounded-xl text-xs font-medium transition-all flex justify-center items-center gap-1">
                        <i class="ph ph-pencil-simple"></i> Editar
                    </button>
                    <button onclick="reactivateAlert('${a.id}')" class="flex-1 py-2 bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:border-green-500 text-green-500 hover:text-white rounded-xl text-xs font-medium transition-all flex justify-center items-center gap-1">
                        <i class="ph ph-arrow-counter-clockwise"></i> Reativar
                    </button>
                </div>
            </div>
        `;
    });
}

function reactivateAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    if (!confirm(`Reativar o alerta de "${alert.name}"? Ele voltará como pendente.`)) return;

    alert.status = 'pending';
    alert.completedAt = null;
    alert.completionNotes = '';
    saveData();

    showToast(`Alerta de "${alert.name}" reativado!`, 'success');
    renderDashboard();
}

// --- Configurações Admin ---
function renderSnoozeSettings() {
    const container = document.getElementById('snooze-options-list');
    container.innerHTML = '';

    snoozeOptions.forEach(min => {
        const label = min >= 1440 ? `${min/1440} dia` : (min >= 60 ? `${min/60}h` : `${min} min`);
        container.innerHTML += `
            <div class="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-color)] pl-3 pr-1 py-1.5 rounded-lg text-sm text-white">
                <span>${label}</span>
                <button onclick="removeSnoozeOption(${min})" class="p-1 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 rounded transition-colors"><i class="ph ph-x"></i></button>
            </div>
        `;
    });
}

function addSnoozeOption() {
    const input = document.getElementById('new-snooze-time');
    const val = parseInt(input.value);

    if(isNaN(val) || val <= 0) { showToast('Insira um tempo válido (minutos).', 'error'); return; }
    if(!snoozeOptions.includes(val)) {
        snoozeOptions.push(val);
        snoozeOptions.sort((a,b) => a - b);
        Storage.saveSnoozeOptions(snoozeOptions);
        renderSnoozeSettings();
        input.value = '';
        showToast('Opção de Adiar adicionada!', 'success');
    } else {
        showToast('Este tempo já existe.', 'error');
    }
}

function removeSnoozeOption(min) {
    if(snoozeOptions.length <= 1) { showToast('Deixe pelo menos 1 opção.', 'error'); return; }
    snoozeOptions = snoozeOptions.filter(v => v !== min);
    Storage.saveSnoozeOptions(snoozeOptions);
    renderSnoozeSettings();
}

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            avatarData = e.target.result;
            Storage.saveAvatar(avatarData);
            applyAvatar();
            showToast('Foto atualizada com sucesso!', 'success');
        }
        reader.readAsDataURL(file);
    }
}

function applyAvatar() {
    if (avatarData) {
        document.getElementById('settings-avatar').src = avatarData;
    }
}

        async function limparTudo() {
            if(confirm("ATENÇÃO: Apagar TODOS os leads, histórico e configurações permanentemente? Esta ação não pode ser desfeita.")) {
                await Storage.clearAll();
                window.location.reload();
            }
        }

function exportToCSV() {
    if(alerts.length === 0) return;
    let csv = 'Data,Hora,Nome,Telefone,Assunto,Categoria,Status,Notas_Conclusao\n';
    alerts.forEach(a => {
        const row = [a.date, a.time, `"${a.name}"`, a.phone, `"${a.subject}"`, a.category, a.status, `"${a.completionNotes}"`];
        csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'relatorio_leads.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- Área do Admin (senha) ---
function isAdminAuthorized() {
    return sessionStorage.getItem('admin_authorized') === '1';
}

function openAdminLock() {
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-password-error').classList.add('hidden');
    document.getElementById('admin-lock-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('admin-password').focus(), 50);
}

function closeAdminLock() {
    document.getElementById('admin-lock-overlay').classList.add('hidden');
}

function submitAdminPassword() {
    const pass = document.getElementById('admin-password').value.trim();
    if (pass === '123') {
        sessionStorage.setItem('admin_authorized', '1');
        closeAdminLock();
        switchTab('historico');
        renderHistorico();
    } else {
        document.getElementById('admin-password-error').classList.remove('hidden');
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('admin_authorized');
    switchTab('todos');
}

// --- Utils e UI ---
function switchTab(tabId) {
    // A aba Histórico é do Admin — exige senha
    if (tabId === 'historico' && !isAdminAuthorized()) {
        openAdminLock();
        return;
    }
    // Fechar detalhe do lead ao trocar de aba
    if (tabId !== 'leads') {
        activeLeadId = null;
        const panel = document.getElementById('lead-detail-panel');
        const overlay = document.getElementById('lead-detail-overlay');
        if (panel) panel.classList.add('translate-x-full');
        if (overlay) overlay.classList.add('hidden');
    }
    const tabs = ['todos', 'historico', 'concluidos', 'leads', 'sem-futuro', 'config'];
    tabs.forEach(id => {
        const btn = document.getElementById(`tab-${id}`);
        const view = document.getElementById(`view-${id}`);
        if (!btn || !view) return;
        // Cores especiais por aba
        const isWhatsApp = id === 'leads';
        const isSemFuturo = id === 'sem-futuro';
        const activeColor = isWhatsApp ? 'border-green-500' : isSemFuturo ? 'border-red-500' : 'border-[var(--brand-orange)]';
        const activeTextColor = isWhatsApp ? 'text-green-500' : isSemFuturo ? 'text-red-400' : 'text-white';
        if(id === tabId) {
            btn.classList.add(activeColor, activeTextColor);
            btn.classList.remove('border-transparent', 'text-[var(--text-muted)]');
            view.classList.remove('hidden');
        } else {
            btn.classList.remove(activeColor, activeTextColor);
            btn.classList.add('border-transparent', 'text-[var(--text-muted)]');
            view.classList.add('hidden');
        }
    });
    // Re-render leads ao entrar na aba
    if (tabId === 'leads') {
        renderLeadsList();
        renderLeadsDashboard();
    }
    if (tabId === 'sem-futuro') {
        renderSemFuturo();
    }
}

function filterAlerts() {
    const val = document.getElementById('search-input').value.toLowerCase();
    const cards = document.querySelectorAll('#list-atrasados > div, #list-agora > div, #list-proximo > div, #list-concluidos-view > div');
    cards.forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(val) ? 'flex' : 'none';
    });
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    let colors = ''; let icon = '';
    if(type === 'success') { colors = 'bg-green-500/10 border-green-500 text-green-500'; icon = 'ph-check-circle'; }
    else if(type === 'error') { colors = 'bg-red-500/10 border-red-500 text-red-500'; icon = 'ph-warning-circle'; }
    else { colors = 'bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] text-[var(--brand-orange)]'; icon = 'ph-info'; }

    toast.className = `border ${colors} p-3 rounded-xl shadow-lg flex items-center gap-3 transform translate-y-10 opacity-0 transition-all duration-300 font-medium text-sm backdrop-blur-md bg-[var(--bg-card)]/80`;
    toast.innerHTML = `<i class="ph-fill ${icon} text-lg"></i> ${msg}`;

    container.appendChild(toast);

    // Animação de entrada
    setTimeout(() => { toast.classList.remove('translate-y-10', 'opacity-0'); }, 10);

    // Remove
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDateBR(dateStr) {
    if(!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function saveData() {
    Storage.saveAlerts(alerts);
    flashSyncStatus();
}

// --- Indicador de salvamento em tempo real (honesto: mostra onde salvou) ---
let syncFlashTimer = null;
function flashSyncStatus() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const info = Storage.statusInfo();
    el.classList.remove('hidden');
    el.classList.remove('text-green-400', 'text-amber-400', 'text-red-400');
    clearTimeout(syncFlashTimer);

    if (info.mode !== 'supabase') {
        // Sem banco configurado: salvou apenas neste navegador
        el.classList.add('text-amber-400');
        el.innerHTML = '<i class="ph-bold ph-check"></i> salvo neste navegador';
        syncFlashTimer = setTimeout(() => el.classList.add('hidden'), 2500);
        renderDbStatus();
    } else if (info.lastSyncError) {
        // Banco configurado, mas algo deu errado (ex.: tabelas não existem)
        el.classList.add('text-red-400');
        el.innerHTML = '<i class="ph-bold ph-warning"></i> erro ao salvar no banco';
        syncFlashTimer = setTimeout(() => el.classList.add('hidden'), 3000);
        renderDbStatus();
    } else if (info.pending > 0) {
        // Enviando para o banco…
        el.classList.add('text-amber-400');
        el.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> salvando no banco…';
        syncFlashTimer = setTimeout(flashSyncStatus, 2000);
    } else {
        el.classList.add('text-green-400');
        el.innerHTML = '<i class="ph-bold ph-check"></i> salvo no banco';
        syncFlashTimer = setTimeout(() => el.classList.add('hidden'), 2000);
    }
}

// --- PWA: banner de instalação no topo ---
function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: window-controls-overlay)').matches
        || window.navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
});

function showInstallBanner() {
    if (installBannerDismissed) return;
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    const installBtn = document.getElementById('install-btn');
    const iosNote = document.getElementById('install-ios-note');
    if (isIOS() && !window.navigator.standalone) {
        installBtn.classList.add('hidden');
        iosNote.classList.remove('hidden');
    } else {
        installBtn.classList.remove('hidden');
        iosNote.classList.add('hidden');
    }
    banner.classList.remove('hidden');
}

function hideInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.add('hidden');
}

function dismissInstallBanner() {
    installBannerDismissed = true;
    hideInstallBanner();
}

function installPWA() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
            hideInstallBanner();
        });
    } else if (isIOS()) {
        showToast('No iPhone/iPad: toque em Compartilhar e depois em "Adicionar à Tela de Início".', 'info');
    } else {
        window.alert(
            'Para instalar no desktop:\n\n' +
            '1. No Chrome ou Edge, abra o menu de três pontos.\n' +
            '2. Escolha “Instalar Grupo Aureos | Alerta de LEADS” ou “Aplicativos > Instalar este site como aplicativo”.\n\n' +
            'Se essa opção não aparecer, o navegador considera que o app já está instalado. Abra a instalação antiga, desinstale pelo menu do aplicativo e volte a esta página. Ao desinstalar, não marque a opção de apagar os dados do site.'
        );
    }
}

// --- Atualização automática do PWA ---
// O navegador baixa a nova versão em segundo plano. Assim que ela fica pronta,
// ativamos o novo service worker e recarregamos uma única vez.
function setupPwaUpdates(registration) {
    function activateUpdate(worker) {
        if (!worker || applyingPwaUpdate) return;
        applyingPwaUpdate = true;
        showUpdateBanner();
        // Pequeno intervalo apenas para a interface informar o que está acontecendo.
        setTimeout(() => worker.postMessage({ type: 'SKIP_WAITING' }), 300);
    }

    function watchInstallingWorker(worker) {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                activateUpdate(registration.waiting || worker);
            }
        });
    }

    if (registration.waiting && navigator.serviceWorker.controller) {
        activateUpdate(registration.waiting);
    }

    registration.addEventListener('updatefound', () => watchInstallingWorker(registration.installing));

    // Confere ao voltar para o app e a cada minuto durante sessões longas.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
    setInterval(() => registration.update().catch(() => {}), 60 * 1000);
}

function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
    let pwaReloadStarted = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applyingPwaUpdate && !pwaReloadStarted) {
            pwaReloadStarted = true;
            window.location.reload();
        }
    });
}

// Desbloqueia o áudio no mobile na primeira interação (iOS/Android exigem um toque)
(function unlockMobileAudio() {
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    if (!isTouch) return;
    const unlock = function () {
        ensureAudioCtx();
        window.removeEventListener('touchend', unlock);
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('touchend', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
})();

window.onload = initApp;
