# Grupo Aureos | Alerta de LEADS

Sistema de gerenciamento de alertas e leads com **push em tela cheia**, adiamento, histórico, follow-up de 24h e integração com WhatsApp.

## Como rodar

```bash
npm run dev
```

Depois abra **http://localhost:3000** no navegador.

> O app precisa de um servidor (não basta abrir o arquivo direto) para o Service Worker do PWA funcionar.

## Estrutura do projeto

```
CUBO ALERTA/
├── index.html              → Estrutura da página (somente HTML)
├── css/
│   └── styles.css          → Estilos customizados (tema, scrollbar, animações)
├── js/
│   ├── config.js           → 🔑 URL + chave anon do Supabase (colar aqui)
│   ├── storage.js          → 🗄️ CAMADA DE DADOS (Supabase + fallback localStorage)
│   └── app.js              → Toda a lógica do aplicativo
├── supabase/
│   └── schema.sql          → 🗄️ SQL para criar as tabelas (rodar no Supabase)
├── sw.js                   → Service Worker (offline + cache)
├── pwa/
│   ├── manifest.webmanifest → Configuração de instalação do PWA
│   └── icons/               → Ícones do app (192, 512 e maskable)
├── scripts/
│   └── generate-icons.js    → Gera os ícones PNG (sem dependências)
├── netlify.toml            → Configuração de deploy no Netlify
├── package.json
└── README.md
```

## 🗄️ Banco de dados (Supabase - projeto "CuboAlertas")

✅ **Conectado e ativo** — as credenciais já estão em `js/config.js` e o
`supabase/schema.sql` já foi aplicado no projeto **CuboAlertas**
(ref `ejnjlnicmnuqkgwvvlrj`).

Todos os alertas, configurações, som e avatar são salvos no banco **e**
no navegador (offline) em tempo real, com fila de pendências e retry
automático — nada se perde.

Para recriar o banco do zero (se um dia precisar), rode o conteúdo de
`supabase/schema.sql` no **SQL Editor** do Supabase.

As credenciais vivem em `js/config.js`:

```js
const CONFIG = {
    SUPABASE_URL: 'https://ejnjlnicmnuqkgwvvlrj.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOi...' // chave pública anon
};
```

> 🔒 Segurança: a chave "anon" é pública por natureza (fica no app).
> A proteção vem das políticas de acesso do `schema.sql`. Para uso
> com login de usuário no futuro, troque as policies por `auth.uid()`.

### Estrutura de um alerta (tabela `alerts`)

| Campo no app | Coluna no banco |
|---|---|
| `id` | `id` (chave primária) |
| `name`, `phone`, `subject` | mesmos nomes |
| `date`, `time`, `category`, `notes` | mesmos nomes |
| `status` | `status` (`pending` / `completed`) |
| `createdAt` | `created_at` |
| `completedAt` | `completed_at` |
| `completionNotes` | `completion_notes` |

## 📱 PWA (instalação no celular/desktop)

O app já está pronto para ser instalado:
- `pwa/manifest.webmanifest` — nome, cores e ícones
- `sw.js` — deixa o app funcionando offline

**Para publicar mudanças:** incremente o `CACHE_VERSION` no topo do `sw.js` (ex.: `v1` → `v2`).

**Para instalar no celular:** o site precisa estar em **HTTPS** (ou `localhost`). Ao publicar,
verifique se o certificado SSL está ativo para o "Adicionar à tela inicial" funcionar.

Ícones: rode `npm run icons` para regenerar o ícone "GA" (badge com gradiente + letras), ou substitua os PNGs em `pwa/icons/` pelos seus.

## 🚀 Publicar no Netlify

1. O código já está no GitHub (repositório `cubo-alerta`).
2. No Netlify: **Add new site → Import an existing project → GitHub**
3. Escolha o repositório e confirme:
   - **Build command:** deixe vazio
   - **Publish directory:** `.` (ponto)
4. **Deploy** — pronto! O HTTPS vem automático.

Para atualizar depois: é só dar `git push` no repositório que o Netlify
republica sozinho.

## ⚙️ Funcionalidades

- ✅ Criar alertas com agendamento rápido (+15m, +30m, +1h)
- ✅ **Editar alerta** (lápis no card): abre o formulário preenchido para corrigir dados
- ✅ **Excluir alerta** (lixeira no card): remove com confirmação, tanto no dashboard quanto no relatório
- ✅ **Amanhã 9h**: agenda automaticamente para as 09:00 do dia seguinte
- ✅ **Finde**: agenda para a segunda-feira às 09:30 (fim de semana)
- ✅ Push em tela cheia centralizado, com categoria, badge Agora/Atrasado e brilho animado
- ✅ **Som do alerta configurável** (Configurações): toque de chamada de rede social (padrão), alarme, notificação ou silencioso + botão "Testar"
- ✅ Adiar alerta (tempos configuráveis em Configurações)
- ✅ Fluxo de conclusão obrigatório com notas
- ✅ Follow-up automático de 24h
- ✅ **Relatório administrativo com senha (123)** e botão "Sair"
- ✅ **Relatório em lista** com filtros por período (Hoje / Semana / Mês / Todos) e exportar CSV
- ✅ **Banner de instalação do PWA** no topo ("Baixar app")
- ✅ Salvamento em tempo real: dados vão para o Supabase com fila de pendências, retry automático e envio ao fechar a aba (nada se perde)
- ✅ Busca, abas (Todos / Histórico / Concluídos / Configurações)
- ✅ Perfil com upload de foto (avatar)
