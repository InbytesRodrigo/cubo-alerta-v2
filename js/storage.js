/* ============================================================
   CAMADA DE DADOS (Storage)
   ------------------------------------------------------------
   ÚNICO arquivo responsável por LER e SALVAR os dados do app.

   SUPABASE (projeto "CuboAlertas"):
   - Cole a URL e a chave anon em js/config.js;
   - Rode o SQL de supabase/schema.sql no SQL Editor;
   - Sem configurar, o app continua funcionando com localStorage
     normalmente (fallback automático).

   SINCRONIZAÇÃO EM TEMPO REAL:
   - Cada mudança é salva no localStorage NA HORA (nada se perde);
   - Se o Supabase estiver configurado, a alteração entra numa fila
     e é enviada em seguida; se a rede falhar, fica pendente e
     tenta de novo sozinha (a cada 8s e quando a internet voltar);
   - Ao fechar/fechar a aba com algo pendente, o envio é forçado
     com fetch keepalive.
   ============================================================ */

const Storage = (() => {
    const KEYS = {
        alerts: 'alerts_data',        // lista de alertas/leads
        snoozes: 'alerts_snoozes',    // opções do botão "Adiar"
        avatar: 'alerts_avatar',      // foto de perfil (base64)
        sound: 'alerts_sound',        // som do alerta ('call' | 'beep' | 'notification' | 'custom' | 'none')
        soundFile: 'alerts_sound_file', // arquivo de som personalizado (base64 data URL)
        pending: 'alerts_sync_pending', // fila durável de alterações ainda não sincronizadas
        leads: 'leads_data',          // lista de leads WhatsApp
        leadObs: 'lead_obs_data'      // observações dos leads
    };

    /* ---------- Supabase (PostgREST via fetch, sem dependências) ---------- */
    const BASE = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL)
        ? CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1' : null;
    const ANON = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY)
        ? CONFIG.SUPABASE_ANON_KEY : null;

    function usingDatabase() { return !!(BASE && ANON); }

    function dbHeaders(extra) {
        return Object.assign({
            'apikey': ANON,
            'Authorization': 'Bearer ' + ANON,
            'Content-Type': 'application/json'
        }, extra || {});
    }

    /* ---------- Fila de sincronização (nada se perde) ---------- */
    // Payloads pendentes (última versão de cada tipo)
    function parseJson(value, fallback) {
        try { return value == null ? fallback : JSON.parse(value); }
        catch (_) { return fallback; }
    }

    const savedPending = parseJson(localStorage.getItem(KEYS.pending), {});
    const PENDING = {
        alerts: Array.isArray(savedPending.alerts) ? savedPending.alerts : null,
        settings: Array.isArray(savedPending.settings) ? savedPending.settings : null
    };
    let flushing = false;
    let retryTimer = null;
    // Diagnóstico da última sincronização (exibido para o usuário)
    let lastSyncError = null; // null | 'missing-table' | 'network'

    function persistPending() {
        try {
            if (PENDING.alerts || PENDING.settings) {
                localStorage.setItem(KEYS.pending, JSON.stringify(PENDING));
            } else {
                localStorage.removeItem(KEYS.pending);
            }
        } catch (err) {
            // Arquivos de áudio/foto podem ultrapassar a cota do localStorage.
            // Eles continuam seguros no IndexedDB e na fila em memória.
            console.warn('Fila grande demais para localStorage; mantendo no IndexedDB/memória.', err);
        }
    }

    /* ---------- Arquivos grandes (IndexedDB não tem a cota pequena do localStorage) ---------- */
    function binaryStore(mode, key, value) {
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        return new Promise((resolve) => {
            const request = indexedDB.open('cubo-alerta', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('settings');
            request.onerror = () => resolve(null);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('settings', mode);
                const store = tx.objectStore('settings');
                const operation = mode === 'readonly' ? store.get(key)
                    : value == null ? store.delete(key) : store.put(value, key);
                operation.onsuccess = () => resolve(mode === 'readonly' ? operation.result || null : true);
                operation.onerror = () => resolve(null);
                tx.oncomplete = () => db.close();
            };
        });
    }

    function saveLargeLocal(key, value) {
        binaryStore('readwrite', key, value);
        try {
            if (value == null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (err) {
            console.warn('Arquivo salvo no IndexedDB (localStorage sem espaço).', err);
        }
    }

    function classifyError(err, status) {
        const msg = (err && err.message ? err.message : String(err || '')) + ' ' + (status || '');
        if (status === 404 || /404|does not exist|relation|42P01/.test(msg)) return 'missing-table';
        return 'network';
    }

    function scheduleRetry() {
        if (retryTimer || !usingDatabase()) return;
        retryTimer = setTimeout(() => { retryTimer = null; flushPending(); }, 8000);
    }

    async function flushPending() {
        if (!usingDatabase() || flushing) return;
        flushing = true;
        try {
            // Repete até esvaziar a fila (novas mudanças entram no meio do caminho)
            while (PENDING.alerts || PENDING.settings) {
                if (PENDING.alerts) {
                    const batch = PENDING.alerts;
                    const body = JSON.stringify(batch);
                    const res = await fetch(`${BASE}/alerts`, {
                        method: 'POST',
                        headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                        body
                    });
                    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
                    // Remove do banco itens excluídos localmente, sem deixar leads reaparecerem.
                    const ids = batch.map((row) => row.id);
                    const deleteUrl = ids.length
                        ? `${BASE}/alerts?id=not.in.(${ids.map(encodeURIComponent).join(',')})`
                        : `${BASE}/alerts?id=not.is.null`;
                    const deleteRes = await fetch(deleteUrl, { method: 'DELETE', headers: dbHeaders() });
                    if (!deleteRes.ok) { const e = new Error('HTTP ' + deleteRes.status); e.status = deleteRes.status; throw e; }
                    // Não apaga uma versão mais nova que entrou durante o await.
                    if (PENDING.alerts === batch) PENDING.alerts = null;
                    persistPending();
                }
                if (PENDING.settings) {
                    const batch = PENDING.settings;
                    const body = JSON.stringify(batch);
                    const res = await fetch(`${BASE}/settings`, {
                        method: 'POST',
                        headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                        body
                    });
                    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
                    if (PENDING.settings === batch) PENDING.settings = null;
                    persistPending();
                }
            }
        } catch (err) {
            lastSyncError = classifyError(err, err && err.status);
            console.warn('Supabase (sincronização) falhou, tentando de novo:', err && err.message ? err.message : err);
            scheduleRetry();
            notifyStatusChange();
        } finally {
            flushing = false;
        }
        if (!PENDING.alerts && !PENDING.settings && lastSyncError) {
            lastSyncError = null;
            notifyStatusChange();
        }
    }

    // Avisa o app que o status da conexão mudou (banner/indicadores)
    function notifyStatusChange() {
        if (typeof window !== 'undefined' && window.onDbStatusChange) {
            window.onDbStatusChange();
        }
    }

    // Se o usuário fechar a aba com algo pendente, tenta enviar mesmo assim
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            if (!usingDatabase()) return;
            if (PENDING.alerts) {
                fetch(`${BASE}/alerts`, {
                    method: 'POST',
                    headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                    body: JSON.stringify(PENDING.alerts),
                    keepalive: true
                }).catch(() => {});
            }
            if (PENDING.settings) {
                fetch(`${BASE}/settings`, {
                    method: 'POST',
                    headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                    body: JSON.stringify(PENDING.settings),
                    keepalive: true
                }).catch(() => {});
            }
        });
        window.addEventListener('online', () => { flushPending(); });
    }

    function enqueueAlerts(alerts) {
        PENDING.alerts = alerts.map(alertToRow);
        persistPending();
        flushPending();
    }

    function enqueueSetting(key, valueJson) {
        const rows = PENDING.settings || [];
        PENDING.settings = rows.filter((r) => r.key !== key).concat([{ key, value: valueJson }]);
        persistPending();
        flushPending();
    }

    /* ---------- Conversão app <-> banco ---------- */
    function alertToRow(a) {
        return {
            id: a.id,
            name: a.name,
            phone: a.phone,
            subject: a.subject,
            date: a.date,
            time: a.time,
            category: a.category,
            notes: a.notes,
            status: a.status,
            created_at: a.createdAt,
            completed_at: a.completedAt || null,
            completion_notes: a.completionNotes || ''
        };
    }

    function rowToAlert(r) {
        return {
            id: r.id,
            name: r.name,
            phone: r.phone || '',
            subject: r.subject || '',
            date: r.date || '',
            time: r.time || '',
            category: r.category || '',
            notes: r.notes || '',
            status: r.status || 'pending',
            createdAt: r.created_at || '',
            completedAt: r.completed_at || '',
            completionNotes: r.completion_notes || ''
        };
    }

    /* ---------- Alertas (leads) ---------- */
    async function getAlerts() {
        const local = parseJson(localStorage.getItem(KEYS.alerts), null);
        // Uma fila pendente representa a versão mais nova e nunca deve ser
        // substituída por uma leitura antiga do servidor ao reabrir o PWA.
        if (PENDING.alerts) {
            flushPending();
            return local || PENDING.alerts.map(rowToAlert);
        }
        if (usingDatabase()) {
            try {
                const res = await fetch(`${BASE}/alerts?select=*`, { headers: dbHeaders() });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        // Migração única: banco vazio + dados no navegador → sobe tudo para o banco
                        if (rows.length === 0 && local && local.length > 0) {
                            enqueueAlerts(local);
                        }
                        const loaded = rows.map(rowToAlert);
                        localStorage.setItem(KEYS.alerts, JSON.stringify(loaded));
                        return loaded;
                    }
                } else {
                    lastSyncError = classifyError(null, res.status);
                    console.warn('Supabase (leitura) retornou', res.status, '- usando localStorage');
                }
            } catch (err) {
                lastSyncError = 'network';
                console.warn('Supabase indisponível, usando localStorage:', err && err.message ? err.message : err);
            }
        }
        return local || [];
    }

    // Salva imediatamente no navegador + enfileira para o Supabase
    function saveAlerts(alerts) {
        localStorage.setItem(KEYS.alerts, JSON.stringify(alerts));
        if (usingDatabase()) enqueueAlerts(alerts);
    }

    /* ---------- Configurações (Adiar, Som, Avatar) ---------- */
    async function getSettingFromDb(key, fallback) {
        const pendingRow = PENDING.settings && PENDING.settings.find((row) => row.key === key);
        if (pendingRow) {
            flushPending();
            return parseJson(pendingRow.value, fallback);
        }
        if (usingDatabase()) {
            try {
                const res = await fetch(`${BASE}/settings?select=value&key=eq.${key}`, { headers: dbHeaders() });
                if (res.ok) {
                    const rows = await res.json();
                    if (rows && rows[0] && rows[0].value != null) return parseJson(rows[0].value, fallback);
                }
            } catch (err) {
                console.warn('Supabase indisponível, usando localStorage:', err && err.message ? err.message : err);
            }
        }
        return fallback;
    }

    async function getSnoozeOptions() {
        const db = await getSettingFromDb('snoozes', null);
        if (db) return db;
        return parseJson(localStorage.getItem(KEYS.snoozes), null) || [15, 30, 60, 1440];
    }

    function saveSnoozeOptions(options) {
        localStorage.setItem(KEYS.snoozes, JSON.stringify(options));
        if (usingDatabase()) enqueueSetting('snoozes', JSON.stringify(options));
    }

    async function getSoundOption() {
        const db = await getSettingFromDb('sound', null);
        if (db) return db;
        return localStorage.getItem(KEYS.sound) || 'call';
    }

    function saveSoundOption(id) {
        localStorage.setItem(KEYS.sound, id);
        if (usingDatabase()) enqueueSetting('sound', JSON.stringify(id));
    }

    async function getSoundFile() {
        const local = localStorage.getItem(KEYS.soundFile);
        if (local && local !== 'null') return local;
        const indexed = await binaryStore('readonly', KEYS.soundFile);
        if (indexed) return indexed;
        return await getSettingFromDb('soundfile', null);
    }

    function saveSoundFile(dataUrl) {
        if (dataUrl) {
            saveLargeLocal(KEYS.soundFile, dataUrl);
            if (usingDatabase()) enqueueSetting('soundfile', JSON.stringify(dataUrl));
        } else {
            saveLargeLocal(KEYS.soundFile, null);
            if (usingDatabase()) enqueueSetting('soundfile', 'null');
        }
    }

    async function getAvatar() {
        const local = localStorage.getItem(KEYS.avatar);
        if (local) return local;
        const indexed = await binaryStore('readonly', KEYS.avatar);
        if (indexed) return indexed;
        return await getSettingFromDb('avatar', null);
    }

    function saveAvatar(dataUrl) {
        saveLargeLocal(KEYS.avatar, dataUrl);
        if (usingDatabase()) enqueueSetting('avatar', JSON.stringify(dataUrl));
    }

    /* ---------- WhatsApp Leads ---------- */
    function leadToRow(l) {
        return {
            id: l.id,
            name: l.name,
            phone: l.phone || '',
            description: l.description || '',
            status: l.status || 'active',
            created_at: l.createdAt || new Date().toISOString(),
            updated_at: l.updatedAt || new Date().toISOString()
        };
    }

    function rowToLead(r) {
        return {
            id: r.id,
            name: r.name,
            phone: r.phone || '',
            description: r.description || '',
            status: r.status || 'active',
            createdAt: r.created_at || '',
            updatedAt: r.updated_at || ''
        };
    }

    function leadObsToRow(o) {
        return {
            id: o.id,
            lead_id: o.leadId,
            text: o.text,
            created_at: o.createdAt || new Date().toISOString()
        };
    }

    function rowToLeadObs(r) {
        return {
            id: r.id,
            leadId: r.lead_id,
            text: r.text,
            createdAt: r.created_at || ''
        };
    }

    async function getLeads() {
        const local = parseJson(localStorage.getItem(KEYS.leads), null);
        if (usingDatabase()) {
            try {
                const res = await fetch(`${BASE}/leads?select=*&order=created_at.desc`, { headers: dbHeaders() });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        const loaded = rows.map(rowToLead);
                        localStorage.setItem(KEYS.leads, JSON.stringify(loaded));
                        return loaded;
                    }
                }
            } catch (err) {
                console.warn('Supabase (leads) indisponível:', err && err.message ? err.message : err);
            }
        }
        return local || [];
    }

    function saveLeads(leads) {
        localStorage.setItem(KEYS.leads, JSON.stringify(leads));
        if (usingDatabase()) {
            const rows = leads.map(leadToRow);
            fetch(`${BASE}/leads`, {
                method: 'POST',
                headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify(rows)
            }).catch(err => console.warn('Supabase (saveLeads):', err));
        }
    }

    async function getLeadObservations(leadId) {
        const local = parseJson(localStorage.getItem(KEYS.leadObs), []);
        const filtered = local.filter(o => o.leadId === leadId);
        if (usingDatabase()) {
            try {
                const res = await fetch(`${BASE}/lead_observations?select=*&lead_id=eq.${leadId}&order=created_at.asc`, { headers: dbHeaders() });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        return rows.map(rowToLeadObs);
                    }
                }
            } catch (err) {
                console.warn('Supabase (leadObs) indisponível:', err && err.message ? err.message : err);
            }
        }
        return filtered;
    }

    async function getAllLeadObservations() {
        const local = parseJson(localStorage.getItem(KEYS.leadObs), []);
        if (usingDatabase()) {
            try {
                const res = await fetch(`${BASE}/lead_observations?select=*&order=created_at.desc`, { headers: dbHeaders() });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        const loaded = rows.map(rowToLeadObs);
                        localStorage.setItem(KEYS.leadObs, JSON.stringify(loaded));
                        return loaded;
                    }
                }
            } catch (err) {
                console.warn('Supabase (allLeadObs) indisponível:', err && err.message ? err.message : err);
            }
        }
        return local;
    }

    function saveLeadObservation(obs) {
        const all = parseJson(localStorage.getItem(KEYS.leadObs), []);
        all.push(obs);
        localStorage.setItem(KEYS.leadObs, JSON.stringify(all));
        if (usingDatabase()) {
            fetch(`${BASE}/lead_observations`, {
                method: 'POST',
                headers: dbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify(leadObsToRow(obs))
            }).catch(err => console.warn('Supabase (saveLeadObs):', err));
        }
    }

    function deleteLeadObservation(obsId) {
        let all = parseJson(localStorage.getItem(KEYS.leadObs), []);
        all = all.filter(o => o.id !== obsId);
        localStorage.setItem(KEYS.leadObs, JSON.stringify(all));
        if (usingDatabase()) {
            fetch(`${BASE}/lead_observations?id=eq.${obsId}`, {
                method: 'DELETE',
                headers: dbHeaders()
            }).catch(err => console.warn('Supabase (deleteLeadObs):', err));
        }
    }

    /* ---------- Utilitário de emergência ---------- */
    async function clearAll() {
        localStorage.clear();
        if (typeof indexedDB !== 'undefined') {
            await new Promise((resolve) => {
                const request = indexedDB.deleteDatabase('cubo-alerta');
                request.onsuccess = request.onerror = request.onblocked = () => resolve();
            });
        }
        if (usingDatabase()) {
            PENDING.alerts = null;
            PENDING.settings = null;
            await Promise.all([
                fetch(`${BASE}/alerts?id=not.is.null`, { method: 'DELETE', headers: dbHeaders() }),
                fetch(`${BASE}/settings?key=not.is.null`, { method: 'DELETE', headers: dbHeaders() })
            ]).catch((err) => console.warn('Supabase (limpeza):', err && err.message ? err.message : err));
        }
    }

    /* ---------- Informações de status (para a tela de Configurações) ---------- */
    function statusInfo() {
        return {
            mode: usingDatabase() ? 'supabase' : 'local',
            pending: (PENDING.alerts ? PENDING.alerts.length : 0) + (PENDING.settings ? PENDING.settings.length : 0),
            lastSyncError
        };
    }

    return {
        getAlerts,
        saveAlerts,
        getSnoozeOptions,
        saveSnoozeOptions,
        getSoundOption,
        saveSoundOption,
        getSoundFile,
        saveSoundFile,
        getAvatar,
        saveAvatar,
        getLeads,
        saveLeads,
        getLeadObservations,
        getAllLeadObservations,
        saveLeadObservation,
        deleteLeadObservation,
        clearAll,
        usingDatabase,
        statusInfo
    };
})();
