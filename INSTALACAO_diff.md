--- INSTALACAO.md (原始)


+++ INSTALACAO.md (修改后)
# 🚀 Guia de Instalação Rápida - LeadForge

## ⚡ Instalação em 5 Minutos

### **Passo 1: Instalar Backend Python**

```bash
# 1. Navegue até a pasta backend
cd backend

# 2. Crie ambiente virtual (recomendado)
python -m venv venv

# 3. Ative o ambiente virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 4. Instale dependências
pip install -r requirements.txt

# 5. Instale Playwright + Chromium
playwright install chromium
```

### **Passo 2: Iniciar Backend**

```bash
# Na pasta backend, com ambiente virtual ativado:
python main.py
```

Você verá:
```
🚀 Iniciando LeadForge Scraper API...
📍 API disponível em: http://localhost:8000
📚 Documentação em: http://localhost:8000/docs
```

**⚠️ DEIXE O BACKEND RODANDO!**

### **Passo 3: Iniciar Frontend (em outro terminal)**

```bash
# Na raiz do projeto (abra novo terminal):
npm install
npm run dev
```

Frontend vai abrir em: `http://localhost:5173`

### **Passo 4: Usar!**

1. Abra `http://localhost:5173` no navegador
2. Vá em **"🔄 Sincronizar"**
3. Configure cidade/nichos
4. Clique em **"🔄 SINCRONIZAR LEADS"**
5. Aguarde (1-2 minutos)
6. Clique em **"💾 Salvar Todos"**
7. Pronto! Leads salvos!

---

## 🎯 Exemplo de Uso

### **Configuração Padrão:**
- Cidade: Pato Branco
- Estado: PR
- Nichos: Restaurante, Dentista, Pet Shop, Salão de Beleza, Mecânica
- Max results: 20 por nicho

### **Resultado Esperado:**
- ~100 leads encontrados (20 por nicho × 5 nichos)
- Dados: nome, endereço, telefone, reviews, rating, site
- Score calculado automaticamente (50-98)
- Tempo: ~5-10 minutos

---

## ⚠️ Problemas Comuns

### **"Backend offline"**
```bash
# Verifique se o backend está rodando:
# Terminal 1 deve estar com: python main.py

# Teste no navegador:
http://localhost:8000/health

# Deve retornar: {"status":"healthy"}
```

### **"Erro no scraping"**
```bash
# Reinstale o Playwright:
playwright install chromium

# Verifique se o Chromium foi instalado:
# Deve aparecer em: ~/.cache/ms-playwright/ (Linux/Mac)
# Ou: %USERPROFILE%\AppData\Local\ms-playwright\ (Windows)
```

### **"Porta 8000 em uso"**
```bash
# Mate o processo na porta 8000:
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:8000 | xargs kill -9
```

---

## 📊 O que o Sistema Faz

### **Busca Real no Google Maps:**
1. Abre navegador Chromium (headless)
2. Navega para Google Maps
3. Busca: "{nicho} em {cidade} {estado}"
4. Faz scroll para carregar resultados
5. Extrai dados de cada negócio:
   - Nome
   - Endereço
   - Telefone
   - Website
   - Rating (estrelas)
   - Número de reviews
6. Retorna JSON com todos os dados

### **Frontend:**
1. Recebe dados do backend
2. Converte para formato de Lead
3. Calcula score (50-98) baseado em:
   - Tem site? (+30 se não tiver)
   - Poucas reviews? (+15 se < 20)
   - Rating alto? (+5 se >= 4)
4. Mostra na tela
5. Usuário clica "Salvar Todos"
6. Salva no localStorage

---

## 🎨 Interface

### **Tela de Sincronização:**
- Configuração de cidade/estado
- Seleção de nichos (tags removíveis)
- Slider para max results
- **Botão grande "🔄 SINCRONIZAR LEADS"**
- Progress em tempo real
- Preview dos resultados

### **Dashboard:**
- Total de leads
- Contatados
- Taxa de resposta
- Reuniões
- Pipeline visual

### **Gestão de Leads:**
- Lista com filtros
- Score de qualidade
- Status (Novo → Contatado → Respondeu → Reunião → Fechado)
- Edição de campos
- Notas

### **Gerador de Mensagens:**
- Mensagens personalizadas
- Dados reais do lead
- Botão "Copiar"

---

## 💡 Dicas

### **Para não ser bloqueado:**
- Busque no máximo 3-5 nichos por vez
- Aguarde 1-2 minutos entre buscas
- Use `max_results: 20` por nicho

### **Para melhores resultados:**
- Nichos específicos: "dentista", "pet shop", "salão de beleza"
- Combine com filtros (bairro, reviews)
- Enriqueça com Instagram manualmente

### **Para escalar:**
- Quando fechar 10+ clientes:
  - Apify Google Maps Scraper (US$5/mês)
  - Backend com fila (Redis)
  - Banco de dados real (Supabase)

---

## 📁 Estrutura

```
leadforge/
├── backend/
│   ├── main.py              # API FastAPI + Playwright
│   ├── requirements.txt     # Dependências Python
│   └── README.md           # Documentação backend
├── src/
│   ├── App.tsx             # Frontend React
│   ├── main.tsx            # Entry point
│   └── index.css           # Estilos
├── package.json            # Dependências Node
└── README.md               # Este arquivo
```

---

## 🔧 Tecnologias

### **Backend:**
- FastAPI (API web)
- Playwright (scraping)
- Chromium (navegador headless)
- Uvicorn (servidor)

### **Frontend:**
- React 18
- TypeScript
- Tailwind CSS
- Vite

---

## ⚠️ Avisos

### **Legal:**
- Scraping viola Termos de Uso do Google
- Use apenas para uso pessoal/educacional
- Para uso comercial: API oficial ou serviços pagos

### **Performance:**
- Scraping pode ser lento (1-2 min por busca)
- Google pode bloquear IP (muitas requisições)
- Use com moderação

---

## 🎉 Pronto!

**Agora você tem:**
- ✅ Backend com scraping REAL
- ✅ Frontend com botão "Sincronizar"
- ✅ Sistema completo de gestão
- ✅ Gerador de mensagens
- ✅ Tudo funcionando!

**Próximo passo:**
1. Instale o backend
2. Inicie o backend
3. Inicie o frontend
4. Clique em "Sincronizar"
5. Comece a prospectar!

**Bora fazer caixa!** 💪🚀
