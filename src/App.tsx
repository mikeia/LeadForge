import { useEffect, useState } from 'react';

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

  useEffect(() => {
    void checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      const online = response.ok;
      setBackendStatus(online ? 'online' : 'offline');
      return online;
    } catch {
      setBackendStatus('offline');
      return false;
    }
  };

  const deduplicarLeads = (items: Lead[]): Lead[] => {
    const vistos = new Set<string>();
    return items.filter((lead) => {
      const chave = `${lead.negocio.trim().toLowerCase()}|${lead.cidade.trim().toLowerCase()}|${lead.estado.trim().toLowerCase()}`;
      if (vistos.has(chave)) {
        return false;
      }
      vistos.add(chave);
      return true;
    });
  };

  const calcularScore = (lead: any): number => {
    let score = 50;
    if (!lead.website) score += 30;
    if (lead.google_reviews < 20) score += 15;
    else if (lead.google_reviews < 50) score += 5;
    if (lead.rating && lead.rating >= 4) score += 5;
    return Math.min(score, 98);
  };

  const handleScrape = async () => {
    if (searchConfig.nichos.length === 0) {
      alert('Selecione pelo menos um nicho para buscar.');
      return;
    }

    setIsScraping(true);
    setScrapeProgress('Iniciando busca...');
    setScrapeResults([]);

    try {
      const backendOnline = await checkBackendStatus();
      if (!backendOnline) {
        throw new Error('Backend offline. Execute: cd backend && python main.py');
      }

      const allResults: Lead[] = [];

      for (let i = 0; i < searchConfig.nichos.length; i++) {
        const nicho = searchConfig.nichos[i];
        setScrapeProgress(`Buscando ${nicho}... (${i + 1}/${searchConfig.nichos.length})`);

        const response = await fetch(`${API_URL}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: nicho,
            cidade: searchConfig.cidade,
            estado: searchConfig.estado,
            max_results: Math.max(1, Math.floor(searchConfig.maxResults / searchConfig.nichos.length))
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Erro no scraping');
        }

        const results = await response.json();
        if (!Array.isArray(results) || results.length === 0) {
          setScrapeProgress(`⚠️ Busca bloqueada pelo Google Maps para "${nicho}". Tente outro nicho ou aguarde alguns minutos.`);
          continue;
        }

        const newLeads: Lead[] = results.map((r: any) => ({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
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

        const uniqueNewLeads = deduplicarLeads(newLeads);
        allResults.push(...uniqueNewLeads);
        setScrapeResults([...deduplicarLeads(allResults)]);
      }

      if (allResults.length === 0) {
        setScrapeProgress('⚠️ Nenhum lead encontrado. O Google Maps pode ter bloqueado a busca ou não há resultados para este filtro.');
        return;
      }

      setScrapeProgress(`✅ Concluído! ${allResults.length} leads encontrados.`);
    } catch (error: any) {
      console.error('Erro no scraping:', error);
      setScrapeProgress(`❌ Erro: ${error.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  const saveScrapeResults = () => {
    const uniqueResults = deduplicarLeads(scrapeResults);
    if (uniqueResults.length === 0) {
      alert('Nenhum lead novo para salvar.');
      return;
    }

    const existingKeys = new Set(leads.map((lead) => `${lead.negocio.trim().toLowerCase()}|${lead.cidade.trim().toLowerCase()}|${lead.estado.trim().toLowerCase()}`));
    const toSave = uniqueResults.filter((lead) => !existingKeys.has(`${lead.negocio.trim().toLowerCase()}|${lead.cidade.trim().toLowerCase()}|${lead.estado.trim().toLowerCase()}`));

    if (toSave.length === 0) {
      setScrapeResults([]);
      setScrapeProgress('');
      alert('✅ Todos os leads já estavam salvos.');
      return;
    }

    setLeads((current) => [...toSave, ...current]);
    setScrapeResults([]);
    setScrapeProgress('');
    alert(`✅ ${toSave.length} leads salvos com sucesso!`);
  };

  const generateMessage = (lead: Lead): string => {
    if (!lead.temSite) {
      return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nVi que ${lead.negocio}${lead.bairro ? ` em ${lead.bairro}` : ''} ${lead.seguidores > 0 ? `tem ${lead.seguidores.toLocaleString()} seguidores no Instagram` : 'tem uma presença legal no Instagram'} — parabéns!\n\nNotei que quando busco "${lead.nicho.toLowerCase()} em ${lead.bairro || lead.cidade}" no Google, vocês não aparecem com site. Mas concorrentes da região aparecem.\n\n${lead.googleReviews > 15 ? `Vocês têm ${lead.googleReviews} reviews no Google${lead.rating ? ` (nota ${lead.rating})` : ''} — excelente reputação! Um site ajudaria a converter essa confiança em mais clientes.` : `Posso te mostrar como fazer vocês aparecerem no Google e atrair mais clientes?`}\n\nFiz um mockup rápido de como poderia ser o site de vocês. Quer dar uma olhada?`;
    }

    return `Oi${lead.nome ? `, ${lead.nome.split(' ')[0]}` : ''}! 👋\n\nEntrei no site de vocês (${lead.siteUrl}) e notei que ${lead.googleReviews < 15 ? `têm apenas ${lead.googleReviews} reviews no Google, enquanto concorrentes em ${lead.bairro || lead.cidade} têm 50+` : 'o site poderia estar mais otimizado para conversão'}.\n\nPosso te mostrar em 5 min como resolver isso e atrair mais clientes?`;
  };

  const updateLeadStatus = (leadId: string, newStatus: Lead['status']) => {
    setLeads((current) => current.map((lead) =>
      lead.id === leadId
        ? {
            ...lead,
            status: newStatus,
            dataContato: newStatus === 'contatado' ? new Date().toISOString().split('T')[0] : lead.dataContato,
            dataResposta: newStatus === 'respondido' ? new Date().toISOString().split('T')[0] : lead.dataResposta
          }
        : lead
    ));

    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, status: newStatus });
    }
  };

  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, ...updates } : lead));
    if (selectedLead?.id === leadId) {
      setSelectedLead({ ...selectedLead, ...updates });
    }
  };

  const stats = {
    total: leads.length,
    novos: leads.filter((lead) => lead.status === 'novo').length,
    contatados: leads.filter((lead) => lead.status === 'contatado').length,
    respondidos: leads.filter((lead) => lead.status === 'respondido').length,
    reunioes: leads.filter((lead) => lead.status === 'reuniao').length,
    fechados: leads.filter((lead) => lead.status === 'fechado').length,
    taxaResposta: leads.filter((lead) => lead.dataContato).length > 0
      ? Math.round((leads.filter((lead) => lead.dataResposta).length / leads.filter((lead) => lead.dataContato).length) * 100)
      : 0
  };

  const filteredLeads = leads.filter((lead) => {
    const matchStatus = filterStatus === 'all' || lead.status === filterStatus;
    const matchSearch = searchTerm === '' ||
      lead.negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.bairro.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  useEffect(() => {
    if (!filteredLeads.length) {
      setSelectedLead(null);
      return;
    }

    const hasSelectedLead = selectedLead && filteredLeads.some((lead) => lead.id === selectedLead.id);
    if (!hasSelectedLead) {
      setSelectedLead(filteredLeads[0]);
    }
  }, [filteredLeads, selectedLead]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
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
          ].map((item) => (
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
            {backendStatus === 'online' ? '✅ Backend online' : '❌ Backend offline'}<br />
            {leads.length} leads salvos
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-2 z-50">
        <div className="flex justify-around">
          {[
            { key: 'scraping', icon: '🔄', label: 'Sync' },
            { key: 'dashboard', icon: '📊', label: 'Dash' },
            { key: 'leads', icon: '🎯', label: 'Leads' },
            { key: 'generator', icon: '🤖', label: 'IA' },
            { key: 'settings', icon: '⚙️', label: 'Config' }
          ].map((item) => (
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

      <div className="lg:ml-64 p-4 md:p-8 pb-24 lg:pb-8">
        {activeView === 'scraping' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">🔄 Sincronizar Leads</h1>
              <p className="text-gray-400 text-sm">Busca real de comércios via Google Maps</p>
            </div>

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
                      <div>python main.py</div>
                    </div>
                    <button
                      onClick={() => void checkBackendStatus()}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      🔄 Verificar Novamente
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4">Configuração da Busca</h2>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Cidade</label>
                  <input
                    type="text"
                    value={searchConfig.cidade}
                    onChange={(e) => setSearchConfig({ ...searchConfig, cidade: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Estado</label>
                  <input
                    type="text"
                    value={searchConfig.estado}
                    onChange={(e) => setSearchConfig({ ...searchConfig, estado: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">Nichos para buscar ({searchConfig.nichos.length} selecionados)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {searchConfig.nichos.map((nicho) => (
                    <span key={nicho} className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs">
                      {nicho}
                      <button
                        onClick={() => setSearchConfig({
                          ...searchConfig,
                          nichos: searchConfig.nichos.filter((item) => item !== nicho)
                        })}
                        className="ml-2 text-blue-400 hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    if (!searchConfig.nichos.includes(value)) {
                      setSearchConfig({ ...searchConfig, nichos: [...searchConfig.nichos, value] });
                    }
                    e.target.value = '';
                  }}
                  className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                >
                  <option value="">Adicionar nicho...</option>
                  {nichosSugeridos.filter((item) => !searchConfig.nichos.includes(item)).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Máximo por nicho</label>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={searchConfig.maxResults}
                    onChange={(e) => setSearchConfig({ ...searchConfig, maxResults: Number(e.target.value) || 20 })}
                    className="w-full px-4 py-2 bg-gray-800/30 border border-gray-700/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Bairros</label>
                  <div className="text-xs text-gray-400 mt-2">
                    {searchConfig.bairros.slice(0, 5).join(', ')}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void handleScrape()}
                disabled={isScraping || backendStatus === 'offline'}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScraping ? '🔄 Buscando...' : '🔄 SINCRONIZAR LEADS'}
              </button>

              {scrapeProgress && (
                <div className="mt-4 rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-sm text-gray-300">
                  {scrapeProgress}
                </div>
              )}

              {scrapeResults.length > 0 && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={saveScrapeResults}
                    className="px-4 py-2 bg-emerald-500 text-black rounded-lg font-semibold"
                  >
                    💾 Salvar Todos
                  </button>
                  <button
                    onClick={() => setScrapeResults([])}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">📊 Dashboard</h1>
            </div>
            <div className="grid md:grid-cols-5 gap-4">
              {[
                ['Total', stats.total],
                ['Novos', stats.novos],
                ['Contatados', stats.contatados],
                ['Respondidos', stats.respondidos],
                ['Taxa', `${stats.taxaResposta}%`]
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-xs text-gray-400 uppercase">{label}</div>
                  <div className="text-2xl font-bold mt-2">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'leads' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h1 className="text-2xl font-bold">🎯 Leads</h1>
              <input
                type="text"
                placeholder="Buscar por nome, bairro ou negócio"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-80 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              />
            </div>

            <div className="grid xl:grid-cols-[1.65fr_0.95fr] gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {filteredLeads.length === 0 ? (
                  <div className="p-6 text-gray-400">Nenhum lead encontrado.</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {filteredLeads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className={`w-full text-left p-4 transition-colors ${selectedLead?.id === lead.id ? 'bg-green-500/10 border-l-2 border-green-500' : 'hover:bg-gray-800/70'}`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="font-bold text-lg text-white">{lead.negocio}</div>
                            <div className="text-sm text-gray-400">{lead.nicho} • {lead.bairro || 'Sem bairro'}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold">Score {lead.score}</span>
                            <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 text-xs capitalize">{lead.status}</span>
                          </div>
                        </div>

                        <div className="mt-3 grid md:grid-cols-3 gap-2 text-xs text-gray-300">
                          <div>
                            <span className="text-gray-500 block mb-1">Cidade</span>
                            {lead.cidade}/{lead.estado}
                          </div>
                          <div>
                            <span className="text-gray-500 block mb-1">Website</span>
                            {lead.temSite ? 'Sim' : 'Não'}
                          </div>
                          <div>
                            <span className="text-gray-500 block mb-1">Google</span>
                            {lead.googleReviews || 0} reviews · {lead.rating ? `${lead.rating.toFixed(1)}★` : 'Sem nota'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                {selectedLead ? (
                  <div className="space-y-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Detalhes</div>
                      <div className="text-2xl font-bold text-white">{selectedLead.negocio}</div>
                      <div className="text-sm text-gray-400">{selectedLead.nicho}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-800/60 rounded-lg p-3">
                        <div className="text-gray-500 text-xs">Cidade</div>
                        <div className="mt-1 font-medium">{selectedLead.cidade}/{selectedLead.estado}</div>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-3">
                        <div className="text-gray-500 text-xs">Bairro</div>
                        <div className="mt-1 font-medium">{selectedLead.bairro || 'Não informado'}</div>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-3">
                        <div className="text-gray-500 text-xs">Status</div>
                        <div className="mt-1 font-medium capitalize">{selectedLead.status}</div>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg p-3">
                        <div className="text-gray-500 text-xs">Score</div>
                        <div className="mt-1 font-medium text-green-400">{selectedLead.score}</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Website</div>
                        {selectedLead.temSite && selectedLead.siteUrl ? (
                          <a href={selectedLead.siteUrl} target="_blank" rel="noreferrer" className="text-blue-400 break-all hover:underline">
                            {selectedLead.siteUrl}
                          </a>
                        ) : (
                          <span className="text-gray-400">Sem site cadastrado</span>
                        )}
                      </div>

                      <div>
                        <div className="text-gray-500 text-xs mb-1">Telefone</div>
                        <span className="text-gray-200">{selectedLead.telefone || 'Não informado'}</span>
                      </div>

                      <div>
                        <div className="text-gray-500 text-xs mb-1">Endereço</div>
                        <span className="text-gray-200">{selectedLead.endereco || 'Não informado'}</span>
                      </div>

                      <div>
                        <div className="text-gray-500 text-xs mb-1">Avaliação</div>
                        <span className="text-gray-200">{selectedLead.googleReviews || 0} reviews · {selectedLead.rating ? `${selectedLead.rating.toFixed(1)}★` : 'Sem nota'}</span>
                      </div>

                      <div>
                        <div className="text-gray-500 text-xs mb-1">Instagram</div>
                        <span className="text-gray-200">{selectedLead.instagram || 'Não informado'}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-800 pt-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Observações</div>
                      <p className="text-sm text-gray-300 whitespace-pre-line">{selectedLead.notas || 'Sem observações adicionais.'}</p>
                    </div>

                    <div className="border-t border-gray-800 pt-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">Atualizar status</div>
                      <div className="flex flex-wrap gap-2">
                        {(['novo', 'contatado', 'respondido', 'reuniao', 'fechado', 'perdido'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateLeadStatus(selectedLead.id, status)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${selectedLead.status === status ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400">Selecione um lead para ver os detalhes completos.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'generator' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">🤖 Gerador IA</h1>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400">Mensagens personalizadas para leads.</p>
              {leads[0] && (
                <div className="mt-4 bg-gray-800 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-line">
                  {generateMessage(leads[0])}
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">⚙️ Configurações</h1>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-gray-300">
              <p>Configuração da cidade, bairros e nichos do sistema.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
