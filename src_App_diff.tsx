--- src/App.tsx (原始)
import { useState, useEffect } from 'react';

interface Lead {
  id: string;
  nome: string;
  negocio: string;
  nicho: string;
  bairro: string;
  cidade: string;
  estado: string;
  endereco?: string;
  telefone?: string;
  instagram: string;
  seguidores: number;
  temSite: boolean;
  siteUrl?: string;
  googleReviews: number;
  rating?: number;
  score: number;
  status: 'novo' | 'contatado' | 'respondido' | 'reuniao' | 'fechado' | 'perdido';
  dataEncontrado: string;
  dataContato?: string;
  dataResposta?: string;
  mensagemEnviada?: string;
  resposta?: string;
  notas: string;
  email?: string;
  source: 'scraping' | 'csv' | 'manual' | 'import';
}

interface SearchConfig {
  cidade: string;
  estado: string;
  bairros: string[];
  nichos: string[];
  maxResults: number;
}

const bairrosPatoBranco = [
  'Centro', 'São Cristóvão', 'Novo Horizonte', 'Pinheirinho',
  'Banco Real', 'Centauro', 'Industrial', 'Samdnei',
  'Planalto', 'Alvorada', 'Jardim Floresta', 'Village',
  'Parque do Pinheiro', 'Cristo Rei', 'Bom Jesus'
];

const nichosSugeridos = [
  'Restaurante', 'Dentista', 'Pet Shop', 'Salão de Beleza',
  'Mecânica', 'Clínica', 'Academia', 'Padaria',
  'Farmácia', 'Advocacia', 'Contabilidade', 'Loja'
];

const API_URL = 'http://localhost:8000';

function App() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('leads');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchConfig, setSearchConfig] = useState<SearchConfig>(() => {
    const saved = localStorage.getItem('searchConfig');
    return saved ? JSON.parse(saved) : {
      cidade: 'Pato Branco',
      estado: 'PR',
      bairros: bairrosPatoBranco,
      nichos: nichosSugeridos.slice(0, 5),
      maxResults: 20
    };
  });

  const [activeView, setActiveView] = useState<'dashboard' | 'scraping' | 'leads' | 'generator' | 'settings'>('scraping');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados do scraping
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState('');
  const [scrapeResults, setScrapeResults] = useState<Lead[]>([]);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    localStorage.setItem('leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('searchConfig', JSON.stringify(searchConfig));
  }, [searchConfig]);

  // Verifica se o backend está online
  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  // Função principal de scraping
  const handleScrape = async () => {
    setIsScraping(true);
    setScrapeProgress('Iniciando busca...');
    setScrapeResults([]);

    try {
      // Verifica se o backend está online
      await checkBackendStatus();
      if (backendStatus === 'offline') {
        throw new Error('Backend offline. Execute: cd backend && python main.py');
      }

      const allResults: Lead[] = [];

      // Busca cada nicho selecionado
      for (let i = 0; i < searchConfig.nichos.length; i++) {
        const nicho = searchConfig.nichos[i];
        setScrapeProgress(`Buscando ${nicho}... (${i + 1}/${searchConfig.nichos.length})`);

        const response = await fetch(`${API_URL}/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: nicho,
            cidade: searchConfig.cidade,
            estado: searchConfig.estado,
            max_results: Math.floor(searchConfig.maxResults / searchConfig.nichos.length)
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Erro no scraping');
        }

        const results = await response.json();

        // Converte para formato de Lead
        const newLeads: Lead[] = results.map((r: any) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          nome: '',
          negocio: r.negocio,
          nicho: r.nicho,
          bairro: r.bairro || '',
          cidade: r.cidade,
          estado: r.estado,
          endereco: r.endereco || '',
          telefone: r.telefone || '',
          instagram: '',
          seguidores: 0,
          temSite: !!r.website,
          siteUrl: r.website || '',
          googleReviews: r.google_reviews || 0,
          rating: r.rating,
          score: calcularScore(r),
          status: 'novo',
          dataEncontrado: new Date().toISOString().split('T')[0],
          notas: `Encontrado via scraping em ${new Date().toLocaleString('pt-BR')}`,
          source: 'scraping'
        }));

        allResults.push(...newLeads);
        setScrapeResults([...allResults]);
      }

      setScrapeProgress(`✅ Concluído! ${allResults.length} leads encontrados.`);

    } catch (error: any) {
      console.error('Erro no scraping:', error);
      setScrapeProgress(`❌ Erro: ${error.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  // Calcula score do lead
  const calcularScore = (lead: any): number => {
    let score = 50;

    // Sem site = +30
    if (!lead.website) score += 30;

    // Poucas reviews = +15
    if (lead.google_reviews < 20) score += 15;
    else if (lead.google_reviews < 50) score += 5;

    // Rating alto = +5
    if (lead.rating && lead.rating >= 4) score += 5;

    return Math.min(score, 98);
  };

  // Salva resultados como leads
  const saveScrapeResults = () => {
    setLeads([...scrapeResults, ...leads]);
    setScrapeResults([]);
    setScrapeProgress('');
    alert(`✅ ${scrapeResults.length} leads salvos com sucesso!`);
  };

  const generateMessage = (lead: Lead): string => {
    if (!lead.temSite) {
      return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nVi que ${lead.negocio}${lead.bairro ? ` em ${lead.bairro}` : ''} ${lead.seguidores > 0 ? `tem ${lead.seguidores.toLocaleString()} seguidores no Instagram` : 'tem uma presença legal no Instagram'} — parabéns!\n\nNotei que quando busco "${lead.nicho.toLowerCase()} em ${lead.bairro || lead.cidade}" no Google, vocês não aparecem com site. Mas concorrentes da região aparecem.\n\n${lead.googleReviews > 15 ? `Vocês têm ${lead.googleReviews} reviews no Google${lead.rating ? ` (nota ${lead.rating})` : ''} — excelente reputação! Um site ajudaria a converter essa confiança em mais clientes.` : `Posso te mostrar como fazer vocês aparecerem no Google e atrair mais clientes?`}\n\nFiz um mockup rápido de como poderia ser o site de vocês. Quer dar uma olhada?`;
    } else {
      return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nEntrei no site de vocês (${lead.siteUrl}) e notei que ${lead.googleReviews < 15 ? `têm apenas ${lead.googleReviews} reviews no Google, enquanto concorrentes em ${lead.bairro || lead.cidade} têm 50+` : 'o site poderia estar mais otimizado para conversão'}.\n\nPosso te mostrar em 5 min como resolver isso e atrair mais clientes?`;
    }
  };

  const updateLeadStatus = (leadId: string, newStatus: Lead['status']) => {
    setLeads(leads.map(l =>
      l.id === leadId
        ? {
            ...l,
            status: newStatus,
            dataContato: newStatus === 'contatado' ? new Date().toISOString().split('T')[0] : l.dataContato,
            dataResposta: newStatus === 'respondido' ? new Date().toISOString().split('T')[0] : l.dataResposta
          }
        : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead({...selectedLead, status: newStatus});
    }
  };

  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads(leads.map(l => l.id === leadId ? { ...l, ...updates } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead({...selectedLead, ...updates});
    }
  };

  const stats = {
    total: leads.length,
    novos: leads.filter(l => l.status === 'novo').length,
    contatados: leads.filter(l => l.status === 'contatado').length,
    respondidos: leads.filter(l => l.status === 'respondido').length,
    reunioes: leads.filter(l => l.status === 'reuniao').length,
    fechados: leads.filter(l => l.status === 'fechado').length,
    taxaResposta: leads.filter(l => l.dataContato).length > 0
      ? Math.round((leads.filter(l => l.dataResposta).length / leads.filter(l => l.dataContato).length) * 100)
      : 0
  };

  const filteredLeads = leads.filter(lead => {
    const matchStatus = filterStatus === 'all' || lead.status === filterStatus;
    const matchSearch = searchTerm === '' ||
      lead.negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.bairro.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4 hidden lg:block overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-lg font-bold">
            🎯
          </div>
          <div>
            <div className="font-bold">LeadForge</div>
            <div className="text-xs text-gray-500">{searchConfig.cidade}/{searchConfig.estado}</div>
          </div>
        </div>

        <nav className="space-y-1">
          {[
            { key: 'scraping', icon: '🔄', label: 'Sincronizar' },
            { key: 'dashboard', icon: '📊', label: 'Dashboard' },
            { key: 'leads', icon: '🎯', label: `Leads (${leads.length})` },
            { key: 'generator', icon: '🤖', label: 'Gerador IA' },
            { key: 'settings', icon: '⚙️', label: 'Configurações' }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeView === item.key
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-8 p-4 bg-gradient-to-br from-green-900/20 to-emerald-900/10 border border-green-500/20 rounded-xl">
          <div className="text-xs text-green-400 font-semibold mb-1">💡 Status</div>
          <div className="text-xs text-gray-400">
            {backendStatus === 'online' ? '✅ Backend online' : '❌ Backend offline'}<br/>
            {leads.length} leads salvos
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-2 z-50">
        <div className="flex justify-around">
          {[
            { key: 'scraping', icon: '🔄', label: 'Sync' },
            { key: 'dashboard', icon: '📊', label: 'Dash' },
            { key: 'leads', icon: '🎯', label: 'Leads' },
            { key: 'generator', icon: '🤖', label: 'IA' },
            { key: 'settings', icon: '⚙️', label: 'Config' }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key as any)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs ${
                activeView === item.key ? 'text-green-400' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64 p-4 md:p-8 pb-24 lg:pb-8">

        {/* SCRAPING VIEW */}
        {activeView === 'scraping' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🔄 Sincronizar Leads</h1>
              <p className="text-gray-400 text-sm">Busca real de comércios via Google Maps</p>
            </div>

            {/* Backend Status */}
            {backendStatus === 'offline' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">❌</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-400 mb-2">Backend Offline</h3>
                    <p className="text-sm text-gray-400 mb-3">
                      Para usar o scraping, você precisa iniciar o backend Python primeiro.
                    </p>
                    <div className="bg-gray-900/50 rounded-lg p-3 font-mono text-xs text-gray-300 mb-3">
                      <div className="text-green-400"># No terminal, execute:</div>
                      <div>cd backend</div>
                      <div>pip install -r requirements.txt</div>
                      <div>playwright install chromium</div>
                      <div>python main.py</div>
                    </div>
                    <button
                      onClick={checkBackendStatus}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      🔄 Verificar Novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Configuração */}
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Configuração da Busca</h2>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Cidade</label>
                  <input
                    type="text"
                    value={searchConfig.cidade}
                    onChange={(e) => setSearchConfig({...searchConfig, cidade: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Estado</label>
                  <input
                    type="text"
                    value={searchConfig.estado}
                    onChange={(e) => setSearchConfig({...searchConfig, estado: e.target.value.toUpperCase()})}
                    maxLength={2}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">Nichos para buscar ({searchConfig.nichos.length} selecionados)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {searchConfig.nichos.map(nicho => (
                    <span key={nicho} className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs">
                      {nicho}
                      <button
                        onClick={() => setSearchConfig({
                          ...searchConfig,
                          nichos: searchConfig.nichos.filter(n => n !== nicho)
                        })}
                        className="ml-2 text-blue-400 hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  onChange={(e) => {
                    if (e.target.value && !searchConfig.nichos.includes(e.target.value)) {
                      setSearchConfig({
                        ...searchConfig,
                        nichos: [...searchConfig.nichos, e.target.value]
                      });
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                >
                  <option value="">+ Adicionar nicho...</option>
                  {nichosSugeridos.filter((n: string) => !searchConfig.nichos.includes(n)).map((n: string) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">
                  Máximo de resultados por nicho: {searchConfig.maxResults}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={searchConfig.maxResults}
                  onChange={(e) => setSearchConfig({...searchConfig, maxResults: parseInt(e.target.value)})}
                  className="w-full"
                />
              </div>

              {/* BOTÃO SINCRONIZAR */}
              <button
                onClick={handleScrape}
                disabled={isScraping || backendStatus === 'offline'}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-500/20"
              >
                {isScraping ? (
                  <>
                    <span className="animate-spin text-2xl">⚙️</span>
                    <span>Buscando no Google Maps...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">🔄</span>
                    <span>SINCRONIZAR LEADS</span>
                  </>
                )}
              </button>

              {/* Progress */}
              {scrapeProgress && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  scrapeProgress.includes('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                  scrapeProgress.includes('❌') ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                  'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}>
                  <div className="flex items-center gap-2">
                    {isScraping && <span className="animate-spin">⚙️</span>}
                    <span>{scrapeProgress}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Resultados */}
            {scrapeResults.length > 0 && (
              <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-green-400">
                    ✅ {scrapeResults.length} leads encontrados
                  </h2>
                  <button
                    onClick={saveScrapeResults}
                    className="px-6 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-bold transition-colors"
                  >
                    💾 Salvar Todos
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {scrapeResults.map(lead => (
                    <div key={lead.id} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/30">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-semibold text-white">{lead.negocio}</div>
                          <div className="text-xs text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                          {lead.endereco && <div className="text-xs text-gray-500 mt-1">📍 {lead.endereco}</div>}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                          lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-orange-500/10 text-orange-400'
                        }`}>
                          Score: {lead.score}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                        {lead.rating && <span>⭐ {lead.rating}/5</span>}
                        <span>💬 {lead.googleReviews} reviews</span>
                        <span>{lead.temSite ? '✅ Tem site' : '❌ Sem site'}</span>
                        {lead.telefone && <span>📞 {lead.telefone}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD */}
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">📊 Dashboard</h1>
              <p className="text-gray-400 text-sm">Visão geral da sua prospecção</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Total de Leads</div>
                <div className="text-2xl font-bold text-white">{stats.total}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Contatados</div>
                <div className="text-2xl font-bold text-blue-400">{stats.contatados}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Taxa de Resposta</div>
                <div className="text-2xl font-bold text-green-400">{stats.taxaResposta}%</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Reuniões</div>
                <div className="text-2xl font-bold text-purple-400">{stats.reunioes}</div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Pipeline de Vendas</h2>
              <div className="space-y-3">
                {[
                  { status: 'novo', label: 'Novos', count: stats.novos, color: 'bg-gray-500' },
                  { status: 'contatado', label: 'Contatados', count: stats.contatados, color: 'bg-blue-500' },
                  { status: 'respondido', label: 'Respondidos', count: stats.respondidos, color: 'bg-yellow-500' },
                  { status: 'reuniao', label: 'Em Reunião', count: stats.reunioes, color: 'bg-purple-500' },
                  { status: 'fechado', label: 'Fechados', count: stats.fechados, color: 'bg-green-500' }
                ].map(item => (
                  <div key={item.status} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                    <div className="flex-1 text-sm text-gray-300">{item.label}</div>
                    <div className="text-lg font-bold text-white">{item.count}</div>
                    <div className="w-32 bg-gray-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${item.color}`}
                        style={{ width: stats.total > 0 ? `${(item.count / stats.total) * 100}%` : '0%' }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LEADS */}
        {activeView === 'leads' && !selectedLead && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🎯 Leads</h1>
              <p className="text-gray-400 text-sm">{filteredLeads.length} leads</p>
            </div>

            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
            />

            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
              >
                <option value="all">Todos os status</option>
                <option value="novo">Novos</option>
                <option value="contatado">Contatados</option>
                <option value="respondido">Respondidos</option>
                <option value="reuniao">Em reunião</option>
                <option value="fechado">Fechados</option>
              </select>
            </div>

            {filteredLeads.length > 0 ? (
              <div className="space-y-3">
                {filteredLeads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 hover:border-green-500/30 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white">{lead.negocio}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                            lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-orange-500/10 text-orange-400'
                          }`}>
                            Score: {lead.score}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                        lead.status === 'novo' ? 'bg-gray-700/50 text-gray-300' :
                        lead.status === 'contatado' ? 'bg-blue-500/10 text-blue-400' :
                        lead.status === 'respondido' ? 'bg-yellow-500/10 text-yellow-400' :
                        lead.status === 'reuniao' ? 'bg-purple-500/10 text-purple-400' :
                        lead.status === 'fechado' ? 'bg-green-500/10 text-green-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {lead.status === 'novo' ? 'Novo' :
                         lead.status === 'contatado' ? 'Contatado' :
                         lead.status === 'respondido' ? 'Respondeu' :
                         lead.status === 'reuniao' ? 'Reunião' :
                         lead.status === 'fechado' ? 'Fechado' : 'Perdido'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {lead.telefone && <span>📞 {lead.telefone}</span>}
                      <span>{lead.temSite ? '✅ Site' : '❌ Sem site'}</span>
                      <span>⭐ {lead.googleReviews} reviews</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🎯</div>
                <h3 className="text-lg font-bold text-white mb-2">Nenhum lead encontrado</h3>
                <p className="text-gray-400 text-sm">
                  {leads.length === 0 ? 'Sincronize leads do Google Maps primeiro' : 'Tente ajustar os filtros'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* LEAD DETAIL */}
        {activeView === 'leads' && selectedLead && (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedLead(null)}
              className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1"
            >
              ← Voltar
            </button>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold mb-1">{selectedLead.negocio}</h1>
                  <div className="text-gray-400">{selectedLead.nicho} • {selectedLead.bairro || selectedLead.cidade}</div>
                </div>
                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  selectedLead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                  selectedLead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-orange-500/10 text-orange-400'
                }`}>
                  Score: {selectedLead.score}/100
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {selectedLead.telefone && (
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Telefone</div>
                    <div className="text-white">{selectedLead.telefone}</div>
                  </div>
                )}
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Google Reviews</div>
                  <div className="text-white">{selectedLead.googleReviews} avaliações {selectedLead.rating && `(${selectedLead.rating}/5)`}</div>
                  <div className="text-xs text-gray-500 mt-1">{selectedLead.temSite ? `Site: ${selectedLead.siteUrl}` : 'Sem site'}</div>
                </div>
              </div>

              <div className="mb-6 grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Nome do Responsável</label>
                  <input
                    type="text"
                    value={selectedLead.nome || ''}
                    onChange={(e) => updateLead(selectedLead.id, { nome: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Instagram</label>
                  <input
                    type="text"
                    value={selectedLead.instagram || ''}
                    onChange={(e) => updateLead(selectedLead.id, { instagram: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="text-sm font-semibold text-white mb-2">Status</div>
                <div className="flex flex-wrap gap-2">
                  {(['novo', 'contatado', 'respondido', 'reuniao', 'fechado', 'perdido'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => updateLeadStatus(selectedLead.id, status)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedLead.status === status
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {status === 'novo' ? 'Novo' :
                       status === 'contatado' ? 'Contatado' :
                       status === 'respondido' ? 'Respondeu' :
                       status === 'reuniao' ? 'Reunião' :
                       status === 'fechado' ? 'Fechado' : 'Perdido'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-white mb-2">Notas</div>
                <textarea
                  value={selectedLead.notas}
                  onChange={(e) => updateLead(selectedLead.id, { notas: e.target.value })}
                  className="w-full bg-gray-800/30 border border-gray-700/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-green-500/50"
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* GENERATOR */}
        {activeView === 'generator' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🤖 Gerador de Mensagens</h1>
              <p className="text-gray-400 text-sm">Mensagens personalizadas para seus leads</p>
            </div>

            {leads.filter(l => l.status === 'novo').length > 0 ? (
              <div className="space-y-4">
                {leads.filter(l => l.status === 'novo').slice(0, 10).map(lead => (
                  <div key={lead.id} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-white">{lead.negocio}</div>
                        <div className="text-xs text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                        lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-orange-500/10 text-orange-400'
                      }`}>
                        Score: {lead.score}
                      </span>
                    </div>
                    <div className="bg-gray-800/30 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap mb-3">
                      {generateMessage(lead)}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generateMessage(lead));
                        alert('Mensagem copiada!');
                      }}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      📋 Copiar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🤖</div>
                <h3 className="text-lg font-bold text-white mb-2">Nenhum lead novo</h3>
                <button
                  onClick={() => setActiveView('scraping')}
                  className="mt-4 px-6 py-3 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-colors"
                >
                  🔄 Sincronizar Leads
                </button>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {activeView === 'settings' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">⚙️ Configurações</h1>
              <p className="text-gray-400 text-sm">Personalize sua ferramenta</p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Backend</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Status</span>
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                    backendStatus === 'online' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {backendStatus === 'online' ? '✅ Online' : '❌ Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">URL</span>
                  <span className="text-sm text-white font-mono">{API_URL}</span>
                </div>
                <button
                  onClick={checkBackendStatus}
                  className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors"
                >
                  🔄 Verificar Conexão
                </button>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Dados</h2>
              <button
                onClick={() => {
                  if (confirm('Resetar todos os dados?')) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Resetar Dados
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;


+++ src/App.tsx (修改后)
import { useState, useEffect } from 'react';

interface Lead {
  id: string;
  nome: string;
  negocio: string;
  nicho: string;
  bairro: string;
  cidade: string;
  estado: string;
  endereco?: string;
  telefone?: string;
  instagram: string;
  seguidores: number;
  temSite: boolean;
  siteUrl?: string;
  googleReviews: number;
  rating?: number;
  score: number;
  status: 'novo' | 'contatado' | 'respondido' | 'reuniao' | 'fechado' | 'perdido';
  dataEncontrado: string;
  dataContato?: string;
  dataResposta?: string;
  mensagemEnviada?: string;
  resposta?: string;
  notas: string;
  email?: string;
  source: 'scraping' | 'csv' | 'manual' | 'import';
}

interface SearchConfig {
  cidade: string;
  estado: string;
  bairros: string[];
  nichos: string[];
  maxResults: number;
}

const bairrosPatoBranco = [
  'Centro', 'São Cristóvão', 'Novo Horizonte', 'Pinheirinho',
  'Banco Real', 'Centauro', 'Industrial', 'Samdnei',
  'Planalto', 'Alvorada', 'Jardim Floresta', 'Village',
  'Parque do Pinheiro', 'Cristo Rei', 'Bom Jesus'
];

const nichosSugeridos = [
  'Restaurante', 'Dentista', 'Pet Shop', 'Salão de Beleza',
  'Mecânica', 'Clínica', 'Academia', 'Padaria',
  'Farmácia', 'Advocacia', 'Contabilidade', 'Loja'
];

const API_URL = 'http://localhost:8000';

function App() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('leads');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchConfig, setSearchConfig] = useState<SearchConfig>(() => {
    const saved = localStorage.getItem('searchConfig');
    return saved ? JSON.parse(saved) : {
      cidade: 'Pato Branco',
      estado: 'PR',
      bairros: bairrosPatoBranco,
      nichos: nichosSugeridos.slice(0, 5),
      maxResults: 20
    };
  });

  const [activeView, setActiveView] = useState<'dashboard' | 'scraping' | 'leads' | 'generator' | 'settings'>('scraping');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados do scraping
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState('');
  const [scrapeResults, setScrapeResults] = useState<Lead[]>([]);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    localStorage.setItem('leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('searchConfig', JSON.stringify(searchConfig));
  }, [searchConfig]);

  // Verifica se o backend está online
  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  // Função principal de scraping
  const handleScrape = async () => {
    setIsScraping(true);
    setScrapeProgress('Iniciando busca...');
    setScrapeResults([]);

    try {
      // Verifica se o backend está online
      await checkBackendStatus();
      if (backendStatus === 'offline') {
        throw new Error('Backend offline. Execute: cd backend && python main.py');
      }

      const allResults: Lead[] = [];

      // Busca cada nicho selecionado
      for (let i = 0; i < searchConfig.nichos.length; i++) {
        const nicho = searchConfig.nichos[i];
        setScrapeProgress(`Buscando ${nicho}... (${i + 1}/${searchConfig.nichos.length})`);

        const response = await fetch(`${API_URL}/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: nicho,
            cidade: searchConfig.cidade,
            estado: searchConfig.estado,
            max_results: Math.floor(searchConfig.maxResults / searchConfig.nichos.length)
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Erro no scraping');
        }

        const results = await response.json();

        // Converte para formato de Lead
        const newLeads: Lead[] = results.map((r: any) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          nome: '',
          negocio: r.negocio,
          nicho: r.nicho,
          bairro: r.bairro || '',
          cidade: r.cidade,
          estado: r.estado,
          endereco: r.endereco || '',
          telefone: r.telefone || '',
          instagram: '',
          seguidores: 0,
          temSite: !!r.website,
          siteUrl: r.website || '',
          googleReviews: r.google_reviews || 0,
          rating: r.rating,
          score: calcularScore(r),
          status: 'novo',
          dataEncontrado: new Date().toISOString().split('T')[0],
          notas: `Encontrado via scraping em ${new Date().toLocaleString('pt-BR')}`,
          source: 'scraping'
        }));

        allResults.push(...newLeads);
        setScrapeResults([...allResults]);
      }

      setScrapeProgress(`✅ Concluído! ${allResults.length} leads encontrados.`);

    } catch (error: any) {
      console.error('Erro no scraping:', error);
      setScrapeProgress(`❌ Erro: ${error.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  // Calcula score do lead
  const calcularScore = (lead: any): number => {
    let score = 50;

    // Sem site = +30
    if (!lead.website) score += 30;

    // Poucas reviews = +15
    if (lead.google_reviews < 20) score += 15;
    else if (lead.google_reviews < 50) score += 5;

    // Rating alto = +5
    if (lead.rating && lead.rating >= 4) score += 5;

    return Math.min(score, 98);
  };

  // Salva resultados como leads
  const saveScrapeResults = () => {
    setLeads([...scrapeResults, ...leads]);
    setScrapeResults([]);
    setScrapeProgress('');
    alert(`✅ ${scrapeResults.length} leads salvos com sucesso!`);
  };

  const generateMessage = (lead: Lead): string => {
    if (!lead.temSite) {
      return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nVi que ${lead.negocio}${lead.bairro ? ` em ${lead.bairro}` : ''} ${lead.seguidores > 0 ? `tem ${lead.seguidores.toLocaleString()} seguidores no Instagram` : 'tem uma presença legal no Instagram'} — parabéns!\n\nNotei que quando busco "${lead.nicho.toLowerCase()} em ${lead.bairro || lead.cidade}" no Google, vocês não aparecem com site. Mas concorrentes da região aparecem.\n\n${lead.googleReviews > 15 ? `Vocês têm ${lead.googleReviews} reviews no Google${lead.rating ? ` (nota ${lead.rating})` : ''} — excelente reputação! Um site ajudaria a converter essa confiança em mais clientes.` : `Posso te mostrar como fazer vocês aparecerem no Google e atrair mais clientes?`}\n\nFiz um mockup rápido de como poderia ser o site de vocês. Quer dar uma olhada?`;
    } else {
      return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nEntrei no site de vocês (${lead.siteUrl}) e notei que ${lead.googleReviews < 15 ? `têm apenas ${lead.googleReviews} reviews no Google, enquanto concorrentes em ${lead.bairro || lead.cidade} têm 50+` : 'o site poderia estar mais otimizado para conversão'}.\n\nPosso te mostrar em 5 min como resolver isso e atrair mais clientes?`;
    }
  };

  const updateLeadStatus = (leadId: string, newStatus: Lead['status']) => {
    setLeads(leads.map(l =>
      l.id === leadId
        ? {
            ...l,
            status: newStatus,
            dataContato: newStatus === 'contatado' ? new Date().toISOString().split('T')[0] : l.dataContato,
            dataResposta: newStatus === 'respondido' ? new Date().toISOString().split('T')[0] : l.dataResposta
          }
        : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead({...selectedLead, status: newStatus});
    }
  };

  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads(leads.map(l => l.id === leadId ? { ...l, ...updates } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead({...selectedLead, ...updates});
    }
  };

  const stats = {
    total: leads.length,
    novos: leads.filter(l => l.status === 'novo').length,
    contatados: leads.filter(l => l.status === 'contatado').length,
    respondidos: leads.filter(l => l.status === 'respondido').length,
    reunioes: leads.filter(l => l.status === 'reuniao').length,
    fechados: leads.filter(l => l.status === 'fechado').length,
    taxaResposta: leads.filter(l => l.dataContato).length > 0
      ? Math.round((leads.filter(l => l.dataResposta).length / leads.filter(l => l.dataContato).length) * 100)
      : 0
  };

  const filteredLeads = leads.filter(lead => {
    const matchStatus = filterStatus === 'all' || lead.status === filterStatus;
    const matchSearch = searchTerm === '' ||
      lead.negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.bairro.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-lg font-bold">
            🎯
          </div>
          <div>
            <div className="font-bold">LeadForge</div>
            <div className="text-xs text-gray-500">{searchConfig.cidade}/{searchConfig.estado}</div>
          </div>
        </div>

        <nav className="space-y-1">
          {[
            { key: 'scraping', icon: '🔄', label: 'Sincronizar' },
            { key: 'dashboard', icon: '📊', label: 'Dashboard' },
            { key: 'leads', icon: '🎯', label: `Leads (${leads.length})` },
            { key: 'generator', icon: '🤖', label: 'Gerador IA' },
            { key: 'settings', icon: '⚙️', label: 'Configurações' }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeView === item.key
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-8 p-4 bg-gradient-to-br from-green-900/20 to-emerald-900/10 border border-green-500/20 rounded-xl">
          <div className="text-xs text-green-400 font-semibold mb-1">💡 Status</div>
          <div className="text-xs text-gray-400">
            {backendStatus === 'online' ? '✅ Backend online' : '❌ Backend offline'}<br/>
            {leads.length} leads salvos
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-4 md:p-8 pb-8">

        {/* SCRAPING VIEW */}
        {activeView === 'scraping' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🔄 Sincronizar Leads</h1>
              <p className="text-gray-400 text-sm">Busca real de comércios via Google Maps</p>
            </div>

            {/* Backend Status */}
            {backendStatus === 'offline' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">❌</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-400 mb-2">Backend Offline</h3>
                    <p className="text-sm text-gray-400 mb-3">
                      Para usar o scraping, você precisa iniciar o backend Python primeiro.
                    </p>
                    <div className="bg-gray-900/50 rounded-lg p-3 font-mono text-xs text-gray-300 mb-3">
                      <div className="text-green-400"># No terminal, execute:</div>
                      <div>cd backend</div>
                      <div>pip install -r requirements.txt</div>
                      <div>playwright install chromium</div>
                      <div>python main.py</div>
                    </div>
                    <button
                      onClick={checkBackendStatus}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      🔄 Verificar Novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Configuração */}
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Configuração da Busca</h2>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Cidade</label>
                  <input
                    type="text"
                    value={searchConfig.cidade}
                    onChange={(e) => setSearchConfig({...searchConfig, cidade: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Estado</label>
                  <input
                    type="text"
                    value={searchConfig.estado}
                    onChange={(e) => setSearchConfig({...searchConfig, estado: e.target.value.toUpperCase()})}
                    maxLength={2}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">Nichos para buscar ({searchConfig.nichos.length} selecionados)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {searchConfig.nichos.map(nicho => (
                    <span key={nicho} className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs">
                      {nicho}
                      <button
                        onClick={() => setSearchConfig({
                          ...searchConfig,
                          nichos: searchConfig.nichos.filter(n => n !== nicho)
                        })}
                        className="ml-2 text-blue-400 hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  onChange={(e) => {
                    if (e.target.value && !searchConfig.nichos.includes(e.target.value)) {
                      setSearchConfig({
                        ...searchConfig,
                        nichos: [...searchConfig.nichos, e.target.value]
                      });
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                >
                  <option value="">+ Adicionar nicho...</option>
                  {nichosSugeridos.filter((n: string) => !searchConfig.nichos.includes(n)).map((n: string) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">
                  Máximo de resultados por nicho: {searchConfig.maxResults}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={searchConfig.maxResults}
                  onChange={(e) => setSearchConfig({...searchConfig, maxResults: parseInt(e.target.value)})}
                  className="w-full"
                />
              </div>

              {/* BOTÃO SINCRONIZAR */}
              <button
                onClick={handleScrape}
                disabled={isScraping || backendStatus === 'offline'}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-500/20"
              >
                {isScraping ? (
                  <>
                    <span className="animate-spin text-2xl">⚙️</span>
                    <span>Buscando no Google Maps...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">🔄</span>
                    <span>SINCRONIZAR LEADS</span>
                  </>
                )}
              </button>

              {/* Progress */}
              {scrapeProgress && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  scrapeProgress.includes('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                  scrapeProgress.includes('❌') ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                  'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}>
                  <div className="flex items-center gap-2">
                    {isScraping && <span className="animate-spin">⚙️</span>}
                    <span>{scrapeProgress}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Resultados */}
            {scrapeResults.length > 0 && (
              <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-green-400">
                    ✅ {scrapeResults.length} leads encontrados
                  </h2>
                  <button
                    onClick={saveScrapeResults}
                    className="px-6 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-bold transition-colors"
                  >
                    💾 Salvar Todos
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {scrapeResults.map(lead => (
                    <div key={lead.id} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/30">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-semibold text-white">{lead.negocio}</div>
                          <div className="text-xs text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                          {lead.endereco && <div className="text-xs text-gray-500 mt-1">📍 {lead.endereco}</div>}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                          lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-orange-500/10 text-orange-400'
                        }`}>
                          Score: {lead.score}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                        {lead.rating && <span>⭐ {lead.rating}/5</span>}
                        <span>💬 {lead.googleReviews} reviews</span>
                        <span>{lead.temSite ? '✅ Tem site' : '❌ Sem site'}</span>
                        {lead.telefone && <span>📞 {lead.telefone}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD */}
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">📊 Dashboard</h1>
              <p className="text-gray-400 text-sm">Visão geral da sua prospecção</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Total de Leads</div>
                <div className="text-2xl font-bold text-white">{stats.total}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Contatados</div>
                <div className="text-2xl font-bold text-blue-400">{stats.contatados}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Taxa de Resposta</div>
                <div className="text-2xl font-bold text-green-400">{stats.taxaResposta}%</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Reuniões</div>
                <div className="text-2xl font-bold text-purple-400">{stats.reunioes}</div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Pipeline de Vendas</h2>
              <div className="space-y-3">
                {[
                  { status: 'novo', label: 'Novos', count: stats.novos, color: 'bg-gray-500' },
                  { status: 'contatado', label: 'Contatados', count: stats.contatados, color: 'bg-blue-500' },
                  { status: 'respondido', label: 'Respondidos', count: stats.respondidos, color: 'bg-yellow-500' },
                  { status: 'reuniao', label: 'Em Reunião', count: stats.reunioes, color: 'bg-purple-500' },
                  { status: 'fechado', label: 'Fechados', count: stats.fechados, color: 'bg-green-500' }
                ].map(item => (
                  <div key={item.status} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                    <div className="flex-1 text-sm text-gray-300">{item.label}</div>
                    <div className="text-lg font-bold text-white">{item.count}</div>
                    <div className="w-32 bg-gray-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${item.color}`}
                        style={{ width: stats.total > 0 ? `${(item.count / stats.total) * 100}%` : '0%' }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LEADS */}
        {activeView === 'leads' && !selectedLead && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🎯 Leads</h1>
              <p className="text-gray-400 text-sm">{filteredLeads.length} leads</p>
            </div>

            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
            />

            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
              >
                <option value="all">Todos os status</option>
                <option value="novo">Novos</option>
                <option value="contatado">Contatados</option>
                <option value="respondido">Respondidos</option>
                <option value="reuniao">Em reunião</option>
                <option value="fechado">Fechados</option>
              </select>
            </div>

            {filteredLeads.length > 0 ? (
              <div className="space-y-3">
                {filteredLeads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 hover:border-green-500/30 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white">{lead.negocio}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                            lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-orange-500/10 text-orange-400'
                          }`}>
                            Score: {lead.score}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                        lead.status === 'novo' ? 'bg-gray-700/50 text-gray-300' :
                        lead.status === 'contatado' ? 'bg-blue-500/10 text-blue-400' :
                        lead.status === 'respondido' ? 'bg-yellow-500/10 text-yellow-400' :
                        lead.status === 'reuniao' ? 'bg-purple-500/10 text-purple-400' :
                        lead.status === 'fechado' ? 'bg-green-500/10 text-green-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {lead.status === 'novo' ? 'Novo' :
                         lead.status === 'contatado' ? 'Contatado' :
                         lead.status === 'respondido' ? 'Respondeu' :
                         lead.status === 'reuniao' ? 'Reunião' :
                         lead.status === 'fechado' ? 'Fechado' : 'Perdido'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {lead.telefone && <span>📞 {lead.telefone}</span>}
                      <span>{lead.temSite ? '✅ Site' : '❌ Sem site'}</span>
                      <span>⭐ {lead.googleReviews} reviews</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🎯</div>
                <h3 className="text-lg font-bold text-white mb-2">Nenhum lead encontrado</h3>
                <p className="text-gray-400 text-sm">
                  {leads.length === 0 ? 'Sincronize leads do Google Maps primeiro' : 'Tente ajustar os filtros'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* LEAD DETAIL */}
        {activeView === 'leads' && selectedLead && (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedLead(null)}
              className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1"
            >
              ← Voltar
            </button>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold mb-1">{selectedLead.negocio}</h1>
                  <div className="text-gray-400">{selectedLead.nicho} • {selectedLead.bairro || selectedLead.cidade}</div>
                </div>
                <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  selectedLead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                  selectedLead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-orange-500/10 text-orange-400'
                }`}>
                  Score: {selectedLead.score}/100
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {selectedLead.telefone && (
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Telefone</div>
                    <div className="text-white">{selectedLead.telefone}</div>
                  </div>
                )}
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Google Reviews</div>
                  <div className="text-white">{selectedLead.googleReviews} avaliações {selectedLead.rating && `(${selectedLead.rating}/5)`}</div>
                  <div className="text-xs text-gray-500 mt-1">{selectedLead.temSite ? `Site: ${selectedLead.siteUrl}` : 'Sem site'}</div>
                </div>
              </div>

              <div className="mb-6 grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Nome do Responsável</label>
                  <input
                    type="text"
                    value={selectedLead.nome || ''}
                    onChange={(e) => updateLead(selectedLead.id, { nome: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Instagram</label>
                  <input
                    type="text"
                    value={selectedLead.instagram || ''}
                    onChange={(e) => updateLead(selectedLead.id, { instagram: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-sm text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="text-sm font-semibold text-white mb-2">Status</div>
                <div className="flex flex-wrap gap-2">
                  {(['novo', 'contatado', 'respondido', 'reuniao', 'fechado', 'perdido'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => updateLeadStatus(selectedLead.id, status)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedLead.status === status
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {status === 'novo' ? 'Novo' :
                       status === 'contatado' ? 'Contatado' :
                       status === 'respondido' ? 'Respondeu' :
                       status === 'reuniao' ? 'Reunião' :
                       status === 'fechado' ? 'Fechado' : 'Perdido'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-white mb-2">Notas</div>
                <textarea
                  value={selectedLead.notas}
                  onChange={(e) => updateLead(selectedLead.id, { notas: e.target.value })}
                  className="w-full bg-gray-800/30 border border-gray-700/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-green-500/50"
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* GENERATOR */}
        {activeView === 'generator' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🤖 Gerador de Mensagens</h1>
              <p className="text-gray-400 text-sm">Mensagens personalizadas para seus leads</p>
            </div>

            {leads.filter(l => l.status === 'novo').length > 0 ? (
              <div className="space-y-4">
                {leads.filter(l => l.status === 'novo').slice(0, 10).map(lead => (
                  <div key={lead.id} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-white">{lead.negocio}</div>
                        <div className="text-xs text-gray-400">{lead.nicho} • {lead.bairro || lead.cidade}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        lead.score >= 85 ? 'bg-green-500/10 text-green-400' :
                        lead.score >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-orange-500/10 text-orange-400'
                      }`}>
                        Score: {lead.score}
                      </span>
                    </div>
                    <div className="bg-gray-800/30 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap mb-3">
                      {generateMessage(lead)}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generateMessage(lead));
                        alert('Mensagem copiada!');
                      }}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      📋 Copiar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🤖</div>
                <h3 className="text-lg font-bold text-white mb-2">Nenhum lead novo</h3>
                <button
                  onClick={() => setActiveView('scraping')}
                  className="mt-4 px-6 py-3 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-colors"
                >
                  🔄 Sincronizar Leads
                </button>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {activeView === 'settings' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">⚙️ Configurações</h1>
              <p className="text-gray-400 text-sm">Personalize sua ferramenta</p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Backend</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Status</span>
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                    backendStatus === 'online' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {backendStatus === 'online' ? '✅ Online' : '❌ Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">URL</span>
                  <span className="text-sm text-white font-mono">{API_URL}</span>
                </div>
                <button
                  onClick={checkBackendStatus}
                  className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors"
                >
                  🔄 Verificar Conexão
                </button>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Dados</h2>
              <button
                onClick={() => {
                  if (confirm('Resetar todos os dados?')) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Resetar Dados
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
